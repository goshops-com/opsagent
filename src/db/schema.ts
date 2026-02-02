export const schema = `
-- Servers table: track each monitoring instance
CREATE TABLE IF NOT EXISTS servers (
  id TEXT PRIMARY KEY,
  hostname TEXT NOT NULL,
  name TEXT,
  ip_address TEXT,
  os TEXT,
  os_version TEXT,
  first_seen_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  status TEXT DEFAULT 'active',
  metadata TEXT -- JSON for additional info
);

-- Alerts table: store all alerts from all servers
CREATE TABLE IF NOT EXISTS alerts (
  id TEXT PRIMARY KEY,
  server_id TEXT NOT NULL,
  severity TEXT NOT NULL,
  message TEXT NOT NULL,
  metric TEXT NOT NULL,
  current_value REAL NOT NULL,
  threshold REAL NOT NULL,
  created_at INTEGER NOT NULL,
  resolved_at INTEGER,
  acknowledged INTEGER DEFAULT 0,
  acknowledged_by TEXT,
  acknowledged_at INTEGER,
  FOREIGN KEY (server_id) REFERENCES servers(id)
);

-- Agent responses table: store AI analysis
CREATE TABLE IF NOT EXISTS agent_responses (
  id TEXT PRIMARY KEY,
  alert_id TEXT NOT NULL,
  server_id TEXT NOT NULL,
  model TEXT NOT NULL,
  analysis TEXT NOT NULL,
  can_auto_remediate INTEGER DEFAULT 0,
  requires_human_attention INTEGER DEFAULT 0,
  human_notification_reason TEXT,
  raw_response TEXT,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (alert_id) REFERENCES alerts(id),
  FOREIGN KEY (server_id) REFERENCES servers(id)
);

-- Agent actions table: store individual actions
CREATE TABLE IF NOT EXISTS agent_actions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  response_id TEXT NOT NULL,
  alert_id TEXT NOT NULL,
  server_id TEXT NOT NULL,
  action_type TEXT NOT NULL,
  description TEXT,
  command TEXT,
  risk TEXT NOT NULL,
  status TEXT NOT NULL, -- pending, executed, skipped, failed
  output TEXT,
  error TEXT,
  skip_reason TEXT,
  executed_at INTEGER,
  FOREIGN KEY (response_id) REFERENCES agent_responses(id),
  FOREIGN KEY (alert_id) REFERENCES alerts(id),
  FOREIGN KEY (server_id) REFERENCES servers(id)
);

-- Metrics snapshots table: periodic metrics storage for historical analysis
CREATE TABLE IF NOT EXISTS metrics_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  server_id TEXT NOT NULL,
  timestamp INTEGER NOT NULL,
  cpu_usage REAL,
  cpu_load_avg TEXT, -- JSON array
  memory_used_percent REAL,
  memory_used_bytes INTEGER,
  memory_total_bytes INTEGER,
  disk_max_used_percent REAL,
  disk_data TEXT, -- JSON for all mounts
  network_error_rate REAL,
  process_count INTEGER,
  zombie_count INTEGER,
  top_cpu_processes TEXT, -- JSON
  top_memory_processes TEXT, -- JSON
  FOREIGN KEY (server_id) REFERENCES servers(id)
);

-- Issues table: track ongoing investigations (one per alert type, not one per alert)
CREATE TABLE IF NOT EXISTS issues (
  id TEXT PRIMARY KEY,
  server_id TEXT NOT NULL,
  alert_fingerprint TEXT NOT NULL, -- hash of alert name + context to group related alerts
  title TEXT NOT NULL,
  description TEXT,
  severity TEXT NOT NULL,
  status TEXT DEFAULT 'open', -- open, investigating, resolved, closed
  source TEXT NOT NULL, -- netdata, opsagent, etc.
  source_alert_id TEXT, -- reference to original alert
  first_seen_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  resolved_at INTEGER,
  alert_count INTEGER DEFAULT 1, -- how many times this alert fired
  metadata TEXT, -- JSON for additional context
  FOREIGN KEY (server_id) REFERENCES servers(id)
);

-- Issue comments/activity log: track all actions and updates
CREATE TABLE IF NOT EXISTS issue_comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  issue_id TEXT NOT NULL,
  author_type TEXT NOT NULL, -- 'agent' or 'human'
  author_name TEXT, -- for humans, their name/identifier
  comment_type TEXT NOT NULL, -- 'analysis', 'action', 'status_change', 'alert_fired', 'note'
  content TEXT NOT NULL,
  metadata TEXT, -- JSON for action details, command output, etc.
  created_at INTEGER NOT NULL,
  FOREIGN KEY (issue_id) REFERENCES issues(id) ON DELETE CASCADE
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_alerts_server_id ON alerts(server_id);
CREATE INDEX IF NOT EXISTS idx_alerts_created_at ON alerts(created_at);
CREATE INDEX IF NOT EXISTS idx_alerts_severity ON alerts(severity);
CREATE INDEX IF NOT EXISTS idx_alerts_resolved ON alerts(resolved_at);
CREATE INDEX IF NOT EXISTS idx_agent_responses_alert_id ON agent_responses(alert_id);
CREATE INDEX IF NOT EXISTS idx_agent_actions_alert_id ON agent_actions(alert_id);
CREATE INDEX IF NOT EXISTS idx_metrics_server_timestamp ON metrics_snapshots(server_id, timestamp);

-- Issue indexes
CREATE INDEX IF NOT EXISTS idx_issues_server_id ON issues(server_id);
CREATE INDEX IF NOT EXISTS idx_issues_fingerprint ON issues(alert_fingerprint);
CREATE INDEX IF NOT EXISTS idx_issues_status ON issues(status);
CREATE INDEX IF NOT EXISTS idx_issues_last_seen ON issues(last_seen_at);
CREATE INDEX IF NOT EXISTS idx_issue_comments_issue_id ON issue_comments(issue_id);
CREATE INDEX IF NOT EXISTS idx_issue_comments_created_at ON issue_comments(created_at);

-- ============================================================================
-- PLUGIN SYSTEM TABLES
-- ============================================================================

-- Plugin definitions (metadata)
CREATE TABLE IF NOT EXISTS plugins (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  version TEXT NOT NULL,
  type TEXT NOT NULL, -- 'postgresql', 'mongodb', etc.
  description TEXT,
  capabilities TEXT NOT NULL, -- JSON array of capability strings
  tools TEXT NOT NULL, -- JSON array of tool definitions
  risk_levels TEXT NOT NULL, -- JSON mapping of tool names to risk levels
  created_at INTEGER NOT NULL,
  updated_at INTEGER
);

-- Plugin instances per agent
CREATE TABLE IF NOT EXISTS agent_plugins (
  id TEXT PRIMARY KEY,
  server_id TEXT NOT NULL,
  plugin_id TEXT NOT NULL,
  config TEXT NOT NULL, -- JSON encrypted config including credentials
  status TEXT DEFAULT 'inactive', -- 'active', 'inactive', 'error'
  health_status TEXT DEFAULT 'unknown', -- 'healthy', 'unhealthy', 'unknown'
  health_message TEXT,
  enabled INTEGER DEFAULT 1,
  last_health_check INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER,
  FOREIGN KEY (server_id) REFERENCES servers(id),
  FOREIGN KEY (plugin_id) REFERENCES plugins(id)
);

-- ============================================================================
-- CHAT SESSION TABLES
-- ============================================================================

-- Chat sessions
CREATE TABLE IF NOT EXISTS chat_sessions (
  id TEXT PRIMARY KEY,
  server_id TEXT NOT NULL,
  title TEXT NOT NULL,
  status TEXT DEFAULT 'active', -- 'active', 'closed', 'archived'
  context TEXT, -- JSON for session context (selected plugins, current focus, etc.)
  created_at INTEGER NOT NULL,
  updated_at INTEGER,
  created_by TEXT, -- user identifier
  closed_at INTEGER,
  FOREIGN KEY (server_id) REFERENCES servers(id)
);

-- Chat messages
CREATE TABLE IF NOT EXISTS chat_messages (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  role TEXT NOT NULL, -- 'user', 'assistant', 'system', 'tool'
  content TEXT NOT NULL,
  tool_calls TEXT, -- JSON array of tool calls made by assistant
  tool_results TEXT, -- JSON array of tool results
  metadata TEXT, -- JSON for additional message data (timestamps, tokens used, etc.)
  created_at INTEGER NOT NULL,
  FOREIGN KEY (session_id) REFERENCES chat_sessions(id) ON DELETE CASCADE
);

-- ============================================================================
-- APPROVAL SYSTEM TABLES
-- ============================================================================

-- Approval requests for risky operations
CREATE TABLE IF NOT EXISTS approval_requests (
  id TEXT PRIMARY KEY,
  server_id TEXT NOT NULL,
  session_id TEXT, -- can be null if not from chat session
  plugin_id TEXT NOT NULL,
  message_id TEXT, -- reference to chat message that triggered this
  operation TEXT NOT NULL, -- tool name being requested
  parameters TEXT NOT NULL, -- JSON of tool parameters
  risk_level TEXT NOT NULL, -- 'low', 'medium', 'high', 'critical'
  reason TEXT NOT NULL, -- AI-generated explanation of why this operation is needed
  status TEXT DEFAULT 'pending', -- 'pending', 'approved', 'rejected', 'expired', 'cancelled'
  requested_at INTEGER NOT NULL,
  responded_at INTEGER,
  responded_by TEXT, -- user who approved/rejected
  response_reason TEXT, -- reason for approval/rejection
  expires_at INTEGER, -- optional expiration time
  FOREIGN KEY (server_id) REFERENCES servers(id),
  FOREIGN KEY (session_id) REFERENCES chat_sessions(id),
  FOREIGN KEY (plugin_id) REFERENCES plugins(id)
);

-- Audit log for all plugin operations
CREATE TABLE IF NOT EXISTS plugin_audit_log (
  id TEXT PRIMARY KEY,
  server_id TEXT NOT NULL,
  plugin_id TEXT NOT NULL,
  session_id TEXT, -- can be null if not from chat session
  approval_id TEXT, -- reference to approval if one was required
  operation TEXT NOT NULL, -- tool name executed
  parameters TEXT NOT NULL, -- JSON of tool parameters (sensitive data redacted)
  risk_level TEXT NOT NULL,
  status TEXT NOT NULL, -- 'success', 'failed', 'denied', 'cancelled'
  result TEXT, -- JSON result or error message
  error TEXT,
  executed_by TEXT, -- 'auto' or user identifier
  execution_time_ms INTEGER, -- how long the operation took
  created_at INTEGER NOT NULL,
  FOREIGN KEY (server_id) REFERENCES servers(id),
  FOREIGN KEY (plugin_id) REFERENCES plugins(id),
  FOREIGN KEY (session_id) REFERENCES chat_sessions(id),
  FOREIGN KEY (approval_id) REFERENCES approval_requests(id)
);

-- Plugin system indexes
CREATE INDEX IF NOT EXISTS idx_agent_plugins_server_id ON agent_plugins(server_id);
CREATE INDEX IF NOT EXISTS idx_agent_plugins_plugin_id ON agent_plugins(plugin_id);
CREATE INDEX IF NOT EXISTS idx_agent_plugins_status ON agent_plugins(status);

-- Chat system indexes
CREATE INDEX IF NOT EXISTS idx_chat_sessions_server_id ON chat_sessions(server_id);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_status ON chat_sessions(status);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_created_at ON chat_sessions(created_at);
CREATE INDEX IF NOT EXISTS idx_chat_messages_session_id ON chat_messages(session_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_created_at ON chat_messages(created_at);

-- Approval system indexes
CREATE INDEX IF NOT EXISTS idx_approval_requests_server_id ON approval_requests(server_id);
CREATE INDEX IF NOT EXISTS idx_approval_requests_session_id ON approval_requests(session_id);
CREATE INDEX IF NOT EXISTS idx_approval_requests_status ON approval_requests(status);
CREATE INDEX IF NOT EXISTS idx_approval_requests_requested_at ON approval_requests(requested_at);

-- Audit log indexes
CREATE INDEX IF NOT EXISTS idx_plugin_audit_log_server_id ON plugin_audit_log(server_id);
CREATE INDEX IF NOT EXISTS idx_plugin_audit_log_plugin_id ON plugin_audit_log(plugin_id);
CREATE INDEX IF NOT EXISTS idx_plugin_audit_log_session_id ON plugin_audit_log(session_id);
CREATE INDEX IF NOT EXISTS idx_plugin_audit_log_created_at ON plugin_audit_log(created_at);
CREATE INDEX IF NOT EXISTS idx_plugin_audit_log_risk_level ON plugin_audit_log(risk_level);
`;
