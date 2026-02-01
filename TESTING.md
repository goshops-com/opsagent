# Testing the System Monitor

## Quick Start with Docker

### 1. Start the monitor

```bash
# Build and start
docker compose up --build

# Or run in background
docker compose up -d --build
```

The dashboard will be available at http://localhost:3001

### 2. Trigger stress tests

Open another terminal and run stress scenarios:

```bash
# CPU stress (will trigger CPU alerts)
docker compose exec monitor ./scripts/test-stress.sh cpu

# Memory stress (will trigger memory alerts)
docker compose exec monitor ./scripts/test-stress.sh memory

# Combined stress
docker compose exec monitor ./scripts/test-stress.sh all

# Light stress for warning-level alerts
docker compose exec monitor ./scripts/test-stress.sh light
```

### 3. Watch the results

- **Dashboard**: http://localhost:3001 - see real-time metrics and alerts
- **Console**: Watch the docker compose logs for alert processing
- **Discord**: If configured, notifications will appear in your channel

## Test Scenarios

| Scenario | Command | What it triggers |
|----------|---------|------------------|
| CPU Spike | `./scripts/test-stress.sh cpu` | CPU warning/critical alerts |
| Memory Pressure | `./scripts/test-stress.sh memory` | Memory warning/critical alerts |
| Disk I/O | `./scripts/test-stress.sh disk` | Disk activity monitoring |
| Combined | `./scripts/test-stress.sh all` | Multiple simultaneous alerts |
| Light | `./scripts/test-stress.sh light` | Warning-level alerts only |

## Testing with Discord

1. Create a Discord webhook:
   - Go to your Discord server
   - Server Settings → Integrations → Webhooks → New Webhook
   - Copy the webhook URL

2. Set the environment variable:
```bash
export DISCORD_WEBHOOK_URL="https://discord.com/api/webhooks/..."
docker compose up --build
```

3. Run a stress test and watch notifications appear in Discord

## Test Configuration

The test configuration (`config/test.yaml`) uses lower thresholds:

- CPU Warning: 30% (vs 70% in production)
- CPU Critical: 50% (vs 90% in production)
- Memory Warning: 30% (vs 75% in production)
- Cooldown: 30 seconds (vs 5 minutes in production)

This makes it easy to trigger alerts without maxing out your system.

## Local Testing (without Docker)

```bash
# Install stress-ng (macOS)
brew install stress-ng

# Or on Ubuntu/Debian
sudo apt install stress-ng

# Start the monitor with test config
cp config/test.yaml config/default.yaml
npm run dev

# In another terminal, run stress tests
stress-ng --cpu 2 --timeout 30s
```

## Expected Flow

1. **Metrics Collection** (every 3s in test mode)
   - systeminformation gathers CPU, memory, disk, network, process data

2. **Rule Evaluation**
   - Deterministic threshold checks
   - If CPU > 30% → warning alert
   - If CPU > 50% → critical alert

3. **AI Agent Analysis**
   - Alert sent to kimi-k2.5 model
   - Agent analyzes the situation
   - Recommends actions (kill_process, clear_cache, notify_human, etc.)

4. **Action Execution**
   - Safe actions auto-execute (clear_cache, log_analysis)
   - Risky actions require approval
   - notify_human sends Discord message

5. **Notifications**
   - Critical alerts → immediate Discord notification
   - Agent decisions → Discord with analysis
   - Resolutions → Discord confirmation

## Viewing Logs

```bash
# All logs
docker compose logs -f

# Just monitor logs
docker compose logs -f monitor

# Last 100 lines
docker compose logs --tail 100 monitor
```

## Cleanup

```bash
# Stop containers
docker compose down

# Remove volumes and images
docker compose down -v --rmi local
```
