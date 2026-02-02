# OpsAgent: Plugin System, Chat Sessions & DBA Capabilities

## Implementation Status: COMPLETE

This document describes the plugin system, chat sessions, and DBA capabilities implemented for OpsAgent. Use this to resume testing in a new session.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                      CONTROL PANEL (Next.js)                    │
├─────────────────────────────────────────────────────────────────┤
│  /agents          - List agents, plugin status                  │
│  /sessions        - Chat sessions list                          │
│  /sessions/[id]   - Chat interface with agent                   │
│  /approvals       - Pending approval queue                      │
│  /audit           - Operation audit log                         │
└────────────────────────────┬────────────────────────────────────┘
                             │ WebSocket + REST API
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                      OPSAGENT (per server)                      │
├─────────────────────────────────────────────────────────────────┤
│  Plugin Registry    │  Chat Handler    │  Approval Manager      │
│  ├── PostgreSQL     │  ├── AI Client   │  ├── Request Queue     │
│  ├── MongoDB        │  ├── Context     │  └── Audit Logger      │
│  └── (extensible)   │  └── Tools       │                        │
└─────────────────────────────────────────────────────────────────┘
```

---

## Files Created/Modified

### Database Schema
| File | Description |
|------|-------------|
| `src/db/schema.ts` | Added 6 new tables with indexes |

**New Tables:**
- `plugins` - Plugin definitions (metadata)
- `agent_plugins` - Plugin instances per agent
- `chat_sessions` - Chat sessions
- `chat_messages` - Chat messages with tool calls
- `approval_requests` - Approval queue for risky operations
- `plugin_audit_log` - Audit trail for all operations

### Plugin System Core
| File | Description |
|------|-------------|
| `src/plugins/types.ts` | Plugin interfaces, tool definitions, risk levels |
| `src/plugins/registry.ts` | Plugin lifecycle management |
| `src/plugins/credentials.ts` | AES-256-GCM encrypted credential storage |
| `src/plugins/index.ts` | Central exports |

### Database Plugins
| File | Description |
|------|-------------|
| `src/plugins/postgresql/index.ts` | PostgreSQL DBA plugin (15 tools) |
| `src/plugins/mongodb/index.ts` | MongoDB DBA plugin (16 tools) |

### Chat & Approval System
| File | Description |
|------|-------------|
| `src/agent/chat-handler.ts` | AI chat with tool execution |
| `src/agent/approval-manager.ts` | Approval workflow & audit logging |

### Dashboard Server
| File | Description |
|------|-------------|
| `src/dashboard/websocket.ts` | Extended with chat/approval/plugin events |
| `src/dashboard/server.ts` | Added 20+ new API endpoints |

### Control Panel
| File | Description |
|------|-------------|
| `packages/control-panel/src/lib/db.ts` | Database functions for new tables |
| `packages/control-panel/src/app/agents/page.tsx` | Agent list with plugins |
| `packages/control-panel/src/app/sessions/page.tsx` | Chat session list |
| `packages/control-panel/src/app/sessions/[sessionId]/page.tsx` | Chat interface |
| `packages/control-panel/src/app/approvals/page.tsx` | Approval queue |
| `packages/control-panel/src/app/audit/page.tsx` | Audit log viewer |
| `packages/control-panel/src/components/chat/ChatInput.tsx` | Chat input component |
| `packages/control-panel/src/app/page.tsx` | Updated dashboard with new links |

---

## Risk Levels & Approval Flow

| Level | Auto-Execute | Requires Approval | Examples |
|-------|--------------|-------------------|----------|
| `low` | Yes | No | EXPLAIN, list indexes, connection stats |
| `medium` | No | Yes | CREATE INDEX, VACUUM, ANALYZE |
| `high` | No | Yes | Kill connection, drop index |
| `critical` | No | Yes + reason | Drop user, modify replication |

---

## API Endpoints Added

### Plugin Management
```
GET    /api/plugins                              - List all plugin types
GET    /api/servers/:serverId/plugins            - List plugins on server
POST   /api/servers/:serverId/plugins            - Create plugin instance
GET    /api/servers/:serverId/plugins/:id        - Get plugin instance
DELETE /api/servers/:serverId/plugins/:id        - Remove plugin instance
GET    /api/servers/:serverId/plugins/:id/health - Get plugin health
GET    /api/servers/:serverId/plugins/:id/tools  - List available tools
POST   /api/servers/:serverId/plugins/:id/execute - Execute tool
```

### Chat Sessions
```
GET    /api/sessions                    - List chat sessions
POST   /api/sessions                    - Create new session
GET    /api/sessions/:id                - Get session details
POST   /api/sessions/:id/close          - Close session
GET    /api/sessions/:id/messages       - Get messages
POST   /api/sessions/:id/messages       - Send message
```

### Approvals
```
GET    /api/approvals                   - List approval requests
GET    /api/approvals/:id               - Get approval details
POST   /api/approvals/:id/approve       - Approve request
POST   /api/approvals/:id/reject        - Reject request
```

### Audit Log
```
GET    /api/audit                       - Get audit log entries
GET    /api/audit/stats                 - Get audit statistics
```

---

## WebSocket Events Added

### Chat Events
- `chat:join` / `chat:leave` - Join/leave session room
- `chat:message` - Send message
- `chat:event` - Chat event broadcast
- `chat:typing` - Typing indicator
- `chat:tool_execution` - Tool execution status

### Approval Events
- `approval:subscribe` / `approval:unsubscribe` - Subscribe to server approvals
- `approval:respond` - Respond to approval
- `approval:request` - New approval needed
- `approval:response` - Approval granted/rejected

### Plugin Events
- `plugin:subscribe` / `plugin:unsubscribe` - Subscribe to plugin updates
- `plugin:health` - Plugin health update
- `plugin:status` - Plugin status change
- `plugin:tool_executed` - Tool execution notification

---

## PostgreSQL Plugin Tools

### Read (Low Risk)
- `explain_query` - Analyze query execution plan
- `get_slow_queries` - Get slow queries from pg_stat_statements
- `list_indexes` - List indexes with usage stats
- `get_connection_stats` - Current connections and sessions
- `get_replication_status` - Replication lag and status
- `get_table_stats` - Table size, rows, bloat
- `get_locks` - Lock information and blocking queries

### Optimize (Medium Risk - Requires Approval)
- `create_index` - Create index (CONCURRENTLY by default)
- `drop_index` - Drop index (CONCURRENTLY by default)
- `vacuum_table` - VACUUM with optional FULL/ANALYZE
- `analyze_table` - Update table statistics
- `reindex_table` - Rebuild indexes

### Admin (High/Critical Risk - Requires Approval)
- `kill_connection` - Terminate connection (cancel or terminate)
- `create_user` - Create database role
- `drop_user` - Drop database role (critical)
- `grant_permission` - Grant permissions
- `revoke_permission` - Revoke permissions

---

## MongoDB Plugin Tools

### Read (Low Risk)
- `explain_query` - Analyze query execution plan
- `get_profiler_data` - Get slow query data
- `list_indexes` - List collection indexes
- `get_collection_stats` - Collection statistics
- `get_current_ops` - Running operations
- `get_server_status` - Server status info
- `get_repl_status` - Replica set status
- `list_collections` - List all collections
- `get_database_stats` - Database statistics

### Optimize (Medium/High Risk - Requires Approval)
- `create_index` - Create index (background by default)
- `drop_index` - Drop index
- `compact_collection` - Compact collection
- `reindex_collection` - Rebuild all indexes

### Admin (High/Critical Risk - Requires Approval)
- `kill_operation` - Kill running operation
- `set_profiling_level` - Enable/disable profiling
- `create_user` - Create database user
- `drop_user` - Drop database user (critical)
- `grant_roles` - Grant roles to user
- `revoke_roles` - Revoke roles from user

---

## Testing Plan

### 1. Database Schema Migration
```bash
# Run the schema to create new tables
# The schema is in src/db/schema.ts
```

### 2. Plugin Health Check
```bash
# Deploy PostgreSQL plugin, verify connection and health checks
# Check /agents page shows plugin status
```

### 3. Read Operations
```bash
# Execute list_indexes, get_slow_queries
# Should work without approval
# Verify results in chat UI
```

### 4. Approval Flow
```bash
# Execute create_index
# Should require approval
# Check /approvals page
# Test approve/reject flow
# Verify audit log entry
```

### 5. Chat Session
```bash
# Create session from /agents page
# Ask "show me slow queries"
# AI should call appropriate tool
# Verify tool execution visualization
```

### 6. Audit Trail
```bash
# Verify all operations logged
# Check /audit page
# Filter by risk level, status, server
```

### 7. MongoDB Plugin
```bash
# Repeat tests for MongoDB
# Verify all tools work correctly
```

### 8. Full UI Flow
```bash
# Dashboard -> Agents -> New Session -> Chat -> Tool Execution -> Approval -> Audit
```

---

## Environment Variables

```bash
# Required for credential encryption
PLUGIN_ENCRYPTION_KEY=<64-char-hex-string>

# Generate a new key:
# node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Optional: Database clients (installed on demand)
# npm install pg        # For PostgreSQL plugin
# npm install mongodb   # For MongoDB plugin
```

---

## Dependencies to Install

For PostgreSQL plugin:
```bash
npm install pg
npm install -D @types/pg
```

For MongoDB plugin:
```bash
npm install mongodb
```

---

## Known Limitations

1. **Real-time Updates**: Chat currently uses page refresh instead of WebSocket for simplicity. WebSocket infrastructure is in place for real-time updates.

2. **Credential Storage**: Credentials are encrypted in memory. For production, integrate with a secrets manager.

3. **Plugin Installation**: Database client libraries (pg, mongodb) are optional dependencies loaded at runtime.

4. **Session Persistence**: Chat sessions are stored in database but the ChatHandler keeps sessions in memory. For multi-instance deployment, use database as source of truth.

---

## Next Steps for Testing

1. Run database migrations to create new tables
2. Install required database client libraries
3. Configure a test PostgreSQL/MongoDB instance
4. Create a plugin instance via API or UI
5. Test the full chat -> tool execution -> approval flow
6. Verify audit logging captures all operations
