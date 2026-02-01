# OpsAgent Issue Tracking System

## Overview

The Issue Tracking System prevents alert spam by grouping related alerts into a single issue. Instead of creating 10,000 issues when the same alert fires every 5 minutes, OpsAgent creates **one issue** and updates it with comments tracking each occurrence and all actions taken.

## Key Concepts

### Issue = Investigation
- One issue per alert type (not one per alert occurrence)
- Tracks the full lifecycle: detection → analysis → actions → resolution
- All alerts of the same type update the same issue
- Prevents notification spam while maintaining full audit trail

### Alert Fingerprinting
```
Alert: "cpu_usage" on "system.cpu" chart
Fingerprint: sha256("cpu_usage:system.cpu:system.cpu")[:16]
→ "a3f7b2d8e1c9f5a4"
```

Same fingerprint = same issue, even if the alert fires 1000 times.

## Database Schema

### issues Table
```sql
CREATE TABLE issues (
  id TEXT PRIMARY KEY,              -- issue-1699999999999-abc123
  server_id TEXT NOT NULL,          -- server-uuid
  alert_fingerprint TEXT NOT NULL,  -- a3f7b2d8e1c9f5a4
  title TEXT NOT NULL,              -- "cpu_usage"
  description TEXT,                 -- "CPU utilization is high"
  severity TEXT NOT NULL,           -- warning | critical
  status TEXT DEFAULT 'open',       -- open | investigating | resolved | closed
  source TEXT NOT NULL,             -- netdata | opsagent
  source_alert_id TEXT,             -- reference to original alert
  first_seen_at INTEGER NOT NULL,   -- timestamp
  last_seen_at INTEGER NOT NULL,    -- timestamp
  resolved_at INTEGER,              -- timestamp (when resolved)
  alert_count INTEGER DEFAULT 1,    -- how many times this fired
  metadata TEXT                     -- JSON with context
);
```

### issue_comments Table
```sql
CREATE TABLE issue_comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  issue_id TEXT NOT NULL,
  author_type TEXT NOT NULL,        -- 'agent' | 'human'
  author_name TEXT,                 -- for humans
  comment_type TEXT NOT NULL,       -- analysis | action | status_change | alert_fired | note
  content TEXT NOT NULL,
  metadata TEXT,                    -- JSON with details
  created_at INTEGER NOT NULL
);
```

## Workflow

### 1. Alert Fires (Every 5 minutes)
```
CPU Alert: 85% usage
↓
Generate Fingerprint: "a3f7b2d8e1c9f5a4"
↓
Check: Does open issue exist with this fingerprint?
  ├─ YES → Update existing issue
  │        - Increment alert_count
  │        - Update last_seen_at
  │        - Add comment: "Alert fired again (#23): cpu_usage = 85"
  │
  └─ NO → Create new issue
           - Insert into issues table
           - Add comment: "Alert first detected: cpu_usage = 85"
```

### 2. AI Agent Analyzes
```
AI Analysis Complete
↓
Add comment to issue:
  - Type: 'analysis'
  - Content: Full AI analysis text
  - Metadata: { canAutoRemediate: true, requiresHumanAttention: false }
```

### 3. Agent Takes Action
```
Execute: clear_cache (low risk)
↓
Add comment to issue:
  - Type: 'action'
  - Content: "✅ clear_cache: System cache cleared"
  - Metadata: { success: true, output: "..." }
```

### 4. Alert Clears
```
NetData reports alert cleared
↓
Update issue:
  - status: 'resolved'
  - resolved_at: timestamp
  - Add comment: "Status changed to resolved: Alert condition cleared"
```

## Permission System

### Three Permission Levels

#### 1. `readonly`
```yaml
opsagent:
  permissionLevel: readonly
```
- Agent analyzes but takes NO actions
- Creates issues with analysis
- Sends Discord notifications
- Useful for: Monitoring without auto-intervention

#### 2. `limited` (Default)
```yaml
opsagent:
  permissionLevel: limited
  autoRemediate: false  # or true
```
- Can execute safe actions (low/medium risk)
- High-risk actions require approval
- Max 10 actions per hour
- Useful for: Semi-automated operations with human oversight

**Allowed by default:**
- notify_human
- clear_cache
- log_analysis
- kill_process (medium risk, may need approval)
- restart_service (medium risk, may need approval)
- cleanup_disk

**NOT allowed:**
- custom_command (high risk)

#### 3. `full`
```yaml
opsagent:
  permissionLevel: full
  autoRemediate: true
```
- Can execute ALL actions including high-risk
- No approval required
- Max 100 actions per hour
- Useful for: Fully automated production environments

**Allowed:**
- All actions including custom_command
- High-risk actions auto-executed

### Permission Checks

Before executing any action:
```javascript
const check = canExecuteAction(
  permissions,           // full | limited | readonly
  actionType,           // "kill_process"
  riskLevel,            // "medium"
  actionsExecutedThisHour  // 3
);

// Returns:
// { allowed: true } 
// OR
// { allowed: false, reason: "Risky action requires human approval" }
```

### Hourly Limits

- **readonly**: 0 actions/hour
- **limited**: 10 actions/hour
- **full**: 100 actions/hour

Counter resets every hour automatically.

## Configuration

