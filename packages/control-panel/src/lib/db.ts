import { createClient } from "@libsql/client";

export const db = createClient({
  url: process.env.TURSO_DATABASE_URL || "",
  authToken: process.env.TURSO_AUTH_TOKEN || "",
});

export interface Server {
  id: string;
  hostname: string;
  name: string | null;
  ip_address: string | null;
  os: string | null;
  os_version: string | null;
  status: string;
  last_seen_at: number;
  first_seen_at: number;
}

export interface Alert {
  id: string;
  server_id: string;
  severity: string;
  message: string;
  metric: string;
  current_value: number;
  threshold: number;
  created_at: number;
  resolved_at: number | null;
  acknowledged: number;
  hostname?: string;
}

export interface AgentResponse {
  id: string;
  server_id: string;
  alert_id: string | null;
  model: string;
  analysis: string;
  can_auto_remediate: number;
  requires_human_attention: number;
  human_notification_reason: string | null;
  created_at: number;
  hostname?: string;
}

export interface AgentAction {
  id: number;
  server_id: string;
  response_id: number | null;
  action_type: string;
  description: string;
  status: string;
  result: string | null;
  output: string | null;
  executed_at: string | null;
  hostname?: string;
}

export async function getServers(): Promise<Server[]> {
  const result = await db.execute("SELECT * FROM servers ORDER BY last_seen_at DESC");
  return result.rows as unknown as Server[];
}

export async function getServerById(id: string): Promise<Server | null> {
  const result = await db.execute({
    sql: "SELECT * FROM servers WHERE id = ?",
    args: [id],
  });
  if (result.rows.length === 0) return null;
  return result.rows[0] as unknown as Server;
}

export async function getAlerts(limit = 50): Promise<Alert[]> {
  const result = await db.execute({
    sql: `SELECT a.*, s.hostname
          FROM alerts a
          LEFT JOIN servers s ON a.server_id = s.id
          ORDER BY a.created_at DESC
          LIMIT ?`,
    args: [limit],
  });
  return result.rows as unknown as Alert[];
}

export async function getAgentResponses(limit = 50): Promise<AgentResponse[]> {
  const result = await db.execute({
    sql: `SELECT ar.*, s.hostname
          FROM agent_responses ar
          LEFT JOIN servers s ON ar.server_id = s.id
          ORDER BY ar.created_at DESC
          LIMIT ?`,
    args: [limit],
  });
  return result.rows as unknown as AgentResponse[];
}

export async function getAgentActions(limit = 50): Promise<AgentAction[]> {
  const result = await db.execute({
    sql: `SELECT aa.*, s.hostname
          FROM agent_actions aa
          LEFT JOIN servers s ON aa.server_id = s.id
          ORDER BY aa.executed_at DESC
          LIMIT ?`,
    args: [limit],
  });
  return result.rows as unknown as AgentAction[];
}

export async function getStats() {
  const [servers, alerts, pendingActions, openIssues] = await Promise.all([
    db.execute("SELECT COUNT(*) as count FROM servers WHERE status = 'active'"),
    db.execute("SELECT COUNT(*) as count FROM alerts WHERE resolved_at IS NULL"),
    db.execute("SELECT COUNT(*) as count FROM agent_actions WHERE status = 'pending'"),
    db.execute("SELECT COUNT(*) as count FROM issues WHERE status IN ('open', 'investigating')"),
  ]);

  return {
    activeServers: Number(servers.rows[0]?.count ?? 0),
    activeAlerts: Number(alerts.rows[0]?.count ?? 0),
    pendingActions: Number(pendingActions.rows[0]?.count ?? 0),
    openIssues: Number(openIssues.rows[0]?.count ?? 0),
  };
}

// ============================================================================
// ISSUE MANAGEMENT
// ============================================================================

export interface Issue {
  id: string;
  server_id: string;
  alert_fingerprint: string;
  title: string;
  description: string | null;
  severity: string;
  status: "open" | "investigating" | "resolved" | "closed";
  source: string;
  source_alert_id: string | null;
  first_seen_at: string;
  last_seen_at: string;
  resolved_at: string | null;
  alert_count: number;
  metadata: string | null;
  hostname?: string;
}

