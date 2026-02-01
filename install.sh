#!/usr/bin/env bash
#
# OpsAgent Installer
# AI-Powered System Monitoring with Automated Remediation
#
# Usage: curl -fsSL https://raw.githubusercontent.com/sjcotto/opsagent/main/install.sh | bash
#
# Options (via environment variables):
#   OPSAGENT_DIR        Installation directory (default: ~/.opsagent)
#   OPSAGENT_NO_START   Skip starting the daemon after install (default: false)
#   OPSAGENT_BRANCH     Git branch to install (default: main)
#

set -euo pipefail

# =============================================================================
# Configuration
# =============================================================================

INSTALL_DIR="${OPSAGENT_DIR:-$HOME/.opsagent}"
BRANCH="${OPSAGENT_BRANCH:-main}"
REPO_URL="https://github.com/sjcotto/opsagent.git"
VERSION="1.0.0"

# =============================================================================
# Colors and Output Helpers
# =============================================================================

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m' # No Color

# Cross-platform sed -i (macOS vs Linux)
sed_inplace() {
    if [[ "$OS" == "darwin" ]]; then
        sed -i '' "$@"
    else
        sed -i "$@"
    fi
}

# Unicode characters (with fallback for non-unicode terminals)
if [[ "${TERM:-}" != "dumb" ]] && [[ -z "${NO_COLOR:-}" ]]; then
    CHECK="✓"
    CROSS="✗"
    ARROW="→"
    BULLET="•"
else
    CHECK="[OK]"
    CROSS="[X]"
    ARROW="->"
    BULLET="*"
fi

print_banner() {
    echo -e "${CYAN}"
    cat << 'EOF'

   ___             _                    _
  / _ \ _ __  ___ /_\   __ _  ___ _ __ | |_
 | | | | '_ \/ __//_\\/ _` |/ _ \ '_ \| __|
 | |_| | |_) \__ /  _  \ (_| |  __/ | | | |_
  \___/| .__/|___\_/ \_/\__, |\___|_| |_|\__|
       |_|              |___/

EOF
    echo -e "${NC}"
    echo -e "${DIM}  AI-Powered System Monitoring v${VERSION}${NC}"
    echo ""
}

info() {
    echo -e "${BLUE}${BULLET}${NC} $1"
}

success() {
    echo -e "${GREEN}${CHECK}${NC} $1"
}

warn() {
    echo -e "${YELLOW}!${NC} $1"
}

error() {
    echo -e "${RED}${CROSS}${NC} $1" >&2
}

step() {
    echo -e "\n${BOLD}${ARROW} $1${NC}"
}

# =============================================================================
# System Detection
# =============================================================================

detect_os() {
    case "$(uname -s)" in
        Linux*)  OS="linux";;
        Darwin*) OS="darwin";;
        MINGW*|MSYS*|CYGWIN*) OS="windows";;
        *)       OS="unknown";;
    esac

    case "$(uname -m)" in
        x86_64|amd64)  ARCH="x64";;
        arm64|aarch64) ARCH="arm64";;
        armv7*)        ARCH="armv7";;
        *)             ARCH="unknown";;
    esac
}

check_requirements() {
    step "Checking requirements"

    # Check git
    if ! command -v git &> /dev/null; then
        error "git is not installed"
        echo "  Install git first:"
        if [[ "$OS" == "darwin" ]]; then
            echo "    xcode-select --install"
        elif [[ "$OS" == "linux" ]]; then
            echo "    sudo apt install git  # Debian/Ubuntu"
            echo "    sudo yum install git  # CentOS/RHEL"
        fi
        exit 1
    fi
    success "git is installed"

    # Check curl
    if ! command -v curl &> /dev/null; then
        error "curl is not installed"
        exit 1
    fi
    success "curl is installed"
}

# =============================================================================
# Bun Installation
# =============================================================================