### config/netdata.yaml
```yaml
netdata:
  url: "http://localhost:19999"
  pollInterval: 30

opsagent:
  model: "kimi-k2.5"
  permissionLevel: "limited"  # readonly | limited | full
  autoRemediate: false        # Must be true for auto-execution

discord:
  enabled: true
  webhookUrl: "${DISCORD_WEBHOOK_URL}"
  notifyOnCritical: true
  notifyOnAgentAction: true
```

## Example Scenarios

### Scenario 1: CPU Spike (Limited Permissions)
```
1. Alert: CPU 85% → Create issue #CPU-001
2. AI Analysis: "High CPU from process 'buggy-app' (PID 1234)"
3. Attempt: kill_process (PID 1234) - Risk: medium
4. Permission Check: ❌ Requires approval (limited mode + medium risk)
5. Discord: "⚠️ Action requires approval: kill_process"
6. Human approves via Discord
7. Action executes
8. Issue comment: "✅ kill_process: Process buggy-app killed"
9. CPU drops → Alert clears → Issue resolved
```

### Scenario 2: Disk Full (Full Permissions)
```
1. Alert: Disk 95% full → Create issue #DISK-001
2. AI Analysis: "Temp files consuming space. Safe to clean."
3. Attempt: cleanup_disk - Risk: low
4. Permission Check: ✅ Allowed (full mode + low risk)
5. Action executes automatically
6. Issue comment: "✅ cleanup_disk: 2GB temp files removed"
7. Disk 80% → Alert clears → Issue resolved
```

### Scenario 3: Memory Leak (Readonly Mode)
```
1. Alert: Memory 90% → Create issue #MEM-001
2. AI Analysis: "Memory leak detected in service 'api-server'"
3. Attempt: restart_service - Any risk level
4. Permission Check: ❌ Readonly mode (no actions allowed)
5. Discord: "🤖 Analysis: Memory leak detected. Manual intervention required."
6. Human restarts service manually
7. Issue comment: "Note: Human restarted api-server"
8. Memory drops → Alert clears → Issue resolved
```

## Querying Issues

### Get All Open Issues
```sql
SELECT * FROM issues 
WHERE server_id = 'my-server' 
AND status IN ('open', 'investigating')
ORDER BY last_seen_at DESC;
```

### Get Issue with Full History
```sql
SELECT i.*, c.* 
FROM issues i
LEFT JOIN issue_comments c ON i.id = c.issue_id
WHERE i.id = 'issue-1699999999999-abc123'
ORDER BY c.created_at ASC;
```

### Get Issues by Severity
```sql
SELECT * FROM issues 
WHERE server_id = 'my-server'
AND severity = 'critical'
AND status != 'resolved';
```

### Get Alert Frequency
```sql
SELECT 
  title,
  COUNT(*) as occurrences,
  SUM(alert_count) as total_firings
FROM issues
WHERE first_seen_at > datetime('now', '-7 days')
GROUP BY title
ORDER BY total_firings DESC;
```

## Best Practices

### 1. Start with `limited` mode
- Safe default
- Learn what actions the agent takes
- Gradually increase permissions

### 2. Review issues regularly
```bash
# List open issues
./bin/opsagent.sh issues-list

# Get issue details
./bin/opsagent.sh issues-show <issue-id>
```

### 3. Set up Discord notifications
- Critical issues notify immediately
- Daily digest of all issues
- Approve actions via Discord

### 4. Monitor action limits
If you hit hourly limits frequently:
- Check if alerts are flapping
- Tune NetData thresholds
- Consider increasing limit (if in limited mode)

### 5. Archive resolved issues
```sql
-- Close issues resolved more than 30 days ago
UPDATE issues 
SET status = 'closed' 
WHERE status = 'resolved' 
AND resolved_at < datetime('now', '-30 days');
```

## Migration from Legacy Alerts

The legacy system created one alert record per firing. To migrate:

1. Issues table created automatically
2. New alerts use fingerprinting
3. Old alerts remain in alerts table for history
4. Query both tables during transition

## Troubleshooting

### Too Many Issues Still Created
Check fingerprint generation:
```javascript
// Alerts should have same fingerprint if same type
const fp1 = generateFingerprint({ name: "cpu_usage", context: "system.cpu", chart: "system.cpu" });
const fp2 = generateFingerprint({ name: "cpu_usage", context: "system.cpu", chart: "system.cpu" });
// fp1 === fp2 ✅
```

### Actions Not Executing
Check permission level:
```yaml
opsagent:
  permissionLevel: "limited"  # not "readonly"
  autoRemediate: true         # must be true
```

Check hourly limit:
```
[Permissions] Hourly action limit reached (10 actions/hour)
```

### Database Not Saving
Check Turso credentials:
```bash
export TURSO_DATABASE_URL=libsql://my-db.turso.io
export TURSO_AUTH_TOKEN=my-token
```

## Summary

✅ **One issue per alert type** - No spam
✅ **Full audit trail** - Every action logged
✅ **Permission levels** - Control what agent can do
✅ **Hourly limits** - Prevent runaway actions
✅ **Human approval** - For risky operations
✅ **Discord integration** - Notifications and approvals

Sleep peacefully - the agent handles the alerts and updates one issue, not 10,000! 🎉
