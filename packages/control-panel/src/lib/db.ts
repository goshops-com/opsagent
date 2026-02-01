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