export interface IssueComment {
  id: number;
  issue_id: string;
  author_type: "agent" | "human";
  author_name: string | null;
  comment_type: "analysis" | "action" | "status_change" | "alert_fired" | "note" | "feedback";
  content: string;
  metadata: string | null;
  created_at: string;
}

export async function getIssues(status?: string, limit = 50): Promise<Issue[]> {
  let sql = `SELECT i.*, s.hostname 
             FROM issues i 
             LEFT JOIN servers s ON i.server_id = s.id`;
  const args: (string | number)[] = [];
  
  if (status && status !== "all") {
    sql += " WHERE i.status = ?";
    args.push(status);
  }
  
  sql += " ORDER BY i.last_seen_at DESC LIMIT ?";
  args.push(limit);
  
  const result = await db.execute({ sql, args });
  return result.rows as unknown as Issue[];
}

export async function getIssueById(id: string): Promise<Issue | null> {
  const result = await db.execute({
    sql: `SELECT i.*, s.hostname 
          FROM issues i 
          LEFT JOIN servers s ON i.server_id = s.id 
          WHERE i.id = ?`,
    args: [id],
  });
  
  if (result.rows.length === 0) return null;
  return result.rows[0] as unknown as Issue;
}

export async function getIssueComments(issueId: string): Promise<IssueComment[]> {
  const result = await db.execute({
    sql: `SELECT * FROM issue_comments 
          WHERE issue_id = ? 
          ORDER BY created_at ASC`,
    args: [issueId],
  });
  return result.rows as unknown as IssueComment[];
}

export async function updateIssueStatus(
  issueId: string, 
  status: string, 
  authorName?: string
): Promise<void> {
  const now = Date.now();
  const resolvedAt = status === "resolved" || status === "closed" ? now : null;
  
  // Update issue status
  await db.execute({
    sql: `UPDATE issues 
          SET status = ?, resolved_at = ?, last_seen_at = ? 
          WHERE id = ?`,
    args: [status, resolvedAt, now, issueId],
  });
  
  // Add status change comment
  await db.execute({
    sql: `INSERT INTO issue_comments 
          (issue_id, author_type, author_name, comment_type, content, metadata, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)`,
    args: [
      issueId,
      "human",
      authorName || "Control Panel User",
      "status_change",
      `Status changed to ${status}`,
      JSON.stringify({ newStatus: status, changedBy: authorName || "Control Panel" }),
      now,
    ],
  });
}

export async function addIssueComment(
  issueId: string,
  content: string,
  authorName?: string,
  commentType: IssueComment["comment_type"] = "note"
): Promise<void> {
  await db.execute({
    sql: `INSERT INTO issue_comments 
          (issue_id, author_type, author_name, comment_type, content, metadata, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)`,
    args: [
      issueId,
      "human",
      authorName || "Control Panel User",
      commentType,
      content,
      JSON.stringify({ addedBy: authorName || "Control Panel" }),
      Date.now(),
    ],
  });
  
  // Update last_seen_at on the issue
  await db.execute({
    sql: "UPDATE issues SET last_seen_at = ? WHERE id = ?",
    args: [Date.now(), issueId],
  });
}

export async function discardIssue(issueId: string, authorName?: string): Promise<void> {
  // Discard = close with a note
  await updateIssueStatus(issueId, "closed", authorName);
  
  // Add discard note
  await db.execute({
    sql: `INSERT INTO issue_comments 
          (issue_id, author_type, author_name, comment_type, content, metadata, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)`,
    args: [
      issueId,
      "human",
      authorName || "Control Panel User",
      "note",
      "Issue discarded/closed by user",
      JSON.stringify({ action: "discard", closedBy: authorName || "Control Panel" }),
      Date.now(),
    ],
  });
}

export async function getIssueStats() {
  const [open, investigating, resolved, closed, total] = await Promise.all([
    db.execute("SELECT COUNT(*) as count FROM issues WHERE status = 'open'"),
    db.execute("SELECT COUNT(*) as count FROM issues WHERE status = 'investigating'"),
    db.execute("SELECT COUNT(*) as count FROM issues WHERE status = 'resolved'"),
    db.execute("SELECT COUNT(*) as count FROM issues WHERE status = 'closed'"),
    db.execute("SELECT COUNT(*) as count FROM issues"),
  ]);

  return {
    open: Number(open.rows[0]?.count ?? 0),
    investigating: Number(investigating.rows[0]?.count ?? 0),
    resolved: Number(resolved.rows[0]?.count ?? 0),
    closed: Number(closed.rows[0]?.count ?? 0),
    total: Number(total.rows[0]?.count ?? 0),
  };
}

