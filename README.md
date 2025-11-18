# Raspberry Pi Thermal Printer Proxy Server

This server acts as a bridge between a web service and a local Bluetooth thermal printer, allowing print commands from any device on the internet via a simple REST API.

This guide provides a complete, battle-tested walkthrough for setting up the server on a Raspberry Pi Zero 2 W with the **Raspberry Pi OS (Legacy) "Bullseye"** operating system.

## Part 1: Initial Raspberry Pi Setup (Headless)

This section covers preparing the Raspberry Pi from scratch without needing a monitor or keyboard.

### You Will Need:
- Raspberry Pi Zero 2 W
- A high-quality microSD card (16GB+)
- A microSD card reader for your main computer
- A 5V, 2.5A micro-USB power supply

### 1. Flash the Operating System
Use the official **Raspberry Pi Imager** tool on your Mac or PC.

1.  **Choose Device:** Raspberry Pi Zero 2 W.
2.  **Choose OS:** Select **"Raspberry Pi OS (other)"** > **"Raspberry Pi OS (Legacy, 64-bit) Lite"**. This "Bullseye" version is critical for hardware compatibility.
3.  **Choose Storage:** Select your microSD card.
4.  Click **Next** > **Edit Settings**.

### 2. Configure Before Boot
1.  **General Tab:**
    - Set a hostname (e.g., `printer-pi`).
    - Set a username and password.
    - Configure your Wi-Fi network credentials.
2.  **Services Tab:**
    - **Enable SSH**.
    - Select **"Allow public-key authentication only"**.
    - Paste your public SSH key (e.g., the contents of `~/.ssh/id_ed25519.pub`) into the text field.
3.  **Save** and **Write** the image to the card.

### 3. First Boot and SSH
1.  Insert the microSD card into the Pi and power it on.
2.  Wait a minute for it to boot and connect to your Wi-Fi.
3.  Connect via SSH from your computer:
    ```bash
    ssh your_username@printer-pi.local
    ```



## Part 2: Enabling Remote Access (Tailscale)

University networks like Eduroam often use "Client Isolation," which prevents you from connecting to your Pi via SSH even if you know its IP address. Tailscale creates a secure, private network for your devices that bypasses this restriction.

