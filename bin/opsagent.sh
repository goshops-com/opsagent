#!/bin/bash

# OpsAgent CLI - Daemon management script

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(dirname "$SCRIPT_DIR")"
APP_NAME="opsagent"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
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

# Start the daemon
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
    echo "  2. Run: $0 start"
}

# Run in foreground (for development)
run() {
    check_bun
    cd "$APP_DIR"
    echo -e "${YELLOW}Running OpsAgent in foreground...${NC}"
    bun run src/index.ts
}

# Show help
show_help() {
    echo "OpsAgent - AI-Powered System Monitor (Bun Runtime)"
    echo ""
    echo "Usage: $0 <command>"
    echo ""
    echo "Commands:"
    echo "  install     Install dependencies with Bun"
    echo "  start       Start the daemon (PM2)"
    echo "  stop        Stop the daemon"
    echo "  restart     Restart the daemon"
    echo "  status      Show daemon status"
    echo "  logs [n]    Show last n log lines (default: 100)"
    echo "  logs-live   Show live logs (follow mode)"
    echo "  run         Run in foreground (for development)"
    echo "  startup     Setup PM2 to start on system boot"
    echo "  help        Show this help"
    echo ""
    echo "Examples:"
    echo "  $0 install          # First-time setup"
    echo "  $0 start            # Start monitoring daemon"
    echo "  $0 run              # Run in foreground for testing"
    echo "  $0 logs 50          # Show last 50 log lines"
    echo "  $0 logs-live        # Follow logs in real-time"
}

# Main
case "${1:-help}" in
    install)
        install_deps
        ;;
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
