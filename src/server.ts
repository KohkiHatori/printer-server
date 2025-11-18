import express from "express";
import cors from "cors";
import printer from "./bluetooth";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const connectToPrinter = async () => {
  try {
    console.log("Attempting to connect to the printer...");
    await printer.connect();
    console.log("✓ Successfully connected to the printer.");

    // Print a startup message
    const commands = [
      Buffer.from([0x1b, 0x40]), // Initialize printer
      Buffer.from([0x1b, 0x61, 1]), // Center alignment
      Buffer.from("Printer Ready!\n"),
      Buffer.from("----------------\n"),
      Buffer.from("Server is up and running.\n\n"),
      Buffer.from([0x1b, 0x64, 0x03]), // Feed paper
    ];
    await printer.write(Buffer.concat(commands));
    console.log("Startup message printed.");

  } catch (error: any) {
    console.error("Failed to connect to the printer:", error.message);
    console.log("Retrying in 10 seconds...");
    setTimeout(connectToPrinter, 10000); // Retry after 10 seconds
  }
};

// Status endpoint
app.get("/api/status", (req, res) => {
  res.json({
    server: "running",
    printer: printer.isConnected() ? "connected" : "disconnected",
  });
});

// Print text endpoint
app.post("/api/print/text", async (req, res) => {
  try {
    const { text, align = "left", bold = false } = req.body;

    const commands: Buffer[] = [];

    // Initialize
    commands.push(Buffer.from([0x1b, 0x40]));

    // Alignment
    const alignments = { left: 0, center: 1, right: 2 };
    commands.push(
      Buffer.from([0x1b, 0x61, alignments[align as keyof typeof alignments]]),
    );

    // Bold
    if (bold) commands.push(Buffer.from([0x1b, 0x45, 0x01]));

    // Text
    commands.push(Buffer.from(text + "\n"));

    // Feed
    commands.push(Buffer.from([0x1b, 0x64, 0x03]));

    await printer.write(Buffer.concat(commands));

    res.json({ success: true, message: "Text printed" });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Print QR code endpoint
app.post("/api/print/qr", async (req, res) => {
  try {
    const { data, size = 3 } = req.body;

    const qrData = Buffer.from(data);
    const commands = Buffer.concat([
      Buffer.from([0x1d, 0x28, 0x6b, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00]), // Model
      Buffer.from([0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x43, size]), // Size
      Buffer.from([0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x45, 0x30]), // Error correction
      Buffer.from([
        0x1d,
        0x28,
        0x6b,
        qrData.length + 3,
        0x00,
        0x31,
        0x50,
        0x30,
      ]), // Store data
      qrData,
      Buffer.from([0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x51, 0x30]), // Print
      Buffer.from([0x1b, 0x64, 0x03]), // Feed
    ]);

    await printer.write(commands);

    res.json({ success: true, message: "QR code printed" });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Print barcode endpoint
app.post("/api/print/barcode", async (req, res) => {
  try {
    const { data, type = 'CODE128' } = req.body;

    if (!data) {
      return res.status(400).json({ success: false, error: 'Barcode data is required' });
    }

    // GS h - Set Barcode Height (e.g., 50 dots)
    const setHeight = Buffer.from([0x1d, 0x68, 50]);
    // GS w - Set Barcode Width (e.g., 2 dots)
    const setWidth = Buffer.from([0x1d, 0x77, 2]);
    // GS H - Set Human-Readable-Interface (HRI) font position (2 = below)
    const setHri = Buffer.from([0x1d, 0x48, 2]);

    const barcodeTypes = {
      'UPC-A': 0x41,
      'UPC-E': 0x42,
      'EAN13': 0x43,
      'EAN8': 0x44,
      'CODE39': 0x45,
      'ITF': 0x46,
      'CODEBAR': 0x47,
      'CODE93': 0x48,
      'CODE128': 0x49,
    };

    const barcodeType = barcodeTypes[type as keyof typeof barcodeTypes];
    if (!barcodeType) {
      return res.status(400).json({ success: false, error: 'Invalid barcode type' });
    }

    const dataBuffer = Buffer.from(data);

    // GS k - Print Barcode command
    // Format: GS k <type> <data length> <data>
    const printBarcode = Buffer.concat([
      Buffer.from([0x1d, 0x6b, barcodeType, dataBuffer.length]),
      dataBuffer
    ]);

    const commands = Buffer.concat([
      setHeight,
      setWidth,
      setHri,
      printBarcode,
      Buffer.from('\n'), // Add a newline for spacing
    ]);

    await printer.write(commands);

    res.json({ success: true, message: "Barcode printed" });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`✓ Server running on http://localhost:${PORT}`);
  connectToPrinter(); // Start the connection process
  console.log(`  Status:  GET  /api/status`);
  console.log(`  Print:   POST /api/print/text`);
});
