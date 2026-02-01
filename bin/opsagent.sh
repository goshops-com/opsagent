#!/bin/bash

# OpsAgent CLI - Daemon management script with NetData integration

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(dirname "$SCRIPT_DIR")"
APP_NAME="opsagent"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Check if Bun is installed
check_bun() {
    if ! command -v bun &> /dev/null; then
        echo -e "${RED}Bun is not installed.${NC}"
        echo "Install it with: curl -fsSL https://bun.sh/install | bash"
        exit 1
    fi
}

# Check if PM2 is installed
check_pm2() {
    if ! command -v pm2 &> /dev/null; then
        echo -e "${RED}PM2 is not installed.${NC}"
        echo "Install it with: bun install -g pm2"
        exit 1
    fi
}

# Check if NetData is installed
check_netdata() {
    if ! command -v netdata &> /dev/null; then
        return 1
    fi
    return 0
}

# Start the daemon (legacy mode)
start() {
    check_bun
    check_pm2
    cd "$APP_DIR"

    # Create logs directory
    mkdir -p logs

    # Check if already running
    if pm2 describe "$APP_NAME" &> /dev/null; then
        echo -e "${YELLOW}OpsAgent is already running. Use 'restart' to restart.${NC}"
        pm2 status "$APP_NAME"
        exit 0
    fi

    echo -e "${YELLOW}Starting OpsAgent daemon...${NC}"
    pm2 start ecosystem.config.cjs
    pm2 save
    echo -e "${GREEN}OpsAgent started.${NC}"
    pm2 status "$APP_NAME"
}

# Start with NetData integration
start_netdata() {
    check_bun
    check_pm2
    
    # Check if NetData is installed
    if ! check_netdata; then
        echo -e "${RED}NetData is not installed.${NC}"
        echo "Run '$0 netdata-install' to install NetData first."
        exit 1
    fi
    
    cd "$APP_DIR"

    # Create logs directory
    mkdir -p logs

    # Check if already running
    if pm2 describe "$APP_NAME" &> /dev/null; then
        echo -e "${YELLOW}OpsAgent is already running. Use 'restart' to restart.${NC}"
        pm2 status "$APP_NAME"
        exit 0
    fi

    echo -e "${BLUE}Starting OpsAgent with NetData integration...${NC}"
    pm2 start ecosystem.config.cjs --name "$APP_NAME" -- ./src/index-netdata.ts
    pm2 save
    echo -e "${GREEN}OpsAgent with NetData started.${NC}"
    echo ""
    echo -e "${BLUE}NetData Dashboard:${NC} http://localhost:19999"
    echo -e "${BLUE}OpsAgent Dashboard:${NC} http://localhost:3001"
    pm2 status "$APP_NAME"
}

# Stop the daemon
stop() {
    check_pm2
    cd "$APP_DIR"

    if ! pm2 describe "$APP_NAME" &> /dev/null; then
        echo -e "${YELLOW}OpsAgent is not running.${NC}"
        exit 0
    fi

    echo -e "${YELLOW}Stopping OpsAgent...${NC}"
    pm2 stop "$APP_NAME"
    pm2 delete "$APP_NAME"
    pm2 save
    echo -e "${GREEN}OpsAgent stopped.${NC}"
}

# Restart the daemon
restart() {
    check_bun
    check_pm2
    cd "$APP_DIR"

    if ! pm2 describe "$APP_NAME" &> /dev/null; then
        echo -e "${YELLOW}OpsAgent is not running. Starting...${NC}"
        start
        exit 0
    fi

    echo -e "${YELLOW}Restarting OpsAgent...${NC}"
    pm2 restart "$APP_NAME"
    echo -e "${GREEN}OpsAgent restarted.${NC}"
    pm2 status "$APP_NAME"
}

