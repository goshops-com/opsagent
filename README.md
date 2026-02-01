# OpsAgent - AI-Powered System Monitor

An intelligent system monitoring daemon that detects problems using deterministic rules and invokes an AI agent to analyze issues and recommend remediation actions. Designed for multi-server deployments with centralized data storage.

**Powered by [Bun](https://bun.sh)** - no Node.js installation required!

## Features

- **Deterministic Problem Detection** - Uses `systeminformation` to collect metrics and evaluate against configurable thresholds
- **AI-Powered Remediation** - Leverages LLMs (via OpenCode Zen) to analyze alerts and recommend actions
- **Daemon Mode** - Runs as a background service with PM2 or systemd
- **Multi-Server Support** - All instances report to a centralized Turso database
- **Discord Notifications** - Alerts humans via Discord when intervention is needed
- **Real-time Dashboard** - Web UI showing metrics, alerts, and agent actions
- **Safe Action Execution** - Auto-executes safe actions, requires approval for risky ones

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Metrics Collection                           │
│                   (systeminformation)                           │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Rule Engine                                 │
│            (Deterministic Threshold Evaluation)                 │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼ Alert Triggered
┌─────────────────────────────────────────────────────────────────┐
│                   AI Agent (kimi-k2.5)                          │
│    • Analyzes the problem                                       │
│    • Decides: auto-remediate OR notify humans OR both           │
│    • Executes safe actions automatically                        │
└─────────────────────────────────────────────────────────────────┘
                                │
              ┌─────────────────┼─────────────────┐
              ▼                 ▼                 ▼
     ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
     │ Auto Actions │  │   Discord    │  │    Turso     │
     │ (safe ops)   │  │ Notification │  │   Database   │
     └──────────────┘  └──────────────┘  └──────────────┘
```

## Quick Start

### Prerequisites

- [Bun](https://bun.sh) runtime (no Node.js required!)
- PM2 (for daemon mode): `bun install -g pm2`
- OpenCode API key (for AI agent)
- Turso database (for multi-server storage)

### Install Bun

```bash
# One-liner installation
curl -fsSL https://bun.sh/install | bash
```

### Installation

```bash
# Clone the repository
git clone https://github.com/sjcotto/opsagent.git
cd opsagent

# Install dependencies
./bin/opsagent.sh install

# Configure credentials
cp .env.example .env
nano .env  # Add your API keys
```

### Configuration

Edit `.env` with your credentials:

```env
# Required: OpenCode API key for AI agent
OPENCODE_API_KEY=sk-your-opencode-key

# Required: Turso database for centralized storage
TURSO_DATABASE_URL=libsql://your-db.turso.io
TURSO_AUTH_TOKEN=your-turso-token

# Optional: Discord webhook for notifications
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...

# Optional: Custom server name
SERVER_NAME=web-server-1
```

## Running as a Daemon

### Option 1: PM2 (Recommended)

```bash
# Install PM2 globally
bun install -g pm2

# Start the daemon
./bin/opsagent.sh start

# Other commands
./bin/opsagent.sh stop       # Stop the daemon
./bin/opsagent.sh restart    # Restart
./bin/opsagent.sh status     # Show status
./bin/opsagent.sh logs       # Show logs
./bin/opsagent.sh logs-live  # Follow logs in real-time

# Enable auto-start on system boot
./bin/opsagent.sh startup
```

Or using bun scripts:

```bash
bun run daemon:start    # Start
bun run daemon:stop     # Stop
bun run daemon:restart  # Restart
bun run daemon:status   # Status
bun run daemon:logs     # Logs
```

### Option 2: Systemd (Linux)

```bash
# Install as systemd service (run as root)
# This will auto-install Bun if not present
sudo ./systemd/install.sh

# Manage with systemctl
sudo systemctl start opsagent
sudo systemctl stop opsagent
sudo systemctl restart opsagent
sudo systemctl status opsagent

# View logs
sudo journalctl -u opsagent -f

# Enable on boot
sudo systemctl enable opsagent
```

### Option 3: Docker

```bash
# Build and run
docker compose up -d --build

# View logs
docker compose logs -f

# Stop
docker compose down
```

## Dashboard

Access the web dashboard at http://localhost:3001

The dashboard shows:
- Real-time system metrics (CPU, memory, disk, network)
- Active alerts and history
- AI agent analysis and actions

## Configuration File

Edit `config/default.yaml` to customize thresholds:

```yaml
collector:
  interval: 5000  # Metrics polling interval (ms)

rules:
  cpu:
    warning: 70      # Warning at 70% CPU
    critical: 90     # Critical at 90% CPU
    sustained:
      threshold: 80
      duration: 300000  # 5 minutes

  memory:
    warning: 75
    critical: 90

  disk:
    warning: 80
    critical: 95

agent:
  enabled: true
  autoRemediate: false  # Set true to auto-execute all actions
  model: "kimi-k2.5"

dashboard:
  enabled: true
  port: 3001

discord:
  enabled: true
  notifyOnCritical: true
  notifyOnAgentAction: true
```

## Agent Actions

| Action | Risk | Auto-Execute | Description |
|--------|------|--------------|-------------|
| `notify_human` | Low | Yes | Send Discord notification |
| `clear_cache` | Low | Yes | Clear system caches |
| `log_analysis` | Low | Yes | Analyze system logs |
| `kill_process` | Medium | No | Kill a process (requires approval) |
| `restart_service` | Medium | No | Restart a service (requires approval) |
| `cleanup_disk` | Low | No | Clean temp files (requires approval) |
| `custom_command` | High | No | Run shell command (requires approval) |

## Multi-Server Deployment

Deploy OpsAgent on multiple servers, all pointing to the same Turso database:

```bash
# Server 1: web-server
SERVER_NAME=web-server-1 ./bin/opsagent.sh start

# Server 2: api-server
SERVER_NAME=api-server-1 ./bin/opsagent.sh start

# Server 3: db-server
SERVER_NAME=db-server-1 ./bin/opsagent.sh start
```

Query all servers from Turso:

```sql
-- All active servers
SELECT * FROM servers WHERE status = 'active';

-- Recent alerts across all servers
SELECT s.hostname, a.severity, a.message, a.created_at
FROM alerts a
JOIN servers s ON a.server_id = s.id
ORDER BY a.created_at DESC;

-- Pending actions requiring approval
SELECT s.hostname, aa.action_type, aa.description
FROM agent_actions aa
JOIN servers s ON aa.server_id = s.id
WHERE aa.status = 'skipped';
```

## Database Schema

```
servers           → Track all monitoring instances
alerts            → All alerts with severity, metrics, thresholds
agent_responses   → AI analysis and recommendations
agent_actions     → Individual remediation actions and results
metrics_snapshots → Historical metrics for dashboards
```

## Development

```bash
# Run in development mode
bun run dev
# Or use the CLI
./bin/opsagent.sh run

# Run directly with Bun
bun run src/index.ts
```

## Testing

Use the included stress testing tools:

```bash
# CPU stress test
./scripts/test-stress.sh cpu

# Memory stress test
./scripts/test-stress.sh memory

# Combined stress test
./scripts/test-stress.sh all
```

## Project Structure

```
opsagent/
├── bin/
│   └── opsagent.sh       # CLI daemon management
├── src/
│   ├── index.ts          # Entry point
│   ├── config/           # Configuration loading
│   ├── collector/        # Metrics collection
│   ├── rules/            # Rule engine
│   ├── alerts/           # Alert management
│   ├── agent/            # AI agent interface
│   ├── db/               # Turso database
│   ├── notifications/    # Discord integration
│   └── dashboard/        # Web UI
├── config/
│   ├── default.yaml      # Default configuration
│   └── test.yaml         # Test configuration
├── systemd/
│   ├── opsagent.service  # Systemd unit file
│   └── install.sh        # Systemd installer
├── public/               # Dashboard frontend
├── scripts/              # Utility scripts
├── ecosystem.config.cjs  # PM2 configuration
├── docker-compose.yml
├── Dockerfile
└── package.json
```

## Logs

Logs are stored in the `logs/` directory when running as a daemon:
- `logs/out.log` - Standard output
- `logs/error.log` - Error output

View logs:
```bash
# With PM2
./bin/opsagent.sh logs
./bin/opsagent.sh logs-live

# With systemd
sudo journalctl -u opsagent -f
```

## License

MIT
