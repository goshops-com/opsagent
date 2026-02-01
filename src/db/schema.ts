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

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_alerts_server_id ON alerts(server_id);
CREATE INDEX IF NOT EXISTS idx_alerts_created_at ON alerts(created_at);
CREATE INDEX IF NOT EXISTS idx_alerts_severity ON alerts(severity);
CREATE INDEX IF NOT EXISTS idx_alerts_resolved ON alerts(resolved_at);
CREATE INDEX IF NOT EXISTS idx_agent_responses_alert_id ON agent_responses(alert_id);
CREATE INDEX IF NOT EXISTS idx_agent_actions_alert_id ON agent_actions(alert_id);
CREATE INDEX IF NOT EXISTS idx_metrics_server_timestamp ON metrics_snapshots(server_id, timestamp);
`;