install_bun() {
    if command -v bun &> /dev/null; then
        local bun_version=$(bun --version 2>/dev/null || echo "unknown")
        success "Bun is already installed (v${bun_version})"
        return 0
    fi

    step "Installing Bun runtime"
    info "Bun is a fast JavaScript runtime (replaces Node.js)"

    if [[ "$OS" == "windows" ]]; then
        error "Windows is not supported. Use WSL2 instead."
        exit 1
    fi

    # Install Bun
    curl -fsSL https://bun.sh/install | bash

    # Source the updated profile to get bun in PATH
    export BUN_INSTALL="$HOME/.bun"
    export PATH="$BUN_INSTALL/bin:$PATH"

    if command -v bun &> /dev/null; then
        success "Bun installed successfully (v$(bun --version))"
    else
        error "Failed to install Bun. Please install manually: https://bun.sh"
        exit 1
    fi
}

# =============================================================================
# PM2 Installation
# =============================================================================

install_pm2() {
    if command -v pm2 &> /dev/null; then
        success "PM2 is already installed"
        return 0
    fi

    step "Installing PM2 (process manager)"

    bun install -g pm2

    if command -v pm2 &> /dev/null; then
        success "PM2 installed successfully"
    else
        # PM2 might be installed but not in PATH yet
        export PATH="$HOME/.bun/bin:$PATH"
        if command -v pm2 &> /dev/null; then
            success "PM2 installed successfully"
        else
            warn "PM2 installed but may require a new terminal session"
        fi
    fi
}

# =============================================================================
# NetData Installation
# =============================================================================

check_netdata_running() {
    if curl -fs http://localhost:19999/api/v1/info &> /dev/null; then
        return 0
    fi
    return 1
}

is_netdata_installed() {
    if command -v netdata &> /dev/null; then
        return 0
    fi
    # Also check common install locations
    if [[ -f "$HOME/.netdata/netdata-installer.sh" ]] || [[ -f "/usr/sbin/netdata" ]]; then
        return 0
    fi
    return 1
}

install_netdata() {
    step "Installing NetData (metrics collector)"

    if is_netdata_installed; then
        if check_netdata_running; then
            local version=$(curl -fs http://localhost:19999/api/v1/info 2>/dev/null | grep -o '"version":"[^"]*"' | cut -d'"' -f4 || echo "unknown")
            success "NetData is already installed and running (v${version})"
        else
            success "NetData is already installed"
            info "Start it with: sudo systemctl start netdata"
        fi
        return 0
    fi

    info "NetData provides real-time system metrics and alerting"
    info "Installing from https://get.netdata.cloud..."
    echo ""

    # Determine install mode based on permissions
    local netdata_args="--no-updates --stable-channel --disable-telemetry"

    if [[ "$EUID" -ne 0 ]] && ! command -v sudo &> /dev/null; then
        warn "Installing NetData in user mode (no root access)"
        netdata_args="$netdata_args --dont-wait"
    fi

    # Install NetData using the official installer
    if curl -fsSL https://get.netdata.cloud/kickstart.sh | bash -s -- $netdata_args; then
        success "NetData installed successfully"

        # Try to start NetData if systemctl is available
        if command -v systemctl &> /dev/null; then
            info "Starting NetData service..."
            sudo systemctl start netdata 2>/dev/null || true
            sudo systemctl enable netdata 2>/dev/null || true
        fi

        # Verify it's running
        sleep 2
        if check_netdata_running; then
            local version=$(curl -fs http://localhost:19999/api/v1/info 2>/dev/null | grep -o '"version":"[^"]*"' | cut -d'"' -f4 || echo "unknown")
            success "NetData is running (v${version})"
            info "Dashboard: http://localhost:19999"
        else
            warn "NetData installed but not running yet"
            info "Start it manually: sudo systemctl start netdata"
        fi
    else
        warn "NetData installation failed - you can install it later with: opsagent setup"
    fi
}

# =============================================================================
# OpsAgent Installation
# =============================================================================

install_opsagent() {
    step "Installing OpsAgent"

    if [[ -d "$INSTALL_DIR" ]]; then
        info "Existing installation found at $INSTALL_DIR"
        info "Updating to latest version..."
        cd "$INSTALL_DIR"
        git fetch origin
        git reset --hard "origin/${BRANCH}"
    else
        info "Cloning repository..."
        git clone --depth 1 --branch "$BRANCH" "$REPO_URL" "$INSTALL_DIR"
        cd "$INSTALL_DIR"
    fi

    success "Repository cloned to $INSTALL_DIR"

    # Make scripts executable
    chmod +x "$INSTALL_DIR/bin/"*.sh
    chmod +x "$INSTALL_DIR/scripts/"*.sh 2>/dev/null || true

    # Create opsagent command wrapper (if not exists)
    if [[ ! -f "$INSTALL_DIR/bin/opsagent" ]]; then
        cat > "$INSTALL_DIR/bin/opsagent" << 'WRAPPER'
#!/usr/bin/env bash
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec "$SCRIPT_DIR/opsagent.sh" "$@"
WRAPPER
        chmod +x "$INSTALL_DIR/bin/opsagent"
    fi

    # Install dependencies
    info "Installing dependencies..."
    bun install

    # Create logs directory
    mkdir -p logs

    success "Dependencies installed"
}

# =============================================================================
# Installation Mode Selection
# =============================================================================

INSTALL_MODE="${OPSAGENT_MODE:-}"  # agent, panel, both

select_install_mode() {
    # Skip if mode already set via environment
    if [[ -n "$INSTALL_MODE" ]]; then
        return 0
    fi

    # Skip if non-interactive
    if [[ ! -t 0 ]]; then
        INSTALL_MODE="agent"
        return 0
    fi

    step "Select installation mode"
    echo ""
    echo -e "  ${BOLD}1)${NC} Agent only      ${DIM}- Monitor this server, report to a control panel${NC}"
    echo -e "  ${BOLD}2)${NC} Control Panel   ${DIM}- Central dashboard to view all agents${NC}"
    echo -e "  ${BOLD}3)${NC} Both            ${DIM}- Full installation (agent + control panel)${NC}"
    echo ""
    read -p "  Select mode [1-3] (default: 1): " mode_choice

    case "${mode_choice:-1}" in
        1) INSTALL_MODE="agent";;
        2) INSTALL_MODE="panel";;
        3) INSTALL_MODE="both";;
        *) INSTALL_MODE="agent";;
    esac

    success "Installation mode: $INSTALL_MODE"
}

