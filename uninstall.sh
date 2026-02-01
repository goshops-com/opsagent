#!/usr/bin/env bash
#
# OpsAgent Uninstaller
#
# Usage: curl -fsSL https://raw.githubusercontent.com/sjcotto/opsagent/main/uninstall.sh | bash
#

set -euo pipefail

INSTALL_DIR="${OPSAGENT_HOME:-$HOME/.opsagent}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BOLD='\033[1m'
NC='\033[0m'

echo -e "${BOLD}OpsAgent Uninstaller${NC}"
echo ""

# Stop daemon if running
if command -v pm2 &> /dev/null; then
    if pm2 describe opsagent &> /dev/null; then
        echo -e "${YELLOW}Stopping OpsAgent daemon...${NC}"
        pm2 stop opsagent 2>/dev/null || true
        pm2 delete opsagent 2>/dev/null || true
        pm2 save 2>/dev/null || true
        echo -e "${GREEN}Daemon stopped${NC}"
    fi
fi

# Remove installation directory
if [[ -d "$INSTALL_DIR" ]]; then
    echo -e "${YELLOW}Removing $INSTALL_DIR...${NC}"
    rm -rf "$INSTALL_DIR"
    echo -e "${GREEN}Installation directory removed${NC}"
else
    echo "Installation directory not found at $INSTALL_DIR"
fi

# Clean up shell configuration
for rc_file in "$HOME/.bashrc" "$HOME/.zshrc" "$HOME/.profile"; do
    if [[ -f "$rc_file" ]] && grep -q "OPSAGENT_HOME" "$rc_file"; then
        echo -e "${YELLOW}Cleaning up $rc_file...${NC}"
        # Remove OpsAgent block
        if [[ "$(uname)" == "Darwin" ]]; then
            sed -i '' '/# OpsAgent/,/export PATH=.*OPSAGENT/d' "$rc_file"
        else
            sed -i '/# OpsAgent/,/export PATH=.*OPSAGENT/d' "$rc_file"
        fi
        echo -e "${GREEN}Shell configuration cleaned${NC}"
    fi
done

echo ""
echo -e "${GREEN}OpsAgent has been uninstalled.${NC}"
echo ""
echo "Note: Bun and PM2 were not removed. To remove them:"
echo "  rm -rf ~/.bun"
echo "  npm uninstall -g pm2  # or: bun remove -g pm2"
