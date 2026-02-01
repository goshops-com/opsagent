<div align="center">

# OpsAgent

### AI-Powered System Monitoring with Automated Remediation

[![GitHub release](https://img.shields.io/github/v/release/goshops-com/opsagent?style=flat-square)](https://github.com/goshops-com/opsagent/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square)](LICENSE)
[![Bun](https://img.shields.io/badge/Bun-%23000000.svg?style=flat-square&logo=bun&logoColor=white)](https://bun.sh)
[![CI](https://img.shields.io/github/actions/workflow/status/goshops-com/opsagent/ci.yml?branch=main&style=flat-square)](https://github.com/goshops-com/opsagent/actions)

An intelligent system monitoring agent that uses [NetData](https://netdata.cloud) for metrics collection and AI to analyze alerts and recommend remediation actions.

**No Node.js required** - Powered by [Bun](https://bun.sh)

[Installation](#installation) | [Quick Start](#quick-start) | [Architecture](#architecture) | [Contributing](CONTRIBUTING.md)

</div>

---

## Installation

```bash
curl -fsSL https://raw.githubusercontent.com/goshops-com/opsagent/main/install.sh | bash
```

The installer will:

- Install [Bun](https://bun.sh) runtime (if not present)
- Install PM2 process manager
- Install [NetData](https://netdata.cloud) for system metrics
- Clone OpsAgent to `~/.opsagent`
- Guide you through API key configuration
- Add `opsagent` command to your PATH

### Requirements

| Requirement | Notes |
|------------|-------|
| **OS** | macOS or Linux |
| **curl** | Pre-installed on most systems |
| **git** | Pre-installed on most systems |

Everything else (Bun, PM2, NetData) is installed automatically.

## Quick Start

After installation, start monitoring:

```bash
# Start the agent (NetData + AI analysis)
opsagent start

# Check status
opsagent status

# View logs
opsagent logs

# Open dashboards
open http://localhost:19999  # NetData metrics
open http://localhost:3001   # OpsAgent AI analysis
```

## Features

- **NetData Integration** - Real-time system metrics with 1-second granularity
- **AI-Powered Remediation** - Uses LLMs (via OpenCode Zen) to analyze alerts and recommend actions
- **Issue Tracking** - Groups related alerts into issues, prevents notification spam
- **Permission Levels** - Control what the agent can do automatically
- **Discord Notifications** - Alerts humans via Discord when intervention is needed
- **Multi-Server Support** - Deploy agents to multiple servers, monitor from a central panel
- **Safe Action Execution** - Auto-executes safe actions, requires approval for risky ones

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      NetData                                     │
│              (System Metrics & Alerting)                         │
│                 http://localhost:19999                           │
└─────────────────────────────────────────────────────────────────┘
                                │
                                │ Alerts via API
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                      OpsAgent                                    │
│    • Polls NetData for alerts                                    │
│    • Groups related alerts into issues                           │
│    • Sends to AI for analysis                                    │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                   AI Agent (kimi-k2.5)                           │
│    • Analyzes the problem                                        │
│    • Decides: auto-remediate OR notify humans OR both            │
│    • Executes safe actions automatically                         │
└─────────────────────────────────────────────────────────────────┘
                                │
              ┌─────────────────┼─────────────────┐
              ▼                 ▼                 ▼
     ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
     │ Auto Actions │  │   Discord    │  │ Control Panel│
     │ (safe ops)   │  │ Notification │  │  (optional)  │
     └──────────────┘  └──────────────┘  └──────────────┘
```

## Installation Modes

### Agent Only (Default)
Monitor a single server with AI-powered analysis:
```bash
curl -fsSL https://raw.githubusercontent.com/goshops-com/opsagent/main/install.sh | bash
```

### Control Panel Only
Central dashboard to view all agents:
```bash
OPSAGENT_MODE=panel curl -fsSL https://raw.githubusercontent.com/goshops-com/opsagent/main/install.sh | bash
```

### Both (Full Installation)
Agent + Control Panel on the same machine:
```bash
OPSAGENT_MODE=both curl -fsSL https://raw.githubusercontent.com/goshops-com/opsagent/main/install.sh | bash
```

## Configuration

Edit `~/.opsagent/.env` with your credentials:

```env
# Required: OpenCode API key for AI agent
OPENCODE_API_KEY=sk-your-opencode-key

# Option 1: Connect to a Control Panel (for agents)
CONTROL_PANEL_URL=http://your-control-panel:3002

# Option 2: Direct database (for standalone or control panel)
TURSO_DATABASE_URL=libsql://your-db.turso.io
TURSO_AUTH_TOKEN=your-turso-token

# Optional: Discord webhook for notifications
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...

# Optional: Custom server name
SERVER_NAME=web-server-1
```

## CLI Commands

```bash
opsagent start           # Start the agent daemon
opsagent stop            # Stop the agent daemon
opsagent restart         # Restart the agent daemon
opsagent status          # Show agent and NetData status
opsagent logs [n]        # Show last n log lines (default: 100)
opsagent logs-live       # Follow logs in real-time
opsagent run             # Run in foreground (development)

# Setup
opsagent setup           # Install NetData and dependencies
opsagent startup         # Enable auto-start on boot

# NetData management
opsagent netdata-status  # Check NetData status
opsagent netdata-logs    # Show NetData logs
opsagent netdata-reload  # Reload NetData alert config

opsagent help            # Show all commands
```

## Dashboards

| Dashboard | URL | Description |
|-----------|-----|-------------|
| **NetData** | http://localhost:19999 | Real-time system metrics |
| **OpsAgent** | http://localhost:3001 | AI analysis and actions |
| **Control Panel** | http://localhost:3002 | Multi-server overview |

## Control Panel

For multi-server deployments, the Control Panel provides centralized monitoring:

```bash
# On the control panel server
OPSAGENT_MODE=panel curl -fsSL https://raw.githubusercontent.com/goshops-com/opsagent/main/install.sh | bash
cd ~/.opsagent && bun run panel

# On each monitored server, set CONTROL_PANEL_URL in .env
CONTROL_PANEL_URL=http://control-panel-host:3002
```

Features:
- View all registered agents and their online/offline status
- Aggregated alerts across all servers
- AI agent analysis and recommendations
- Action history with execution status

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

## Permission Levels

Configure via `config/netdata.yaml`:

```yaml
opsagent:
  permissionLevel: limited  # readonly, limited, standard, full
```

| Level | Description |
|-------|-------------|
| `readonly` | Only monitor and notify, no actions |
| `limited` | Safe actions only (clear_cache, log_analysis) |
| `standard` | Medium-risk actions with limits |
| `full` | All actions (use with caution) |

## Project Structure

```
opsagent/
├── install.sh            # One-liner installer
├── uninstall.sh          # Uninstaller
├── bin/
│   ├── opsagent          # CLI command wrapper
│   └── opsagent.sh       # CLI implementation
├── src/
│   ├── index.ts          # Entry point (NetData integration)
│   ├── config/           # Configuration loading
│   ├── collector/        # NetData alert collector
│   ├── alerts/           # Alert management
│   ├── agent/            # AI agent interface
│   ├── api/              # Backend abstraction (DB or Control Panel)
│   ├── db/               # Direct database access
│   ├── notifications/    # Discord integration
│   └── dashboard/        # Web UI (per-server)
├── packages/
│   └── control-panel/    # Next.js centralized dashboard
├── config/
│   └── netdata.yaml      # NetData integration config
├── scripts/
│   └── install-netdata.sh # NetData installer
├── ecosystem.config.cjs  # PM2 configuration
└── package.json
```

## Development

```bash
# Run in foreground (development mode)
opsagent run

# Or with bun directly
bun run dev

# Run tests
bun test
```

## Advanced Installation Options

| Variable | Default | Description |
|----------|---------|-------------|
| `OPSAGENT_DIR` | `~/.opsagent` | Installation directory |
| `OPSAGENT_MODE` | `agent` | Installation mode: agent, panel, both |
| `OPSAGENT_NO_START` | (unset) | Set to skip starting daemon |
| `OPSAGENT_BRANCH` | `main` | Git branch to install |

```bash
# Example: Install control panel to custom directory
OPSAGENT_DIR=/opt/opsagent OPSAGENT_MODE=panel \
  curl -fsSL https://raw.githubusercontent.com/goshops-com/opsagent/main/install.sh | bash
```

## Uninstall

```bash
curl -fsSL https://raw.githubusercontent.com/goshops-com/opsagent/main/uninstall.sh | bash
```

Or manually:
```bash
opsagent stop
rm -rf ~/.opsagent
# Edit ~/.bashrc or ~/.zshrc to remove OpsAgent PATH entries
```

## License

MIT