# =============================================================================
# Configuration
# =============================================================================

setup_config() {
    step "Setting up configuration"

    local env_file="$INSTALL_DIR/.env"

    if [[ -f "$env_file" ]]; then
        success "Configuration file already exists"
        return 0
    fi

    # Copy example config
    cp "$INSTALL_DIR/.env.example" "$env_file"

    # Check if we're in interactive mode
    if [[ -t 0 ]]; then
        echo ""
        info "Let's configure OpsAgent (press Enter to skip optional fields)"
        echo ""

        # For agent or both: ask for OpenCode API Key
        if [[ "$INSTALL_MODE" == "agent" ]] || [[ "$INSTALL_MODE" == "both" ]]; then
            echo -e "${BOLD}OpenCode API Key${NC} ${DIM}(required for AI analysis)${NC}"
            echo -e "${DIM}Get yours at: https://opencode.ai${NC}"
            read -p "  API Key: " opencode_key
            if [[ -n "$opencode_key" ]]; then
                sed_inplace "s|OPENCODE_API_KEY=.*|OPENCODE_API_KEY=${opencode_key}|" "$env_file"
            fi
            echo ""
        fi

        # For agent mode: ask for Control Panel URL
        if [[ "$INSTALL_MODE" == "agent" ]]; then
            echo -e "${BOLD}Control Panel URL${NC} ${DIM}(optional, to connect to a central dashboard)${NC}"
            echo -e "${DIM}Example: http://your-server:3002${NC}"
            read -p "  Control Panel URL: " panel_url
            if [[ -n "$panel_url" ]]; then
                # Enable Control Panel URL and comment out Turso
                sed_inplace "s|# CONTROL_PANEL_URL=.*|CONTROL_PANEL_URL=${panel_url}|" "$env_file"
                sed_inplace "s|^TURSO_DATABASE_URL=|# TURSO_DATABASE_URL=|" "$env_file"
                sed_inplace "s|^TURSO_AUTH_TOKEN=|# TURSO_AUTH_TOKEN=|" "$env_file"
                success "Agent will connect to control panel at ${panel_url}"
            else
                echo ""
                # If no control panel, ask for Turso for direct DB mode
                echo -e "${BOLD}Turso Database${NC} ${DIM}(optional, for standalone multi-server support)${NC}"
                echo -e "${DIM}Create a database at: https://turso.tech${NC}"
                read -p "  Database URL: " turso_url
                if [[ -n "$turso_url" ]]; then
                    sed_inplace "s|TURSO_DATABASE_URL=.*|TURSO_DATABASE_URL=${turso_url}|" "$env_file"
                    read -p "  Auth Token: " turso_token
                    if [[ -n "$turso_token" ]]; then
                        sed_inplace "s|TURSO_AUTH_TOKEN=.*|TURSO_AUTH_TOKEN=${turso_token}|" "$env_file"
                    fi
                fi
            fi
            echo ""
        fi

        # For panel or both: ask for Turso (required)
        if [[ "$INSTALL_MODE" == "panel" ]] || [[ "$INSTALL_MODE" == "both" ]]; then
            echo -e "${BOLD}Turso Database${NC} ${DIM}(required for control panel)${NC}"
            echo -e "${DIM}Create a database at: https://turso.tech${NC}"
            read -p "  Database URL: " turso_url
            if [[ -n "$turso_url" ]]; then
                sed_inplace "s|TURSO_DATABASE_URL=.*|TURSO_DATABASE_URL=${turso_url}|" "$env_file"
                read -p "  Auth Token: " turso_token
                if [[ -n "$turso_token" ]]; then
                    sed_inplace "s|TURSO_AUTH_TOKEN=.*|TURSO_AUTH_TOKEN=${turso_token}|" "$env_file"
                fi
            else
                warn "Turso database is required for control panel"
            fi
            echo ""
        fi

        # Discord Webhook (optional for all modes)
        echo -e "${BOLD}Discord Webhook${NC} ${DIM}(optional, for notifications)${NC}"
        read -p "  Webhook URL: " discord_url
        if [[ -n "$discord_url" ]]; then
            sed_inplace "s|DISCORD_WEBHOOK_URL=.*|DISCORD_WEBHOOK_URL=${discord_url}|" "$env_file"
        fi

        echo ""
        success "Configuration saved to $env_file"
    else
        warn "Non-interactive mode: Using default configuration"
        info "Edit $env_file to add your API keys"
    fi
}

