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
  os_info: string | null;
  status: string;
  last_seen: string;
  created_at: string;
}

export interface Alert {
  id: number;
  server_id: string;
  rule_name: string;
  severity: string;
  message: string;
  metric_value: number | null;
  threshold_value: number | null;
  status: string;
  created_at: string;
  resolved_at: string | null;
  hostname?: string;
}

export interface AgentResponse {
  id: number;
  server_id: string;
  alert_id: number | null;
  analysis: string;
  recommendation: string | null;
  can_auto_remediate: number;
  requires_human_attention: number;
  created_at: string;
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
  executed_at: string | null;
  created_at: string;
  hostname?: string;
}

export async function getServers(): Promise<Server[]> {
  const result = await db.execute("SELECT * FROM servers ORDER BY last_seen DESC");
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
          ORDER BY aa.created_at DESC
          LIMIT ?`,
    args: [limit],
  });
  return result.rows as unknown as AgentAction[];
}

export async function getStats() {
  const [servers, alerts, pendingActions] = await Promise.all([
    db.execute("SELECT COUNT(*) as count FROM servers WHERE status = 'active'"),
    db.execute("SELECT COUNT(*) as count FROM alerts WHERE status = 'active'"),
    db.execute("SELECT COUNT(*) as count FROM agent_actions WHERE status = 'pending'"),
  ]);

  return {
    activeServers: Number(servers.rows[0]?.count ?? 0),
    activeAlerts: Number(alerts.rows[0]?.count ?? 0),
    pendingActions: Number(pendingActions.rows[0]?.count ?? 0),
  };
}