# Show status
status() {
    check_pm2
    pm2 status "$APP_NAME" 2>/dev/null || echo -e "${YELLOW}OpsAgent is not running.${NC}"
    
    # Also show NetData status if installed
    if check_netdata; then
        echo ""
        if curl -fs http://localhost:19999/api/v1/info &> /dev/null; then
            echo -e "${GREEN}NetData is running${NC} on http://localhost:19999"
        else
            echo -e "${YELLOW}NetData is installed but not responding${NC}"
        fi
    fi
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

# Setup PM2 to start on boot
setup_startup() {
    check_pm2
    echo -e "${YELLOW}Setting up PM2 startup script...${NC}"
    pm2 startup
    echo -e "${GREEN}Follow the instructions above to enable startup on boot.${NC}"
}

# Install dependencies
install_deps() {
    check_bun
    cd "$APP_DIR"
    echo -e "${YELLOW}Installing dependencies with Bun...${NC}"
    bun install
    echo -e "${GREEN}Dependencies installed.${NC}"

    echo ""
    echo -e "${GREEN}Installation complete!${NC}"
    echo ""
    echo "Next steps:"
    echo "  1. Copy .env.example to .env and configure your credentials"
    echo "  2. Choose your mode:"
    echo "     - Legacy mode: Run '$0 start' (uses systeminformation)"
    echo "     - NetData mode: Run '$0 netdata-install && $0 start-netdata'"
}

# Run in foreground (for development)
run() {
    check_bun
    cd "$APP_DIR"
    echo -e "${YELLOW}Running OpsAgent in foreground...${NC}"
    bun run src/index.ts
}

# Run with NetData in foreground (for development)
run_netdata() {
    check_bun
    cd "$APP_DIR"
    
    # Check if NetData is installed
    if ! check_netdata; then
        echo -e "${RED}NetData is not installed.${NC}"
        echo "Run '$0 netdata-install' to install NetData first."
        exit 1
    fi
    
    echo -e "${BLUE}Running OpsAgent with NetData integration in foreground...${NC}"
    bun run src/index-netdata.ts
}

# ==================== NETDATA COMMANDS ====================

# Install NetData
netdata_install() {
    echo -e "${BLUE}Installing NetData for OpsAgent...${NC}"
    
    if check_netdata; then
        echo -e "${GREEN}NetData is already installed.${NC}"
    fi
    
    cd "$APP_DIR"
    bash "$SCRIPT_DIR/../scripts/install-netdata.sh" "$@"
}

# Check NetData status
netdata_status() {
    if ! check_netdata; then
        echo -e "${RED}NetData is not installed.${NC}"
        return 1
    fi
    
    echo -e "${BLUE}NetData Status:${NC}"
    
    # Check if running
    if curl -fs http://localhost:19999/api/v1/info &> /dev/null; then
        echo -e "${GREEN}● Running${NC}"
        
        # Get version
        VERSION=$(curl -fs http://localhost:19999/api/v1/info 2>/dev/null | grep -o '"version":"[^"]*"' | cut -d'"' -f4)
        echo "  Version: $VERSION"
        
        # Get active alerts
        ALERTS=$(curl -fs http://localhost:19999/api/v1/alarms 2>/dev/null | wc -l)
        echo "  Active alerts: $ALERTS"
        
        echo ""
        echo "Dashboard URLs:"
        echo "  ${BLUE}NetData:${NC} http://localhost:19999"
        echo "  ${BLUE}OpsAgent:${NC} http://localhost:3001"
    else
        echo -e "${RED}● Not running${NC}"
        echo "  Try starting it: systemctl start netdata"
    fi
}

# Show NetData logs
netdata_logs() {
    if command -v journalctl &> /dev/null; then
        journalctl -u netdata -n "${1:-50}" --no-pager
    else
        echo -e "${YELLOW}journalctl not available. Checking log files...${NC}"
        if [ -f /var/log/netdata/error.log ]; then
            tail -n "${1:-50}" /var/log/netdata/error.log
        elif [ -f "$HOME/.netdata/var/log/netdata/error.log" ]; then
            tail -n "${1:-50}" "$HOME/.netdata/var/log/netdata/error.log"
        else
            echo -e "${RED}NetData log files not found.${NC}"
        fi
    fi
}

# Configure NetData
netdata_config() {
    echo -e "${BLUE}Opening NetData configuration...${NC}"
    
    if [ -d /etc/netdata ]; then
        echo "Config directory: /etc/netdata"
        ls -la /etc/netdata/
    elif [ -d "$HOME/.netdata/etc/netdata" ]; then
        echo "Config directory: $HOME/.netdata/etc/netdata"
        ls -la "$HOME/.netdata/etc/netdata/"
    else
        echo -e "${RED}NetData config directory not found.${NC}"
    fi
}

# Reload NetData health configuration
netdata_reload() {
    echo -e "${YELLOW}Reloading NetData health configuration...${NC}"
    
    if command -v netdatacli &> /dev/null; then
        netdatacli reload-health
        echo -e "${GREEN}Health configuration reloaded.${NC}"
    else
        # Try sending USR2 signal
        if pgrep netdata &> /dev/null; then
            killall -USR2 netdata
            echo -e "${GREEN}Health configuration reloaded (via signal).${NC}"
        else
            echo -e "${RED}NetData is not running.${NC}"
        fi
    fi
}

# Show help
show_help() {
    echo "OpsAgent - AI-Powered System Monitor with NetData Integration"
    echo ""
    echo "Usage: $0 <command> [options]"
    echo ""
    echo "${GREEN}Legacy Mode Commands (built-in collector):${NC}"
    echo "  install        Install dependencies with Bun"
    echo "  start          Start the daemon (PM2) - legacy mode"
    echo "  run            Run in foreground - legacy mode"
    echo ""
    echo "${BLUE}NetData Mode Commands (recommended):${NC}"
    echo "  netdata-install [opts]  Install and configure NetData"
    echo "  start-netdata           Start with NetData integration"
    echo "  run-netdata             Run with NetData in foreground"
    echo "  netdata-status          Check NetData status"
    echo "  netdata-logs [n]        Show NetData logs (default: 50 lines)"
    echo "  netdata-config          Show NetData config location"
    echo "  netdata-reload          Reload NetData health config"
    echo ""
    echo "${YELLOW}General Commands:${NC}"
    echo "  stop           Stop the daemon"
    echo "  restart        Restart the daemon"
    echo "  status         Show daemon and NetData status"
    echo "  logs [n]       Show last n log lines (default: 100)"
    echo "  logs-live      Show live logs (follow mode)"
    echo "  startup        Setup PM2 to start on system boot"
    echo "  help           Show this help"
    echo ""
    echo "NetData Install Options:"
    echo "  --port PORT         Set NetData port (default: 19999)"
    echo "  --user-only         Install in user mode (no root)"
    echo "  --no-start          Don't start NetData after install"
    echo ""
    echo "Examples:"
    echo "  $0 netdata-install              # Install NetData (recommended)"
    echo "  $0 start-netdata                # Start with NetData"
    echo "  $0 netdata-status               # Check NetData status"
    echo "  $0 netdata-logs 100             # Show last 100 NetData log lines"
    echo ""
    echo "Docker Compose (NetData + OpsAgent):"
    echo "  docker compose -f docker-compose.netdata.yml up -d"
}

# Main
case "${1:-help}" in
    # Legacy mode commands
    install)
        install_deps
        ;;
    start)
        start
        ;;
    run)
        run
        ;;
    
    # NetData mode commands
    netdata-install)
        shift
        netdata_install "$@"
        ;;
    start-netdata)
        start_netdata
        ;;
    run-netdata)
        run_netdata
        ;;
    netdata-status)
        netdata_status
        ;;
    netdata-logs)
        netdata_logs "$2"
        ;;
    netdata-config)
        netdata_config
        ;;
    netdata-reload)
        netdata_reload
        ;;
    
    # General commands
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
    startup)
        setup_startup
        ;;
    help|--help|-h)
        show_help
        ;;
    *)
        echo -e "${RED}Unknown command: $1${NC}"
        echo ""
        show_help
        exit 1
        ;;
esac
