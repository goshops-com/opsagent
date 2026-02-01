# OpsAgent - AI-Powered System Monitor

An intelligent system monitoring tool that detects problems using deterministic rules and invokes an AI agent to analyze issues and recommend remediation actions. Designed for multi-server deployments with centralized data storage.

## Features

- **Deterministic Problem Detection** - Uses `systeminformation` to collect metrics and evaluate against configurable thresholds
- **AI-Powered Remediation** - Leverages LLMs (via OpenCode Zen) to analyze alerts and recommend actions
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

- Node.js 20+
- OpenCode API key (for AI agent)
- Turso database (for multi-server storage)
- Discord webhook (optional, for notifications)

### Installation

```bash
# Clone the repository
git clone git@github.com:sjcotto/opsagent.git
cd opsagent

# Install dependencies
npm install

# Copy environment template
cp .env.example .env

# Edit .env with your credentials
```

### Configuration

Create a `.env` file with:

```env
# Required: OpenCode API key for AI agent
OPENCODE_API_KEY=sk-your-opencode-key

# Required: Turso database for centralized storage
TURSO_DATABASE_URL=libsql://your-db.turso.io
TURSO_AUTH_TOKEN=your-turso-token

# Optional: Discord webhook for notifications
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...

# Optional: Custom server identification
SERVER_NAME=web-server-1
```

### Run

```bash
# Development mode
npm run dev

# Production build
npm run build
npm start
```

Open http://localhost:3001 to view the dashboard.

## Docker Deployment

```bash
# Build and run
docker compose up -d --build

# View logs
docker compose logs -f

# Run stress tests
docker compose exec monitor ./scripts/test-stress.sh cpu
```

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

## Available Agent Actions

| Action | Risk | Auto-Execute | Description |
|--------|------|--------------|-------------|
| `notify_human` | Low | Yes | Send Discord notification |
| `clear_cache` | Low | Yes | Clear system caches |
| `log_analysis` | Low | Yes | Analyze system logs |
| `kill_process` | Medium | No | Kill a process (requires approval) |
| `restart_service` | Medium | No | Restart a service (requires approval) |
| `cleanup_disk` | Low | No | Clean temp files (requires approval) |
| `custom_command` | High | No | Run shell command (requires approval) |

## Multi-Server Setup

Each server runs its own OpsAgent instance, all pointing to the same Turso database:

```bash
# Server 1
SERVER_NAME=web-server-1 npm run dev

# Server 2
SERVER_NAME=api-server-1 npm run dev

# Server 3
SERVER_NAME=db-server-1 npm run dev
```

Query all servers from Turso:

```sql
-- All active servers
SELECT * FROM servers WHERE status = 'active';

-- Recent alerts across all servers
SELECT s.hostname, a.severity, a.message
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

With Docker:
```bash
docker compose exec monitor ./scripts/test-stress.sh cpu
```

## Project Structure

```
opsagent/
├── src/
│   ├── index.ts              # Entry point
│   ├── config/               # Configuration loading
│   ├── collector/            # Metrics collection
│   ├── rules/                # Rule engine
│   ├── alerts/               # Alert management
│   ├── agent/                # AI agent interface
│   ├── db/                   # Turso database
│   ├── notifications/        # Discord integration
│   └── dashboard/            # Web UI
├── config/
│   ├── default.yaml          # Default configuration
│   └── test.yaml             # Test configuration (low thresholds)
├── public/                   # Dashboard frontend
├── scripts/                  # Utility scripts
├── docker-compose.yml
├── Dockerfile
└── package.json
```

## License

MIT