// ============================================================================
// PLUGIN MANAGEMENT
// ============================================================================

export interface Plugin {
  id: string;
  name: string;
  version: string;
  type: string;
  description: string | null;
  capabilities: string;
  tools: string;
  risk_levels: string;
  created_at: number;
  updated_at: number | null;
}

export interface AgentPlugin {
  id: string;
  server_id: string;
  plugin_id: string;
  config: string;
  status: "active" | "inactive" | "error";
  health_status: "healthy" | "unhealthy" | "unknown";
  health_message: string | null;
  enabled: number;
  last_health_check: number | null;
  created_at: number;
  updated_at: number | null;
  hostname?: string;
  plugin_name?: string;
  plugin_type?: string;
}

export async function getPlugins(): Promise<Plugin[]> {
  const result = await db.execute("SELECT * FROM plugins ORDER BY name ASC");
  return result.rows as unknown as Plugin[];
}

export async function getPluginById(id: string): Promise<Plugin | null> {
  const result = await db.execute({
    sql: "SELECT * FROM plugins WHERE id = ?",
    args: [id],
  });
  if (result.rows.length === 0) return null;
  return result.rows[0] as unknown as Plugin;
}

export async function getAgentPlugins(serverId?: string): Promise<AgentPlugin[]> {
  let sql = `
    SELECT ap.*, s.hostname, p.name as plugin_name, p.type as plugin_type
    FROM agent_plugins ap
    LEFT JOIN servers s ON ap.server_id = s.id
    LEFT JOIN plugins p ON ap.plugin_id = p.id
  `;
  const args: string[] = [];

  if (serverId) {
    sql += " WHERE ap.server_id = ?";
    args.push(serverId);
  }

  sql += " ORDER BY ap.created_at DESC";

  const result = await db.execute({ sql, args });
  return result.rows as unknown as AgentPlugin[];
}

export async function getAgentPluginById(id: string): Promise<AgentPlugin | null> {
  const result = await db.execute({
    sql: `
      SELECT ap.*, s.hostname, p.name as plugin_name, p.type as plugin_type
      FROM agent_plugins ap
      LEFT JOIN servers s ON ap.server_id = s.id
      LEFT JOIN plugins p ON ap.plugin_id = p.id
      WHERE ap.id = ?
    `,
    args: [id],
  });
  if (result.rows.length === 0) return null;
  return result.rows[0] as unknown as AgentPlugin;
}

// ============================================================================
// CHAT SESSIONS
// ============================================================================

export interface ChatSession {
  id: string;
  server_id: string;
  title: string;
  status: "active" | "closed" | "archived";
  context: string | null;
  created_at: number;
  updated_at: number | null;
  created_by: string | null;
  closed_at: number | null;
  hostname?: string;
  message_count?: number;
}

export interface ChatMessage {
  id: string;
  session_id: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  tool_calls: string | null;
  tool_results: string | null;
  metadata: string | null;
  created_at: number;
}

export async function getChatSessions(
  serverId?: string,
  status?: string,
  limit = 50
): Promise<ChatSession[]> {
  let sql = `
    SELECT cs.*, s.hostname,
           (SELECT COUNT(*) FROM chat_messages cm WHERE cm.session_id = cs.id) as message_count
    FROM chat_sessions cs
    LEFT JOIN servers s ON cs.server_id = s.id
    WHERE 1=1
  `;
  const args: (string | number)[] = [];

  if (serverId) {
    sql += " AND cs.server_id = ?";
    args.push(serverId);
  }

  if (status && status !== "all") {
    sql += " AND cs.status = ?";
    args.push(status);
  }

  sql += " ORDER BY cs.updated_at DESC LIMIT ?";
  args.push(limit);

  const result = await db.execute({ sql, args });
  return result.rows as unknown as ChatSession[];
}

