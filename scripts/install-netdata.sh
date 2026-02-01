#!/bin/bash

# NetData Installer for OpsAgent
# This script installs and configures NetData to work with OpsAgent

set -e

NETDATA_VERSION="stable"
NETDATA_PORT=${NETDATA_PORT:-19999}
OPSAGENT_CONFIG_DIR=${OPSAGENT_CONFIG_DIR:-"/etc/opsagent"}

echo "🔧 OpsAgent NetData Installer"
echo "=============================="

# Check if running as root for system-wide install
if [ "$EUID" -ne 0 ] && [ -z "$INSTALL_USER_ONLY" ]; then 
    echo "⚠️  Warning: Not running as root. Installing in user mode..."
    export INSTALL_USER_ONLY=1
fi

# Function to install NetData
install_netdata() {
    echo "📦 Checking NetData installation..."
    
    if command -v netdata &> /dev/null; then
        if [ -n "$FORCE_REINSTALL" ]; then
            echo "⚠️  NetData is already installed, but --force flag provided"
            echo "   Reinstalling NetData..."
        else
            echo "✅ NetData is already installed (skipping installation)"
            echo "   Version: $(netdata --version 2>/dev/null || echo 'unknown')"
            echo "   Use --force to reinstall if needed"
            return 0
        fi
    else
        echo "📦 NetData not found. Installing..."
    fi
    
    # Install NetData using the official one-line installer
    if [ -n "$INSTALL_USER_ONLY" ]; then
        # User-mode installation
        echo "   Installing NetData in user mode..."
        curl -fsSL https://get.netdata.cloud/kickstart.sh | bash -s -- --no-updates --stable-channel --disable-telemetry ${FORCE_REINSTALL:+--reinstall}
    else
        # System installation
        echo "   Installing NetData system-wide..."
        curl -fsSL https://get.netdata.cloud/kickstart.sh | bash -s -- --no-updates --stable-channel --disable-telemetry ${FORCE_REINSTALL:+--reinstall}
    fi
    
    echo "✅ NetData installed successfully"
}

# Function to configure NetData for OpsAgent
configure_netdata() {
    echo "⚙️  Configuring NetData for OpsAgent..."
    
    NETDATA_CONFIG_DIR="/etc/netdata"
    if [ -n "$INSTALL_USER_ONLY" ]; then
        NETDATA_CONFIG_DIR="$HOME/.netdata/etc/netdata"
    fi
    
    # Create health.d directory if it doesn't exist
    mkdir -p "$NETDATA_CONFIG_DIR/health.d"
    
    # Configure NetData health alerts to work well with OpsAgent
    # Enable all alerts but we'll handle the logic in OpsAgent
    cat > "$NETDATA_CONFIG_DIR/health.d/opsagent.conf" << 'EOF'
# OpsAgent Integration Configuration
# These alerts are optimized for OpsAgent AI remediation

# Ensure critical alerts are raised immediately
# OpsAgent will handle the AI analysis and remediation

# Example: Lower default thresholds to get more alerts for AI to analyze
# You can customize these or use NetData defaults

# CPU Alert
alarm: opsagent_cpu_usage
    on: system.cpu
lookup: average -1m unaligned of user,system,softirq,irq,guest
  units: %
  every: 30s
   warn: $this > 75
   crit: $this > 90
   info: CPU utilization is high - OpsAgent will analyze and remediate
     to: sysadmin

# Memory Alert
alarm: opsagent_ram_usage
    on: system.ram
lookup: average -1m unaligned percentage of used
  units: %
  every: 30s
   warn: $this > 75
   crit: $this > 90
   info: RAM utilization is high - OpsAgent will analyze and remediate
     to: sysadmin

# Disk Alert
alarm: opsagent_disk_usage
    on: disk.space
lookup: average -1m unaligned percentage of used
  units: %
  every: 60s
   warn: $this > 80
   crit: $this > 95
   info: Disk space is running low - OpsAgent will analyze and remediate
     to: sysadmin

# Load Average Alert
alarm: opsagent_load_average
    on: system.load
lookup: average -1m unaligned of load1
  units: load
  every: 30s
   warn: $this > $load.cores * 0.8
   crit: $this > $load.cores * 1.5
   info: System load is high - OpsAgent will analyze and remediate
     to: sysadmin

# Network Errors Alert
alarm: opsagent_network_errors
    on: net.errors
lookup: sum -1m unaligned absolute
  units: errors
  every: 30s
   warn: $this > 10
   crit: $this > 100
   info: Network errors detected - OpsAgent will analyze and remediate
     to: sysadmin
EOF

    # Configure NetData to expose API properly
    cat > "$NETDATA_CONFIG_DIR/netdata.conf" << EOF
[global]
    run as user = netdata
    history = 86400
    update every = 1
    debug log = syslog
    error log = syslog
    access log = none

[web]
    allow netdata.conf from = localhost
    allow dashboard from = localhost
    allow badges from = localhost
    allow streaming from = localhost
    allow api from = localhost ${OPSAGENT_ALLOW_API:-}
    bind to = ${NETDATA_BIND:-*}:${NETDATA_PORT}
    mode = multi-threaded
    disconnect idle clients after seconds = 3600
    respect do not track policy = no
    x-frame-options response header = 

[health]
    enabled = yes
    health log retention = 30d
    in memory max health log entries = 1000

[plugins]
    idlejitter = no
    netdata monitoring = yes
    perf = yes
    slabinfo = no
    spigotmc = no
    python.d = yes
    charts.d = no
    node.d = yes
    apps = yes
    proc = yes
    tc = yes
EOF

    echo "✅ NetData configured for OpsAgent"
}