# =============================================================================
# Shell Integration
# =============================================================================

setup_shell() {
    step "Setting up shell integration"

    local shell_rc=""
    local shell_name=""

    # Detect shell
    case "${SHELL:-}" in
        */zsh)  shell_rc="$HOME/.zshrc"; shell_name="zsh";;
        */bash) shell_rc="$HOME/.bashrc"; shell_name="bash";;
        *)      shell_rc="$HOME/.profile"; shell_name="shell";;
    esac

    # Check if already configured
    if grep -q "OPSAGENT_HOME" "$shell_rc" 2>/dev/null; then
        success "Shell already configured"
        return 0
    fi

    # Add to shell rc
    cat >> "$shell_rc" << EOF

# OpsAgent
export OPSAGENT_HOME="$INSTALL_DIR"
export PATH="\$OPSAGENT_HOME/bin:\$PATH"
EOF

    success "Added OpsAgent to $shell_name PATH"
    info "Run 'source $shell_rc' or start a new terminal"
}

# =============================================================================
# Completion Message
# =============================================================================

print_success() {
    echo ""
    echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${GREEN}${CHECK} OpsAgent installed successfully!${NC}"
    echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    echo -e "${BOLD}Installation directory:${NC} $INSTALL_DIR"
    echo -e "${BOLD}Installation mode:${NC} $INSTALL_MODE"
    echo ""

    if [[ "$INSTALL_MODE" == "agent" ]] || [[ "$INSTALL_MODE" == "both" ]]; then
        echo -e "${BOLD}Agent commands:${NC}"
        echo ""
        echo -e "  ${CYAN}# Start the monitoring agent${NC}"
        echo -e "  opsagent start"
        echo ""
        echo -e "  ${CYAN}# Check status${NC}"
        echo -e "  opsagent status"
        echo ""
        echo -e "  ${CYAN}# View logs${NC}"
        echo -e "  opsagent logs"
        echo ""
        echo -e "${BOLD}Dashboards:${NC}"
        echo -e "  ${CYAN}NetData:${NC}   http://localhost:19999  ${DIM}(system metrics)${NC}"
        echo -e "  ${CYAN}OpsAgent:${NC}  http://localhost:3001   ${DIM}(AI analysis)${NC}"
        echo ""
    fi

    if [[ "$INSTALL_MODE" == "panel" ]] || [[ "$INSTALL_MODE" == "both" ]]; then
        echo -e "${BOLD}Control Panel commands:${NC}"
        echo ""
        echo -e "  ${CYAN}# Start the control panel${NC}"
        echo -e "  cd $INSTALL_DIR && bun run panel"
        echo ""
        echo -e "  ${CYAN}# Control panel URL${NC}"
        echo -e "  open http://localhost:3002"
        echo ""
        if [[ "$INSTALL_MODE" == "panel" ]]; then
            echo -e "${BOLD}Connect agents:${NC}"
            echo -e "  ${DIM}On each server you want to monitor, install the agent:${NC}"
            echo -e "  OPSAGENT_MODE=agent curl -fsSL https://raw.githubusercontent.com/sjcotto/opsagent/main/install.sh | bash"
            echo -e "  ${DIM}Then set CONTROL_PANEL_URL=http://$(hostname):3002 in the agent's .env${NC}"
            echo ""
        fi
    fi

    echo -e "${BOLD}Configuration:${NC}"
    echo -e "  ${DIM}Edit $INSTALL_DIR/.env to update settings${NC}"
    echo ""
    echo -e "${BOLD}Documentation:${NC}"
    echo -e "  ${DIM}https://github.com/sjcotto/opsagent#readme${NC}"
    echo ""

    # Remind about sourcing shell
    if [[ -n "${SHELL:-}" ]]; then
        local shell_rc=""
        case "$SHELL" in
            */zsh)  shell_rc="$HOME/.zshrc";;
            */bash) shell_rc="$HOME/.bashrc";;
            *)      shell_rc="$HOME/.profile";;
        esac
        echo -e "${YELLOW}Note:${NC} Run this to use opsagent in current terminal:"
        echo -e "  source $shell_rc"
        echo ""
    fi
}