export async function getChatSessionById(id: string): Promise<ChatSession | null> {
  const result = await db.execute({
    sql: `
      SELECT cs.*, s.hostname,
             (SELECT COUNT(*) FROM chat_messages cm WHERE cm.session_id = cs.id) as message_count
      FROM chat_sessions cs
      LEFT JOIN servers s ON cs.server_id = s.id
      WHERE cs.id = ?
    `,
    args: [id],
  });
  if (result.rows.length === 0) return null;
  return result.rows[0] as unknown as ChatSession;
}

export async function getChatMessages(
  sessionId: string,
  limit = 100
): Promise<ChatMessage[]> {
  const result = await db.execute({
    sql: `
      SELECT * FROM chat_messages
      WHERE session_id = ?
      ORDER BY created_at ASC
      LIMIT ?
    `,
    args: [sessionId, limit],
  });
  return result.rows as unknown as ChatMessage[];
}

export async function updateChatSessionStatus(
  sessionId: string,
  status: "active" | "closed" | "archived"
): Promise<void> {
  const now = Date.now();
  const closedAt = status === "closed" || status === "archived" ? now : null;

  await db.execute({
    sql: `
      UPDATE chat_sessions
      SET status = ?, updated_at = ?, closed_at = ?
      WHERE id = ?
    `,
    args: [status, now, closedAt, sessionId],
  });
}

// ============================================================================
// APPROVAL REQUESTS
// ============================================================================

export interface ApprovalRequest {
  id: string;
  server_id: string;
  session_id: string | null;
  plugin_id: string;
  message_id: string | null;
  operation: string;
  parameters: string;
  risk_level: "low" | "medium" | "high" | "critical";
  reason: string;
  status: "pending" | "approved" | "rejected" | "expired" | "cancelled";
  requested_at: number;
  responded_at: number | null;
  responded_by: string | null;
  response_reason: string | null;
  expires_at: number | null;
  hostname?: string;
  plugin_name?: string;
}

export async function getApprovalRequests(
  status?: string,
  serverId?: string,
  limit = 50
): Promise<ApprovalRequest[]> {
  let sql = `
    SELECT ar.*, s.hostname, p.name as plugin_name
    FROM approval_requests ar
    LEFT JOIN servers s ON ar.server_id = s.id
    LEFT JOIN plugins p ON ar.plugin_id = p.id
    WHERE 1=1
  `;
  const args: (string | number)[] = [];

  if (status && status !== "all") {
    sql += " AND ar.status = ?";
    args.push(status);
  }

  if (serverId) {
    sql += " AND ar.server_id = ?";
    args.push(serverId);
  }

  sql += " ORDER BY ar.requested_at DESC LIMIT ?";
  args.push(limit);

  const result = await db.execute({ sql, args });
  return result.rows as unknown as ApprovalRequest[];
}

export async function getApprovalRequestById(id: string): Promise<ApprovalRequest | null> {
  const result = await db.execute({
    sql: `
      SELECT ar.*, s.hostname, p.name as plugin_name
      FROM approval_requests ar
      LEFT JOIN servers s ON ar.server_id = s.id
      LEFT JOIN plugins p ON ar.plugin_id = p.id
      WHERE ar.id = ?
    `,
    args: [id],
  });
  if (result.rows.length === 0) return null;
  return result.rows[0] as unknown as ApprovalRequest;
}

export async function getPendingApprovalsCount(): Promise<number> {
  const result = await db.execute(
    "SELECT COUNT(*) as count FROM approval_requests WHERE status = 'pending'"
  );
  return Number(result.rows[0]?.count ?? 0);
}

export async function updateApprovalStatus(
  approvalId: string,
  status: "approved" | "rejected",
  respondedBy: string,
  responseReason?: string
): Promise<void> {
  await db.execute({
    sql: `
      UPDATE approval_requests
      SET status = ?, responded_at = ?, responded_by = ?, response_reason = ?
      WHERE id = ?
    `,
    args: [status, Date.now(), respondedBy, responseReason || null, approvalId],
  });
}

// ============================================================================
// AUDIT LOG
// ============================================================================

export interface AuditLogEntry {
  id: string;
  server_id: string;
  plugin_id: string;
  session_id: string | null;
  approval_id: string | null;
  operation: string;
  parameters: string;
  risk_level: "low" | "medium" | "high" | "critical";
  status: "success" | "failed" | "denied" | "cancelled";
  result: string | null;
  error: string | null;
  executed_by: string;
  execution_time_ms: number | null;
  created_at: number;
  hostname?: string;
  plugin_name?: string;
}

