// FINAL WORKING VERSION
import noble from '@abandonware/noble';

// --- CORRECTED SERVICE AND CHARACTERISTIC UUIDs ---
const PRINTER_SERVICE = "e7810a7173ae499d8c15faa9aef0c3f2";
const PRINTER_ADDRESS = "5a:4a:f4:00:0b:bf";

class BluetoothPrinter {
  private peripheral: noble.Peripheral | null = null;
  private characteristic: noble.Characteristic | null = null;

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      let timeout: NodeJS.Timeout | null = null;
      let onDiscover: ((p: noble.Peripheral) => void) | null = null;
      let onStateChange: ((s: string) => void) | null = null;

      const cleanup = () => {
        if (timeout) clearTimeout(timeout);
        if (onDiscover) noble.removeListener('discover', onDiscover);
        if (onStateChange) noble.removeListener('stateChange', onStateChange);
        noble.stopScanning();
      };

      timeout = setTimeout(() => {
        cleanup();
        reject(new Error('Connection timed out after 20 seconds.'));
      }, 20000); // 20 second timeout

      onDiscover = (peripheral: noble.Peripheral) => {
        if (peripheral.address.toLowerCase() !== PRINTER_ADDRESS.toLowerCase()) {
          return; // Not our printer
        }

        cleanup();
        console.log(`Found printer: ${peripheral.address}. Attempting to connect...`);
        this.peripheral = peripheral;

        peripheral.on('disconnect', () => {
          console.log('Printer disconnected.');
          this.peripheral = null;
          this.characteristic = null;
        });

        peripheral.connect(error => {
          if (error) {
            return reject(error);
          }

          console.log('Connected. Discovering services...');
          peripheral.discoverServices([PRINTER_SERVICE], (error, services) => {
            if (error || services.length === 0) {
              return reject(error || new Error('Printer service not found after connect'));
            }

            const service = services[0];
            console.log('Found service. Discovering characteristics...');

            service.discoverCharacteristics([], (error, characteristics) => {
              if (error || characteristics.length === 0) {
                return reject(error || new Error('No characteristics found for the printer service.'));
              }

              // Since we expect only one, let's grab the first one.
              this.characteristic = characteristics[0];
              console.log(`Discovered characteristic: UUID=${this.characteristic.uuid}, Properties=${this.characteristic.properties.join(', ')}`);
              console.log(`✓ Successfully connected to characteristic ${this.characteristic.uuid}. Ready to print.`);
              resolve();
            });
          });
        });
      };

      onStateChange = (state: string) => {
        if (state === 'poweredOn') {
          console.log('Bluetooth powered on. Scanning for printer...');
          noble.startScanning([], true); // General scan is better for discovery
        } else {
          console.log('Bluetooth state changed to:', state);
          noble.stopScanning();
        }
      };

      noble.on('stateChange', onStateChange);
      noble.on('discover', onDiscover);

      if (noble._state === 'poweredOn') {
        onStateChange('poweredOn');
      } else {
        console.log('Waiting for Bluetooth to power on...');
      }
    });
  }

  async write(data: Buffer): Promise<void> {
    if (!this.characteristic) {
      throw new Error("Not connected to a characteristic");
    }
    return new Promise((resolve, reject) => {
      this.characteristic!.write(data, true, (error) => {
        if (error) {
          return reject(error);
        }
        resolve();
      });
    });
  }

  async disconnect(): Promise<void> {
    if (!this.peripheral) {
      return;
    }
    return new Promise((resolve) => {
      this.peripheral!.disconnect(() => {
        this.peripheral = null;
        this.characteristic = null;
        resolve();
      });
    });
  }

  isConnected(): boolean {
    return this.peripheral?.state === 'connected';
  }
}

export default new BluetoothPrinter();