### 1. Create a Tailscale Account
On your main computer, sign up for a free account at [tailscale.com](https://tailscale.com).

### 2. Install Tailscale on your Main Computer
Download and install the Tailscale client for your Mac or PC from their website and log in.

### 3. Install Tailscale on the Raspberry Pi
Connect to your Pi (e.g., via a hotspot) to perform this one-time setup.

```bash
# Add the Tailscale package repository and its key
curl -fsSL https://pkgs.tailscale.com/stable/raspbian/bullseye.noarmor.gpg | sudo tee /usr/share/keyrings/tailscale-archive-keyring.gpg >/dev/null
curl -fsSL https://pkgs.tailscale.com/stable/raspbian/bullseye.tailscale-keyring.list | sudo tee /etc/apt/sources.list.d/tailscale.list

# Install Tailscale
sudo apt-get update
sudo apt-get install tailscale
```

### 4. Connect the Pi to Your Tailscale Network
Run the `tailscale up` command. This will generate a login URL.
```bash
sudo tailscale up
```
Open the URL in a browser on your main computer, log in, and authorize the Raspberry Pi.

### 5. Connect via Tailscale
From now on, you can connect to your Pi from any device logged into your Tailscale account, regardless of the Wi-Fi network.

1.  Find your Pi's permanent `100.x.x.x` IP address in the [Tailscale admin console](https://login.tailscale.com/admin/machines).
2.  Use that IP to connect:
    ```bash
    ssh your_username@100.X.X.X
    ```

## Part 3: Connecting to Enterprise Wi-Fi (Eduroam)

The Raspberry Pi OS "Bullseye" version uses `NetworkManager`. To connect to an enterprise network like Eduroam, you must create a specific connection profile.

### 1. SSH into the Pi
First, connect the Pi to a working network (like a phone hotspot or via Tailscale) to gain access.

### 2. Create the Eduroam Configuration File
Create and edit a new file for the connection profile:
```bash
sudo vim /etc/NetworkManager/system-connections/eduroam.nmconnection
```

### 3. Add the Connection Details
Paste the following content into the file. **Carefully replace** the `identity` and `password` with your own credentials. The `ca-cert` path is often required for BU's network.

```ini
[connection]
id=eduroam
type=wifi
autoconnect=true

[wifi]
ssid=eduroam
mode=infrastructure

[wifi-security]
key-mgmt=wpa-eap

[802-1x]
eap=peap
identity=yourBUlogin@bu.edu
password=YourPassword
phase2-auth=mschapv2
ca-cert=/etc/ssl/certs/USERTrust_RSA_Certification_Authority.pem

[ipv4]
method=auto

[ipv6]
method=auto
```


### 4. Set Permissions and Restart the Service
The configuration file must have strict permissions. After setting them, restart `NetworkManager` to load the new profile.

```bash
sudo chmod 600 /etc/NetworkManager/system-connections/eduroam.nmconnection
sudo systemctl restart NetworkManager
```

### 5. Activate the Connection
The Pi should now automatically connect to Eduroam if it's in range. You can manually trigger the connection with:
```bash
nmcli connection up eduroam
```
After this, the Pi will be on the Eduroam network, and you will need to find its new IP address to connect via SSH or use a reverse tunnel solution like Tailscale.

## Part 4: Server Environment Setup

Once connected to the Pi via SSH, prepare the environment for the Node.js server.

### 1. System Upgrade
Ensure all system packages, firmware, and drivers are up-to-date.
```bash
sudo apt-get update && sudo apt-get full-upgrade -y
```

### 2. Install Node.js (via NVM)
We will use NVM (Node Version Manager) to install a stable version of Node.js.
```bash
# Install NVM
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash

# Activate NVM
source ~/.bashrc

# Install and use Node.js v22 (or another recent LTS version)
nvm install 22
nvm use 22
```
### 3. Install System Dependencies
Install the required system libraries for Bluetooth and building native modules.
```bash
sudo apt-get install -y bluetooth bluez libbluetooth-dev libudev-dev libdbus-1-dev libgirepository1.0-dev git vim
```

### 4. Grant Bluetooth Permissions
The Node.js binary needs special permissions to access the Bluetooth hardware without `sudo`.
```bash
# Grant the cap_net_raw capability to the Node executable
sudo setcap cap_net_raw+eip $(eval readlink -f `which node`)
```
Your user must also be in the `bluetooth` group.
```bash
sudo usermod -a -G bluetooth $USER
```
**A reboot is required for this change to take effect.**
```bash
sudo reboot
```

## Part 5: Project Installation and Launch

After the Pi reboots and is online, SSH back in to install and run the server.

### 1. Clone Your Project
```bash
git clone https://github.com/KohkiHatori/printer-server.git
cd printer-server
```

### 2. Install Dependencies
This will install the correct `@abandonware/noble` library and compile it for the Pi.
```bash
npm install
```

### 3. Run the Server
```bash
npm run dev
```
The server will start on `http://localhost:3000`. You should see logs indicating that Bluetooth has powered on.

## Part 6: Usage

### 1. Connect to the Printer
From a second SSH session, run the following command. The server log should show a successful connection.
```bash
curl -X POST http://localhost:3000/api/connect
```

### 2. Check Status
```bash
curl -X GET http://localhost:3000/api/status
# Expected Output: {"server":"running","printer":"connected"}
```

### 3. Print Text
```bash
curl -X POST http://localhost:3000/api/print/text \
  -H "Content-Type: application/json" \
  -d '{"text": "Hello from the Pi!"}'
```

## Part 7: Exposing to the Internet (Cloudflare Tunnel)

To allow your public web service to send print jobs to your local server, you need to expose it to the internet. Cloudflare Tunnel is a free and secure way to do this without opening firewall ports.

### 1. Install `cloudflared` on the Raspberry Pi
In your SSH session, download the correct binary for the Raspberry Pi's ARM architecture and make it executable.

```bash
# Download the ARM binary for cloudflared
wget https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm

# Move the binary to a directory in your PATH and make it executable
sudo mv ./cloudflared-linux-arm /usr/local/bin/cloudflared
sudo chmod +x /usr/local/bin/cloudflared
```

### 2. Start the Tunnel
1.  In one SSH session, make sure your Node.js server is running:
    ```bash
    cd ~/printer-server
    npm run dev
    ```
2.  Open a **second SSH session** to your Raspberry Pi.
3.  In the new session, start the tunnel:
    ```bash
    cloudflared tunnel --url http://localhost:3000
    ```

### 3. Use the Public URL
Cloudflare will output a public URL (e.g., `https://random-words.trycloudflare.com`). Use this URL as the base for API requests from your web service. This tunnel will remain active as long as the `cloudflared` command is running.

## Part 8: Automating on Startup (systemd)

To make the server and tunnel run automatically every time the Pi boots, we will create `systemd` services.

### 1. Build the Node.js Server for Production
The `dev` command is for development. For a service, we should run the compiled JavaScript directly.
```bash
# Run this once from your project directory
cd ~/printer-server
npm run build
```

### 2. Create the Printer Server Service
1.  Create a new `systemd` unit file:
    ```bash
    sudo nano /etc/systemd/system/printer-server.service
    ```
2.  Paste the following configuration. **Update the `User`, `WorkingDirectory`, and `ExecStart` paths** to match your specific setup.
    ```ini
    [Unit]
    Description=Thermal Printer Proxy Server
    After=network-online.target

    [Service]
    Type=simple
    User=admin
    WorkingDirectory=/home/admin/printer-server
    ExecStart=/home/admin/.nvm/versions/node/v22.21.1/bin/node /home/admin/printer-server/dist/server.js
    Restart=on-failure
    RestartSec=10
    StandardOutput=journal
    StandardError=journal

    [Install]
    WantedBy=multi-user.target
    ```

### 3. Create the Cloudflare Tunnel Service
This assumes you have already configured a **Named Tunnel** as described in the main project `README.md`.

1.  Copy your user's `cloudflared` configuration to the system directory:
    ```bash
    # Ensure the target directory exists
    sudo mkdir -p /etc/cloudflared/

    # Copy the config file (use .yml or .yaml as appropriate)
    sudo cp /home/admin/.cloudflared/config.yml /etc/cloudflared/config.yml

    # Copy the tunnel credentials JSON file
    sudo cp /home/admin/.cloudflared/YOUR_TUNNEL_ID.json /etc/cloudflared/
    ```
2.  Install the service using the `cloudflared` command. This will automatically create the `cloudflared.service` file.
    ```bash
    sudo cloudflared service install
    ```

### 4. Enable and Start the Services
1.  Reload the `systemd` daemon to recognize the new files:
    ```bash
    sudo systemctl daemon-reload
    ```
2.  Enable both services to start on boot:
    ```bash
    sudo systemctl enable printer-server.service
    sudo systemctl enable cloudflared.service
    ```
3.  Start them now to test:
    ```bash
    sudo systemctl start printer-server.service
    sudo systemctl start cloudflared.service
    ```

### 5. Checking Logs
You can view the logs for either service using the `journalctl` command:
```bash
# View logs for the printer server
journalctl -u printer-server.service

# Follow the printer server logs in real-time
journalctl -fu printer-server.service
```
# printer-server
