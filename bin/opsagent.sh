#!/bin/bash

# OpsAgent CLI - AI-powered monitoring with NetData
# https://github.com/sjcotto/opsagent

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(dirname "$SCRIPT_DIR")"
APP_NAME="opsagent"

# Colors (using $'...' syntax for portability)
RED=$'\033[0;31m'
GREEN=$'\033[0;32m'
YELLOW=$'\033[1;33m'
BLUE=$'\033[0;34m'
CYAN=$'\033[0;36m'
BOLD=$'\033[1m'
NC=$'\033[0m' # No Color

# Check if Bun is installed
check_bun() {
    if ! command -v bun &> /dev/null; then
        echo "${RED}Bun is not installed.${NC}"
        echo "Install it with: curl -fsSL https://bun.sh/install | bash"
        exit 1
    fi
}

# Check if PM2 is installed
check_pm2() {
    if ! command -v pm2 &> /dev/null; then
        echo "${RED}PM2 is not installed.${NC}"
        echo "Install it with: bun install -g pm2"
        exit 1
    fi
}

# Check if NetData is installed and running
check_netdata() {
    if curl -fs http://localhost:19999/api/v1/info &> /dev/null; then
        return 0
    fi
    return 1
}

# Check if NetData binary is installed
is_netdata_installed() {
    if command -v netdata &> /dev/null; then
        return 0
    fi
    return 1
}

# =============================================================================
# MAIN COMMANDS
# =============================================================================

# Start the daemon
start() {
    check_bun
    check_pm2

    # Check if NetData is running
    if ! check_netdata; then
        echo "${YELLOW}Warning: NetData is not running on http://localhost:19999${NC}"
        echo ""
        if ! is_netdata_installed; then
            echo "NetData is not installed. Install it with:"
            echo "  ${CYAN}opsagent setup${NC}"
            echo ""
            read -p "Continue anyway? [y/N] " continue_anyway
            if [[ ! "$continue_anyway" =~ ^[Yy] ]]; then
                exit 1
            fi
        else
            echo "Try starting NetData:"
            echo "  ${CYAN}sudo systemctl start netdata${NC}"
            echo ""
        fi
    fi

    cd "$APP_DIR"

    # Create logs directory
    mkdir -p logs

    # Check if already running
    if pm2 describe "$APP_NAME" &> /dev/null; then
        echo "${YELLOW}OpsAgent is already running. Use 'restart' to restart.${NC}"
        pm2 status "$APP_NAME"
        exit 0
    fi

    echo "${GREEN}Starting OpsAgent...${NC}"
    pm2 start ecosystem.config.cjs
    pm2 save

    echo ""
    echo "${GREEN}OpsAgent started successfully!${NC}"
    echo ""
    echo "Dashboards:"
    echo "  ${CYAN}NetData:${NC}   http://localhost:19999"
    echo "  ${CYAN}OpsAgent:${NC}  http://localhost:3001"
    echo ""
    pm2 status "$APP_NAME"
}

# Stop the daemon
stop() {
    check_pm2
    cd "$APP_DIR"

    if ! pm2 describe "$APP_NAME" &> /dev/null; then
        echo "${YELLOW}OpsAgent is not running.${NC}"
        exit 0
    fi

    echo "${YELLOW}Stopping OpsAgent...${NC}"
    pm2 stop "$APP_NAME"
    pm2 delete "$APP_NAME"
    pm2 save
    echo "${GREEN}OpsAgent stopped.${NC}"
}

# Restart the daemon
restart() {
    check_bun
    check_pm2
    cd "$APP_DIR"

    if ! pm2 describe "$APP_NAME" &> /dev/null; then
        echo "${YELLOW}OpsAgent is not running. Starting...${NC}"
        start
        exit 0
    fi

    echo "${YELLOW}Restarting OpsAgent...${NC}"
    pm2 restart "$APP_NAME"
    echo "${GREEN}OpsAgent restarted.${NC}"
    pm2 status "$APP_NAME"
}