export async function getAuditLog(
  filter?: {
    serverId?: string;
    pluginId?: string;
    riskLevel?: string;
    status?: string;
    since?: number;
  },
  limit = 100
): Promise<AuditLogEntry[]> {
  let sql = `
    SELECT al.*, s.hostname, p.name as plugin_name
    FROM plugin_audit_log al
    LEFT JOIN servers s ON al.server_id = s.id
    LEFT JOIN plugins p ON al.plugin_id = p.id
    WHERE 1=1
  `;
  const args: (string | number)[] = [];

  if (filter?.serverId) {
    sql += " AND al.server_id = ?";
    args.push(filter.serverId);
  }

  if (filter?.pluginId) {
    sql += " AND al.plugin_id = ?";
    args.push(filter.pluginId);
  }

  if (filter?.riskLevel) {
    sql += " AND al.risk_level = ?";
    args.push(filter.riskLevel);
  }

  if (filter?.status) {
    sql += " AND al.status = ?";
    args.push(filter.status);
  }

  if (filter?.since) {
    sql += " AND al.created_at >= ?";
    args.push(filter.since);
  }

  sql += " ORDER BY al.created_at DESC LIMIT ?";
  args.push(limit);

  const result = await db.execute({ sql, args });
  return result.rows as unknown as AuditLogEntry[];
}

export async function getAuditLogStats(serverId?: string) {
  let whereClause = "";
  const args: string[] = [];

  if (serverId) {
    whereClause = "WHERE server_id = ?";
    args.push(serverId);
  }

  const [total, byStatus, byRisk, recent] = await Promise.all([
    db.execute({ sql: `SELECT COUNT(*) as count FROM plugin_audit_log ${whereClause}`, args }),
    db.execute({
      sql: `
        SELECT status, COUNT(*) as count
        FROM plugin_audit_log ${whereClause}
        GROUP BY status
      `,
      args,
    }),
    db.execute({
      sql: `
        SELECT risk_level, COUNT(*) as count
        FROM plugin_audit_log ${whereClause}
        GROUP BY risk_level
      `,
      args,
    }),
    db.execute({
      sql: `
        SELECT COUNT(*) as count
        FROM plugin_audit_log
        ${whereClause ? whereClause + " AND" : "WHERE"} created_at >= ?
      `,
      args: [...args, Date.now() - 86400000],
    }),
  ]);

  return {
    total: Number(total.rows[0]?.count ?? 0),
    byStatus: Object.fromEntries(
      byStatus.rows.map((r: any) => [r.status, Number(r.count)])
    ),
    byRiskLevel: Object.fromEntries(
      byRisk.rows.map((r: any) => [r.risk_level, Number(r.count)])
    ),
    last24Hours: Number(recent.rows[0]?.count ?? 0),
  };
}

// ============================================================================
// EXTENDED STATS
// ============================================================================

export async function getExtendedStats() {
  const [baseStats, pluginStats, sessionStats, approvalStats] = await Promise.all([
    getStats(),
    db.execute(`
      SELECT
        COUNT(*) as total_plugins,
        SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active_plugins,
        SUM(CASE WHEN health_status = 'healthy' THEN 1 ELSE 0 END) as healthy_plugins
      FROM agent_plugins
    `),
    db.execute(`
      SELECT
        COUNT(*) as total_sessions,
        SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active_sessions
      FROM chat_sessions
    `),
    db.execute(`
      SELECT COUNT(*) as pending_approvals
      FROM approval_requests
      WHERE status = 'pending'
    `),
  ]);

  return {
    ...baseStats,
    totalPlugins: Number(pluginStats.rows[0]?.total_plugins ?? 0),
    activePlugins: Number(pluginStats.rows[0]?.active_plugins ?? 0),
    healthyPlugins: Number(pluginStats.rows[0]?.healthy_plugins ?? 0),
    totalSessions: Number(sessionStats.rows[0]?.total_sessions ?? 0),
    activeSessions: Number(sessionStats.rows[0]?.active_sessions ?? 0),
    pendingApprovals: Number(approvalStats.rows[0]?.pending_approvals ?? 0),
  };
}