# Function to create OpsAgent-NetData integration config
create_opsagent_config() {
    echo "📝 Creating OpsAgent configuration..."
    
    mkdir -p "$OPSAGENT_CONFIG_DIR"
    
    cat > "$OPSAGENT_CONFIG_DIR/netdata.yaml" << EOF
# OpsAgent NetData Integration Configuration

netdata:
  # NetData API endpoint
  url: "http://localhost:${NETDATA_PORT}"
  
  # Polling interval for alerts (seconds)
  pollInterval: 30
  
  # Alert severity to monitor
  # Options: warning, critical, all
  monitorSeverity: "warning"
  
  # Acknowledge NetData alerts after OpsAgent processes them
  # This prevents duplicate notifications
  acknowledgeAlerts: true
  
  # Map NetData alerts to OpsAgent severity
  severityMapping:
    warning: "warning"
    critical: "critical"
    clear: "resolved"
  
  # Alert names to ignore (regex patterns)
  ignoreAlerts:
    - "test.*"
    - ".*_debug"
  
  # Alert names to force include even if acknowledged
  forceAlerts:
    - ".*disk_full.*"
    - ".*oom.*"

# OpsAgent configuration
opsagent:
  # Auto-execute safe actions
  autoRemediate: false
  
  # AI model to use
  model: "kimi-k2.5"
  
  # Discord notifications
  discord:
    enabled: true
    webhookUrl: "\${DISCORD_WEBHOOK_URL}"
    notifyOnCritical: true
    notifyOnAgentAction: true

# Dashboard configuration
dashboard:
  enabled: true
  port: 3001
EOF

    echo "✅ OpsAgent configuration created at $OPSAGENT_CONFIG_DIR/netdata.yaml"
}

# Function to start NetData
start_netdata() {
    echo "🚀 Starting NetData..."
    
    if command -v systemctl &> /dev/null && [ -z "$INSTALL_USER_ONLY" ]; then
        # Systemd available
        systemctl restart netdata || systemctl start netdata
        systemctl enable netdata
        echo "✅ NetData started via systemd"
    elif command -v service &> /dev/null && [ -z "$INSTALL_USER_ONLY" ]; then
        # Init.d available
        service netdata restart || service netdata start
        echo "✅ NetData started via init.d"
    else
        # User mode or no init system
        echo "Please start NetData manually:"
        echo "  netdata -D"
        echo "Or for user mode:"
        echo "  ~/.netdata/netdata-installer.sh --start"
    fi
}

# Function to verify installation
verify_installation() {
    echo "🔍 Verifying installation..."
    
    # Check NetData is running
    if curl -fs "http://localhost:${NETDATA_PORT}/api/v1/info" > /dev/null 2>&1; then
        echo "✅ NetData is running on port ${NETDATA_PORT}"
        
        # Get NetData version
        VERSION=$(curl -fs "http://localhost:${NETDATA_PORT}/api/v1/info" | grep -o '"version":"[^"]*"' | cut -d'"' -f4)
        echo "   Version: $VERSION"
    else
        echo "⚠️  NetData is not responding on port ${NETDATA_PORT}"
        echo "   Check the logs: journalctl -u netdata -f"
        return 1
    fi
    
    # Check OpsAgent config
    if [ -f "$OPSAGENT_CONFIG_DIR/netdata.yaml" ]; then
        echo "✅ OpsAgent configuration found"
    else
        echo "⚠️  OpsAgent configuration not found"
        return 1
    fi
    
    echo ""
    echo "🎉 Installation complete!"
    echo ""
    echo "Next steps:"
    echo "  1. Configure your environment variables:"
    echo "     export DISCORD_WEBHOOK_URL=your-webhook-url"
    echo "     export OPENCODE_API_KEY=your-opencode-key"
    echo "     export TURSO_DATABASE_URL=your-turso-url"
    echo "     export TURSO_AUTH_TOKEN=your-turso-token"
    echo ""
    echo "  2. Start OpsAgent:"
    echo "     ./bin/opsagent.sh start"
    echo ""
    echo "  3. Access NetData dashboard:"
    echo "     http://localhost:${NETDATA_PORT}"
    echo ""
    echo "  4. Access OpsAgent dashboard:"
    echo "     http://localhost:3001"
    echo ""
}

# Main installation flow
main() {
    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            --version)
                NETDATA_VERSION="$2"
                shift 2
                ;;
            --port)
                NETDATA_PORT="$2"
                shift 2
                ;;
            --user-only)
                INSTALL_USER_ONLY=1
                shift
                ;;
            --force)
                FORCE_REINSTALL=1
                shift
                ;;
            --no-start)
                NO_START=1
                shift
                ;;
            --help)
                echo "Usage: $0 [OPTIONS]"
                echo ""
                echo "Options:"
                echo "  --version VERSION    Install specific NetData version (default: stable)"
                echo "  --port PORT          Set NetData port (default: 19999)"
                echo "  --user-only          Install in user mode (no root required)"
                echo "  --force              Force reinstallation even if NetData exists"
                echo "  --no-start           Don't start NetData after installation"
                echo "  --help               Show this help message"
                echo ""
                echo "Examples:"
                echo "  $0                                    # Install NetData (skip if exists)"
                echo "  $0 --force                            # Force reinstall NetData"
                echo "  $0 --user-only                        # Install in user mode"
                echo "  $0 --port 19999 --no-start            # Configure but don't start"
                exit 0
                ;;
            *)
                echo "Unknown option: $1"
                exit 1
                ;;
        esac
    done
    
    echo ""
    install_netdata
    configure_netdata
    create_opsagent_config
    
    if [ -z "$NO_START" ]; then
        start_netdata
    fi
    
    verify_installation
}

# Run main function
main "$@"