# =============================================================================
# Main
# =============================================================================

main() {
    print_banner

    detect_os
    info "Detected: $OS ($ARCH)"

    select_install_mode
    check_requirements
    install_bun
    install_pm2
    install_opsagent

    # Install NetData for agent or both mode
    if [[ "$INSTALL_MODE" == "agent" ]] || [[ "$INSTALL_MODE" == "both" ]]; then
        install_netdata
    fi

    setup_config
    setup_shell

    print_success

    # Optionally start based on mode
    if [[ -z "${OPSAGENT_NO_START:-}" ]] && [[ -t 0 ]]; then
        echo ""
        if [[ "$INSTALL_MODE" == "agent" ]] || [[ "$INSTALL_MODE" == "both" ]]; then
            read -p "Start OpsAgent agent now? [Y/n] " start_now
            if [[ -z "$start_now" ]] || [[ "$start_now" =~ ^[Yy] ]]; then
                echo ""
                cd "$INSTALL_DIR"
                export PATH="$INSTALL_DIR/bin:$HOME/.bun/bin:$PATH"
                ./bin/opsagent.sh start
            fi
        fi
        if [[ "$INSTALL_MODE" == "panel" ]]; then
            read -p "Start Control Panel now? [Y/n] " start_panel
            if [[ -z "$start_panel" ]] || [[ "$start_panel" =~ ^[Yy] ]]; then
                echo ""
                cd "$INSTALL_DIR"
                export PATH="$HOME/.bun/bin:$PATH"
                info "Starting control panel on http://localhost:3002..."
                bun run panel
            fi
        fi
    fi
}

main "$@"