# Show status
status() {
    echo "${BOLD}OpsAgent Status${NC}"
    echo ""

    # OpsAgent status
    if command -v pm2 &> /dev/null; then
        if pm2 describe "$APP_NAME" &> /dev/null; then
            echo "${GREEN}● OpsAgent is running${NC}"
            pm2 status "$APP_NAME" 2>/dev/null | tail -n +4
        else
            echo "${YELLOW}○ OpsAgent is not running${NC}"
        fi
    else
        echo "${RED}○ PM2 is not installed${NC}"
    fi

    echo ""

    # NetData status
    if check_netdata; then
        VERSION=$(curl -fs http://localhost:19999/api/v1/info 2>/dev/null | grep -o '"version":"[^"]*"' | cut -d'"' -f4)
        ALERTS=$(curl -fs http://localhost:19999/api/v1/alarms 2>/dev/null | grep -c '"status"' || echo "0")
        echo "${GREEN}● NetData is running${NC} (v${VERSION})"
        echo "  Active alerts: ${ALERTS}"
    elif is_netdata_installed; then
        echo "${YELLOW}○ NetData is installed but not running${NC}"
        echo "  Start with: sudo systemctl start netdata"
    else
        echo "${RED}○ NetData is not installed${NC}"
        echo "  Install with: opsagent setup"
    fi

    echo ""
    echo "Dashboards:"
    echo "  ${CYAN}NetData:${NC}   http://localhost:19999"
    echo "  ${CYAN}OpsAgent:${NC}  http://localhost:3001"
}

# Show logs
logs() {
    check_pm2
    pm2 logs "$APP_NAME" --lines "${1:-100}"
}

# Show live logs
logs_live() {
    check_pm2
    pm2 logs "$APP_NAME"
}

# Run in foreground (for development)
run() {
    check_bun
    cd "$APP_DIR"

    if ! check_netdata; then
        echo "${YELLOW}Warning: NetData is not running on http://localhost:19999${NC}"
        echo ""
    fi

    echo "${GREEN}Running OpsAgent in foreground...${NC}"
    echo "Press Ctrl+C to stop"
    echo ""
    bun run src/index.ts
}

# Setup PM2 to start on boot
setup_startup() {
    check_pm2
    echo "${YELLOW}Setting up PM2 startup script...${NC}"
    pm2 startup
    echo "${GREEN}Follow the instructions above to enable startup on boot.${NC}"
}

# Install dependencies
install_deps() {
    check_bun
    cd "$APP_DIR"
    echo "${YELLOW}Installing dependencies...${NC}"
    bun install
    echo "${GREEN}Dependencies installed.${NC}"
}

# =============================================================================
# NETDATA COMMANDS
# =============================================================================

# Full setup (NetData + dependencies)
setup() {
    echo "${BOLD}OpsAgent Setup${NC}"
    echo ""

    # Install dependencies
    install_deps

    echo ""

    # Install NetData if not present
    if ! is_netdata_installed; then
        echo "${YELLOW}Installing NetData...${NC}"
        cd "$APP_DIR"
        bash "$APP_DIR/scripts/install-netdata.sh" "$@"
    else
        echo "${GREEN}NetData is already installed.${NC}"

        # Start NetData if not running
        if ! check_netdata; then
            echo "${YELLOW}Starting NetData...${NC}"
            if command -v systemctl &> /dev/null; then
                sudo systemctl start netdata || true
            fi
        fi
    fi

    echo ""
    echo "${GREEN}Setup complete!${NC}"
    echo ""
    echo "Next steps:"
    echo "  1. Edit ${CYAN}~/.opsagent/.env${NC} with your API keys"
    echo "  2. Run ${CYAN}opsagent start${NC}"
}

# Check NetData status
netdata_status() {
    if ! is_netdata_installed; then
        echo "${RED}NetData is not installed.${NC}"
        echo "Install with: opsagent setup"
        return 1
    fi

    echo "${BOLD}NetData Status${NC}"
    echo ""

    if check_netdata; then
        VERSION=$(curl -fs http://localhost:19999/api/v1/info 2>/dev/null | grep -o '"version":"[^"]*"' | cut -d'"' -f4)
        echo "${GREEN}● Running${NC} (v${VERSION})"

        # Get active alerts
        ALERTS=$(curl -fs http://localhost:19999/api/v1/alarms 2>/dev/null | grep -c '"status"' || echo "0")
        echo "  Active alerts: ${ALERTS}"

        echo ""
        echo "Dashboard: ${CYAN}http://localhost:19999${NC}"
    else
        echo "${RED}● Not running${NC}"
        echo ""
        echo "Start with:"
        echo "  ${CYAN}sudo systemctl start netdata${NC}"
    fi
}

# Show NetData logs
netdata_logs() {
    if command -v journalctl &> /dev/null; then
        journalctl -u netdata -n "${1:-50}" --no-pager
    else
        echo "${YELLOW}journalctl not available. Checking log files...${NC}"
        if [ -f /var/log/netdata/error.log ]; then
            tail -n "${1:-50}" /var/log/netdata/error.log
        elif [ -f "$HOME/.netdata/var/log/netdata/error.log" ]; then
            tail -n "${1:-50}" "$HOME/.netdata/var/log/netdata/error.log"
        else
            echo "${RED}NetData log files not found.${NC}"
        fi
    fi
}

# Reload NetData health configuration
netdata_reload() {
    echo "${YELLOW}Reloading NetData health configuration...${NC}"

    if command -v netdatacli &> /dev/null; then
        netdatacli reload-health
        echo "${GREEN}Health configuration reloaded.${NC}"
    else
        if pgrep netdata &> /dev/null; then
            killall -USR2 netdata 2>/dev/null || sudo killall -USR2 netdata
            echo "${GREEN}Health configuration reloaded.${NC}"
        else
            echo "${RED}NetData is not running.${NC}"
        fi
    fi
}

# =============================================================================
# HELP
# =============================================================================

show_help() {
    echo "${BOLD}OpsAgent${NC} - AI-Powered System Monitoring"
    echo ""
    echo "OpsAgent monitors your systems using NetData and uses AI to analyze"
    echo "alerts and recommend remediation actions."
    echo ""
    echo "${BOLD}Usage:${NC} opsagent <command> [options]"
    echo ""
    echo "${BOLD}Commands:${NC}"
    echo "  ${GREEN}start${NC}          Start the OpsAgent daemon"
    echo "  ${GREEN}stop${NC}           Stop the OpsAgent daemon"
    echo "  ${GREEN}restart${NC}        Restart the OpsAgent daemon"
    echo "  ${GREEN}status${NC}         Show OpsAgent and NetData status"
    echo "  ${GREEN}logs${NC} [n]       Show last n log lines (default: 100)"
    echo "  ${GREEN}logs-live${NC}      Follow logs in real-time"
    echo "  ${GREEN}run${NC}            Run in foreground (development)"
    echo ""
    echo "${BOLD}Setup:${NC}"
    echo "  ${CYAN}setup${NC}          Install NetData and dependencies"
    echo "  ${CYAN}startup${NC}        Enable auto-start on boot"
    echo ""
    echo "${BOLD}NetData:${NC}"
    echo "  ${BLUE}netdata-status${NC}   Check NetData status"
    echo "  ${BLUE}netdata-logs${NC}     Show NetData logs"
    echo "  ${BLUE}netdata-reload${NC}   Reload NetData alert configuration"
    echo ""
    echo "${BOLD}Examples:${NC}"
    echo "  opsagent setup          # First-time setup"
    echo "  opsagent start          # Start monitoring"
    echo "  opsagent status         # Check everything is running"
    echo "  opsagent logs-live      # Watch logs"
    echo ""
    echo "${BOLD}Dashboards:${NC}"
    echo "  NetData:   http://localhost:19999"
    echo "  OpsAgent:  http://localhost:3001"
}

# =============================================================================
# MAIN
# =============================================================================

case "${1:-help}" in
    # Main commands
    start)
        start
        ;;
    stop)
        stop
        ;;
    restart)
        restart
        ;;
    status)
        status
        ;;
    logs)
        logs "$2"
        ;;
    logs-live)
        logs_live
        ;;
    run)
        run
        ;;

    # Setup commands
    setup|install)
        shift
        setup "$@"
        ;;
    startup)
        setup_startup
        ;;

    # NetData commands
    netdata-status)
        netdata_status
        ;;
    netdata-logs)
        netdata_logs "$2"
        ;;
    netdata-reload)
        netdata_reload
        ;;

    # Help
    help|--help|-h)
        show_help
        ;;
    *)
        echo "${RED}Unknown command: $1${NC}"
        echo ""
        show_help
        exit 1
        ;;
esac
