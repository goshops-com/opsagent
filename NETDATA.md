# OpsAgent + NetData Integration

This document describes the NetData integration for OpsAgent, which leverages NetData's 800+ collectors and battle-tested metrics collection while adding OpsAgent's unique AI-powered auto-remediation capabilities.

## Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    NetData Agent (port 19999)                  │
│  • Collects 800+ metrics (system, apps, databases, etc.)       │
│  • Built-in health alerts and ML anomaly detection             │
│  • Historical data retention                                   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼ HTTP API (poll /api/v1/alarms)
┌─────────────────────────────────────────────────────────────────┐
│                    OpsAgent                                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │ Alert        │  │ AI Agent     │  │ Auto-Remediation     │  │
│  │ Listener     │→ │ (OpenCode)   │→ │ (safe actions)       │  │
│  └──────────────┘  └──────────────┘  └──────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
              ┌──────────────┼──────────────┐
              ▼              ▼              ▼
       ┌────────────┐ ┌────────────┐ ┌────────────┐
       │  Discord   │ │   Turso    │ │ Dashboard  │
       │   Alerts   │ │    DB      │ │   (3001)   │
       └────────────┘ └────────────┘ └────────────┘
```

## Benefits

1. **800+ Instant Integrations** - PostgreSQL, Redis, Nginx, Docker, and more
2. **ML Anomaly Detection** - Built-in unsupervised machine learning
3. **Battle-Tested Collectors** - Optimized C code, not JavaScript
4. **Historical Data** - 1+ year retention, not just real-time
5. **Keep Your Differentiator** - AI auto-remediation is still unique to OpsAgent

## Quick Start

### Option 1: Native Installation

```bash
# Install NetData and OpsAgent
./bin/opsagent.sh netdata-install

# Start OpsAgent with NetData
./bin/opsagent.sh start-netdata
```

### Option 2: Docker Compose (Recommended for Testing)

```bash
# Clone the repository
git clone https://github.com/sjcotto/opsagent.git
cd opsagent

# Create environment file
cat > .env << EOF
OPENCODE_API_KEY=your-opencode-key
DISCORD_WEBHOOK_URL=your-discord-webhook
TURSO_DATABASE_URL=your-turso-url
TURSO_AUTH_TOKEN=your-turso-token
SERVER_NAME=docker-test
EOF

# Start with Docker Compose
docker compose -f docker-compose.netdata.yml up -d

# Or use the npm script
npm run docker:netdata

# View logs
npm run docker:netdata:logs
```

### Access Dashboards

- **NetData Dashboard**: http://localhost:19999
- **OpsAgent Dashboard**: http://localhost:3001

## Configuration

### NetData Configuration

The integration uses a YAML configuration file (`config/netdata.yaml`):

```yaml
netdata:
  # NetData API endpoint
  url: "http://localhost:19999"
  
  # Polling interval (seconds)
  pollInterval: 30
  
  # Which alerts to monitor
  monitorSeverity: "warning"  # Options: warning, critical, all
  
  # Acknowledge NetData alerts after OpsAgent processes them
  acknowledgeAlerts: true
  
  # Map NetData severity to OpsAgent severity
  severityMapping:
    warning: "warning"
    critical: "critical"
    clear: "resolved"
  
  # Alert name patterns to ignore (regex)
  ignoreAlerts:
    - "test.*"
    - ".*_debug"
  
  # Alert name patterns to force-include
  forceAlerts:
    - ".*disk_full.*"
    - ".*oom.*"

opsagent:
  # Auto-execute safe actions
  autoRemediate: false
  
  # AI model
  model: "kimi-k2.5"

discord:
  enabled: true
  webhookUrl: "${DISCORD_WEBHOOK_URL}"
  notifyOnCritical: true
  notifyOnAgentAction: true

dashboard:
  enabled: true
  port: 3001
```

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `OPENCODE_API_KEY` | Yes | OpenCode API key for AI agent |
| `DISCORD_WEBHOOK_URL` | No | Discord webhook for notifications |
| `TURSO_DATABASE_URL` | No | Turso database for multi-server storage |
| `TURSO_AUTH_TOKEN` | No | Turso authentication token |
| `SERVER_NAME` | No | Custom server name |
| `NETDATA_URL` | No | NetData URL (default: http://localhost:19999) |

## Architecture

### How It Works

1. **NetData Collects Metrics**
   - Runs as a separate service on port 19999
   - Collects system, application, and service metrics
   - Evaluates health alerts based on configuration

2. **OpsAgent Polls Alerts**
   - Every 30 seconds (configurable), queries `http://netdata:19999/api/v1/alarms`
   - Detects new, changed, and cleared alerts
   - Filters by severity and ignore patterns

