<div align="center">

# OpsAgent

### AI-Powered System Monitoring with Automated Remediation

[![GitHub release](https://img.shields.io/github/v/release/sjcotto/opsagent?style=flat-square)](https://github.com/sjcotto/opsagent/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square)](LICENSE)
[![Bun](https://img.shields.io/badge/Bun-%23000000.svg?style=flat-square&logo=bun&logoColor=white)](https://bun.sh)
[![CI](https://img.shields.io/github/actions/workflow/status/sjcotto/opsagent/ci.yml?branch=main&style=flat-square)](https://github.com/sjcotto/opsagent/actions)

An intelligent system monitoring daemon that detects problems using deterministic rules and invokes an AI agent to analyze issues and recommend remediation actions.

**No Node.js required** - Powered by [Bun](https://bun.sh)

[Installation](#installation) | [Quick Start](#quick-start) | [Documentation](#configuration-file) | [Contributing](CONTRIBUTING.md)

</div>

---

## Installation

```bash
curl -fsSL https://raw.githubusercontent.com/sjcotto/opsagent/main/install.sh | bash
```

That's it! The installer will:

- Install [Bun](https://bun.sh) runtime (if not present)
- Install PM2 process manager
- Clone OpsAgent to `~/.opsagent`
- Install all dependencies
- Guide you through API key configuration
- Add `opsagent` command to your PATH

### Requirements

| Requirement | Notes |
|------------|-------|
| **OS** | macOS or Linux |
| **curl** | Pre-installed on most systems |
| **git** | Pre-installed on most systems |

Everything else (Bun, PM2) is installed automatically.

### What Gets Installed

```
~/.opsagent/          # Main installation directory
~/.bun/               # Bun runtime (if not already installed)
~/.bashrc or ~/.zshrc # PATH updated to include opsagent command
```

## Quick Start

After installation, start monitoring:

```bash
# Start the daemon
opsagent start

# Check status
opsagent status

# View logs
opsagent logs

# Open dashboard
open http://localhost:3001
```

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

## Configuration

Edit `~/.opsagent/.env` with your credentials:

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

## CLI Commands

```bash
opsagent start        # Start the daemon
opsagent stop         # Stop the daemon
opsagent restart      # Restart the daemon
opsagent status       # Show status
opsagent logs         # Show recent logs
opsagent logs-live    # Follow logs in real-time
opsagent run          # Run in foreground (development)
opsagent startup      # Enable auto-start on boot
opsagent help         # Show all commands
```

## Alternative Deployment Methods

### Systemd (Linux)

```bash
# Install as systemd service
sudo ~/.opsagent/systemd/install.sh

# Manage with systemctl
sudo systemctl start opsagent
sudo systemctl stop opsagent
sudo systemctl status opsagent
sudo journalctl -u opsagent -f
```

### Docker

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

## Control Panel

A separate Next.js control panel is available for centralized monitoring of all servers.

```bash
# Install and run
cd packages/control-panel
bun install
cp ../../.env .env  # Use same Turso credentials
bun run dev
```

Or from the root directory:
```bash
bun run panel      # Development
bun run panel:start  # Production
```

Access at http://localhost:3002

The control panel shows:
- All registered servers and their status
- Aggregated alerts across all servers
- AI agent analysis and recommendations
- Action history with execution status

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
SERVER_NAME=web-server-1 opsagent start

# Server 2: api-server
SERVER_NAME=api-server-1 opsagent start

# Server 3: db-server
SERVER_NAME=db-server-1 opsagent start
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
# Run in foreground (development mode)
opsagent run

# Or with bun directly
bun run dev
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
├── install.sh            # One-liner installer
├── uninstall.sh          # Uninstaller
├── bin/
│   ├── opsagent          # CLI command wrapper
│   └── opsagent.sh       # CLI implementation
├── src/
│   ├── index.ts          # Entry point
│   ├── config/           # Configuration loading
│   ├── collector/        # Metrics collection
│   ├── rules/            # Rule engine
│   ├── alerts/           # Alert management
│   ├── agent/            # AI agent interface
│   ├── db/               # Turso database
│   ├── notifications/    # Discord integration
│   └── dashboard/        # Web UI (per-server)
├── packages/
│   └── control-panel/    # Next.js centralized dashboard
├── config/
│   └── default.yaml      # Default configuration
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

Logs are stored in `~/.opsagent/logs/` when running as a daemon:
- `out.log` - Standard output
- `error.log` - Error output

View logs:
```bash
opsagent logs          # Recent logs
opsagent logs-live     # Follow logs

# Or with systemd
sudo journalctl -u opsagent -f
```

## Advanced Installation Options

The installer supports environment variables for customization:

| Variable | Default | Description |
|----------|---------|-------------|
| `OPSAGENT_DIR` | `~/.opsagent` | Installation directory |
| `OPSAGENT_NO_START` | (unset) | Set to `1` to skip starting daemon |
| `OPSAGENT_BRANCH` | `main` | Git branch to install |

```bash
# Example: Install to custom directory without starting
OPSAGENT_DIR=/opt/opsagent OPSAGENT_NO_START=1 \
  curl -fsSL https://raw.githubusercontent.com/sjcotto/opsagent/main/install.sh | bash
```

### Manual Installation

<details>
<summary>Click to expand</summary>

```bash
# Install Bun
curl -fsSL https://bun.sh/install | bash

# Clone repository
git clone https://github.com/sjcotto/opsagent.git ~/.opsagent
cd ~/.opsagent

# Install dependencies
bun install

# Install PM2
bun install -g pm2

# Configure
cp .env.example .env
nano .env  # Add your API keys

# Start
./bin/opsagent start
```

</details>

## Uninstall

```bash
curl -fsSL https://raw.githubusercontent.com/sjcotto/opsagent/main/uninstall.sh | bash
```

Or manually:
```bash
opsagent stop
rm -rf ~/.opsagent
# Edit ~/.bashrc or ~/.zshrc to remove OpsAgent PATH entries
```

## License

MIT
