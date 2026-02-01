#!/bin/bash

# OpsAgent Systemd Installation Script
# Run as root: sudo ./systemd/install.sh

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

INSTALL_DIR="/opt/opsagent"
SERVICE_USER="opsagent"

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    echo -e "${RED}Please run as root: sudo $0${NC}"
    exit 1
fi

# Check if Bun is installed
if ! command -v bun &>/dev/null; then
    echo -e "${YELLOW}Bun is not installed. Installing Bun...${NC}"
    curl -fsSL https://bun.sh/install | bash
    export BUN_INSTALL="$HOME/.bun"
    export PATH="$BUN_INSTALL/bin:$PATH"
    # Create symlink for system-wide access
    ln -sf "$HOME/.bun/bin/bun" /usr/local/bin/bun
fi

echo -e "${YELLOW}Installing OpsAgent as systemd service...${NC}"

# Create user if doesn't exist
if ! id "$SERVICE_USER" &>/dev/null; then
    echo "Creating user: $SERVICE_USER"
    useradd --system --no-create-home --shell /bin/false "$SERVICE_USER"
fi

# Create install directory
echo "Creating install directory: $INSTALL_DIR"
mkdir -p "$INSTALL_DIR"
mkdir -p "$INSTALL_DIR/logs"

# Copy files
echo "Copying files..."
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(dirname "$SCRIPT_DIR")"

cp -r "$APP_DIR/src" "$INSTALL_DIR/"
cp -r "$APP_DIR/config" "$INSTALL_DIR/"
cp -r "$APP_DIR/public" "$INSTALL_DIR/"
cp "$APP_DIR/package.json" "$INSTALL_DIR/"
[ -f "$APP_DIR/bun.lock" ] && cp "$APP_DIR/bun.lock" "$INSTALL_DIR/"

# Copy .env if exists, otherwise copy example
if [ -f "$APP_DIR/.env" ]; then
    cp "$APP_DIR/.env" "$INSTALL_DIR/"
else
    cp "$APP_DIR/.env.example" "$INSTALL_DIR/.env"
    echo -e "${YELLOW}Warning: Copied .env.example. Please edit $INSTALL_DIR/.env with your credentials.${NC}"
fi

# Install production dependencies
echo "Installing dependencies..."
cd "$INSTALL_DIR"
bun install --production

# Set ownership
echo "Setting permissions..."
chown -R "$SERVICE_USER:$SERVICE_USER" "$INSTALL_DIR"
chmod 600 "$INSTALL_DIR/.env"

# Install systemd service
echo "Installing systemd service..."
cp "$SCRIPT_DIR/opsagent.service" /etc/systemd/system/
systemctl daemon-reload

echo -e "${GREEN}Installation complete!${NC}"
echo ""
echo "Next steps:"
echo "  1. Edit configuration: sudo nano $INSTALL_DIR/.env"
echo "  2. Start the service: sudo systemctl start opsagent"
echo "  3. Enable on boot: sudo systemctl enable opsagent"
echo "  4. View logs: sudo journalctl -u opsagent -f"
echo ""
echo "Commands:"
echo "  sudo systemctl start opsagent    # Start"
echo "  sudo systemctl stop opsagent     # Stop"
echo "  sudo systemctl restart opsagent  # Restart"
echo "  sudo systemctl status opsagent   # Status"
echo "  sudo journalctl -u opsagent -f   # Follow logs"