3. **AI Agent Analyzes**
   - Sends alert context to OpenCode AI (kimi-k2.5)
   - AI determines if auto-remediation is safe
   - Recommends actions (kill process, restart service, notify human)

4. **Actions Executed**
   - Safe actions run automatically (if `autoRemediate: true`)
   - Risky actions require human approval via Discord
   - All actions logged to Turso database

5. **Notifications Sent**
   - Discord notifications for critical alerts
   - Dashboard updates via WebSocket
   - Alert resolution notifications

## CLI Commands

### NetData-Specific Commands

```bash
# Install NetData
./bin/opsagent.sh netdata-install

# Install with custom options
./bin/opsagent.sh netdata-install --port 19999 --user-only

# Check NetData status
./bin/opsagent.sh netdata-status

# View NetData logs
./bin/opsagent.sh netdata-logs
./bin/opsagent.sh netdata-logs 100  # Last 100 lines

# Reload NetData health config
./bin/opsagent.sh netdata-reload

# Show NetData config location
./bin/opsagent.sh netdata-config

# Start OpsAgent with NetData
./bin/opsagent.sh start-netdata

# Run with NetData in foreground (development)
./bin/opsagent.sh run-netdata
```

### General Commands

```bash
# Stop OpsAgent
./bin/opsagent.sh stop

# Restart
./bin/opsagent.sh restart

# Check status
./bin/opsagent.sh status

# View logs
./bin/opsagent.sh logs
./bin/opsagent.sh logs-live
```

## Supported Integrations

With NetData, you instantly get monitoring for:

### System Metrics
- CPU, memory, disk, network
- Load average, I/O wait, temperature
- File descriptors, processes

### Databases
- PostgreSQL, MySQL, MongoDB, Redis
- Query performance, connections, replication

### Web Servers
- Nginx, Apache, HAProxy
- Request rates, response codes, latency

### Containers & Orchestration
- Docker containers, Kubernetes
- Container resource usage, pod health

### Applications
- Node.js, Python, Java, Go
- Custom application metrics via StatsD

### Services
- Systemd, Cron, Postfix
- System services health

See [NetData Integrations](https://www.netdata.cloud/integrations/) for the full list.

## Custom Alert Configuration

You can customize NetData's built-in alerts or create new ones:

```bash
# Edit health configuration
sudo ./edit-config health.d/cpu.conf

# Reload health config
sudo netdatacli reload-health
```

Example custom alert:

```yaml
alarm: custom_app_errors
    on: nginx.requests
lookup: sum -5m unaligned of bad_requests
  units: requests
  every: 1m
   warn: $this > 10
   crit: $this > 50
   info: High number of bad requests detected
     to: sysadmin
```

## Development

### Running Tests

```bash
# Run all tests
bun test

# Run specific test file
bun test tests/collector/netdata.test.ts
```

### Building

```bash
# Build legacy mode
bun run build

# Build NetData mode
bun run build:netdata
```

## Troubleshooting

### NetData Not Responding

```bash
# Check if NetData is running
curl http://localhost:19999/api/v1/info

# Check NetData logs
./bin/opsagent.sh netdata-logs

# Restart NetData
sudo systemctl restart netdata
```

### OpsAgent Not Connecting to NetData

1. Check the URL in `config/netdata.yaml`
2. Verify NetData is accessible from OpsAgent container (if using Docker)
3. Check firewall rules

### No Alerts Being Detected

1. Check NetData has active alerts:
   ```bash
   curl http://localhost:19999/api/v1/alarms
   ```

2. Verify `monitorSeverity` setting in config
3. Check if alerts are being filtered by `ignoreAlerts`

## Migration from Legacy Mode

If you're currently using the legacy (systeminformation) mode:

1. Install NetData:
   ```bash
   ./bin/opsagent.sh netdata-install
   ```

2. Stop legacy mode:
   ```bash
   ./bin/opsagent.sh stop
   ```

3. Start NetData mode:
   ```bash
   ./bin/opsagent.sh start-netdata
   ```

4. Update your configuration from `config/default.yaml` to `config/netdata.yaml`

## Docker Compose Services

The `docker-compose.netdata.yml` includes:

- **netdata**: NetData agent (port 19999)
- **opsagent**: OpsAgent with NetData integration (port 3001)
- **postgres**: PostgreSQL for testing database monitoring
- **redis**: Redis for testing cache monitoring
- **nginx**: Nginx for testing web server monitoring

## Contributing

When adding features to the NetData integration:

1. Update `src/collector/netdata.ts` for alert collection
2. Update `src/config/netdata-loader.ts` for configuration
3. Update `src/index-netdata.ts` for the main logic
4. Add tests in `tests/collector/netdata.test.ts`
5. Update this documentation

## License

MIT License - see LICENSE file for details.
