import { getServers, getAlerts, getAgentResponses, getAgentActions, getStats } from "@/lib/db";
import { Server, Activity, Bell, Bot, Clock, AlertCircle } from "lucide-react";
import Link from "next/link";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function formatDate(timestamp: number | string) {
  const ts = typeof timestamp === 'number' ? timestamp : parseInt(timestamp);
  return new Date(ts).toLocaleString();
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    active: "background: #22c55e20; color: #22c55e;",
    resolved: "background: #3b82f620; color: #3b82f6;",
    critical: "background: #ef444420; color: #ef4444;",
    warning: "background: #f59e0b20; color: #f59e0b;",
    pending: "background: #f59e0b20; color: #f59e0b;",
    executed: "background: #22c55e20; color: #22c55e;",
    skipped: "background: #a0a0a020; color: #a0a0a0;",
  };
  return (
    <span style={{ 
      padding: "2px 8px", 
      borderRadius: "4px", 
      fontSize: "12px",
      fontWeight: 500,
      ...Object.fromEntries(
        (colors[status] || colors.active).split(";").filter(Boolean).map(s => s.split(":").map(x => x.trim()))
      )
    }}>
      {status}
    </span>
  );
}

export default async function Dashboard() {
  const [servers, alerts, responses, actions, stats] = await Promise.all([
    getServers(),
    getAlerts(20),
    getAgentResponses(20),
    getAgentActions(20),
    getStats(),
  ]);

  const cardStyle = {
    background: "#141414",
    border: "1px solid #2a2a2a",
    borderRadius: "8px",
    padding: "20px",
  };

  const statCardStyle = {
    ...cardStyle,
    display: "flex",
    alignItems: "center",
    gap: "16px",
  };

  return (
    <div style={{ maxWidth: "1400px", margin: "0 auto", padding: "24px" }}>
      <header style={{ marginBottom: "32px" }}>
        <h1 style={{ fontSize: "28px", fontWeight: 600, marginBottom: "8px" }}>
          OpsAgent Control Panel
        </h1>
        <p style={{ color: "#a0a0a0" }}>Monitor all your servers and AI agent activity</p>
      </header>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "16px", marginBottom: "32px" }}>
        <div style={statCardStyle}>
          <Server size={32} color="#3b82f6" />
          <div>
            <div style={{ fontSize: "24px", fontWeight: 600 }}>{stats.activeServers}</div>
            <div style={{ color: "#a0a0a0", fontSize: "14px" }}>Active Servers</div>
          </div>
        </div>
        <div style={statCardStyle}>
          <Bell size={32} color="#f59e0b" />
          <div>
            <div style={{ fontSize: "24px", fontWeight: 600 }}>{stats.activeAlerts}</div>
            <div style={{ color: "#a0a0a0", fontSize: "14px" }}>Active Alerts</div>
          </div>
        </div>
        <div style={statCardStyle}>
          <Activity size={32} color="#22c55e" />
          <div>
            <div style={{ fontSize: "24px", fontWeight: 600 }}>{stats.pendingActions}</div>
            <div style={{ color: "#a0a0a0", fontSize: "14px" }}>Pending Actions</div>
          </div>
        </div>
        <Link href="/issues" style={{ textDecoration: "none" }}>
          <div style={{ ...statCardStyle, cursor: "pointer", transition: "all 0.2s" }}>
            <AlertCircle size={32} color="#ef4444" />
            <div>
              <div style={{ fontSize: "24px", fontWeight: 600 }}>{stats.openIssues || 0}</div>
              <div style={{ color: "#a0a0a0", fontSize: "14px" }}>Open Issues →</div>
            </div>
          </div>
        </Link>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px" }}>
        {/* Servers */}
        <div style={cardStyle}>
          <h2 style={{ fontSize: "18px", fontWeight: 600, marginBottom: "16px", display: "flex", alignItems: "center", gap: "8px" }}>
            <Server size={20} /> Servers
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {servers.length === 0 ? (
              <p style={{ color: "#a0a0a0" }}>No servers registered yet</p>
            ) : (
              servers.map((server) => (
                <div key={server.id} style={{ padding: "12px", background: "#1a1a1a", borderRadius: "6px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontWeight: 500 }}>{server.name || server.hostname}</span>
                    <StatusBadge status={server.status} />
                  </div>
                  <div style={{ fontSize: "12px", color: "#a0a0a0", marginTop: "4px" }}>
                    {server.hostname} | Last seen: {formatDate(server.last_seen_at)}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Alerts */}
        <div style={cardStyle}>
          <h2 style={{ fontSize: "18px", fontWeight: 600, marginBottom: "16px", display: "flex", alignItems: "center", gap: "8px" }}>
            <Bell size={20} /> Recent Alerts
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: "12px", maxHeight: "400px", overflow: "auto" }}>
            {alerts.length === 0 ? (
              <p style={{ color: "#a0a0a0" }}>No alerts</p>
            ) : (
              alerts.map((alert) => (
                <div key={alert.id} style={{ padding: "12px", background: "#1a1a1a", borderRadius: "6px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontWeight: 500 }}>{alert.metric}</span>
                    <StatusBadge status={alert.severity} />
                  </div>
                  <div style={{ fontSize: "13px", marginTop: "4px" }}>{alert.message}</div>
                  <div style={{ fontSize: "12px", color: "#a0a0a0", marginTop: "4px" }}>
                    {alert.hostname} | {formatDate(alert.created_at)}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Agent Responses */}
        <div style={cardStyle}>
          <h2 style={{ fontSize: "18px", fontWeight: 600, marginBottom: "16px", display: "flex", alignItems: "center", gap: "8px" }}>
            <Bot size={20} /> Agent Analysis
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: "12px", maxHeight: "400px", overflow: "auto" }}>
            {responses.length === 0 ? (
              <p style={{ color: "#a0a0a0" }}>No agent responses yet</p>
            ) : (
              responses.map((response) => (
                <div key={response.id} style={{ padding: "12px", background: "#1a1a1a", borderRadius: "6px" }}>
                  <div style={{ fontSize: "13px", marginBottom: "8px" }}>{response.analysis}</div>
                  <div style={{ fontSize: "12px", color: "#a0a0a0" }}>
                    {response.hostname} | {response.model} | {formatDate(response.created_at)}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Agent Actions */}
        <div style={cardStyle}>
          <h2 style={{ fontSize: "18px", fontWeight: 600, marginBottom: "16px", display: "flex", alignItems: "center", gap: "8px" }}>
            <Activity size={20} /> Agent Actions
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: "12px", maxHeight: "400px", overflow: "auto" }}>
            {actions.length === 0 ? (
              <p style={{ color: "#a0a0a0" }}>No actions yet</p>
            ) : (
              actions.map((action) => (
                <div key={action.id} style={{ padding: "12px", background: "#1a1a1a", borderRadius: "6px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontWeight: 500, fontFamily: "monospace" }}>{action.action_type}</span>
                    <StatusBadge status={action.status} />
                  </div>
                  <div style={{ fontSize: "13px", marginTop: "4px" }}>{action.description}</div>
                  {action.output && (
                    <div style={{ fontSize: "12px", color: "#22c55e", marginTop: "4px" }}>
                      Result: {action.output}
                    </div>
                  )}
                  <div style={{ fontSize: "12px", color: "#a0a0a0", marginTop: "4px" }}>
                    {action.hostname} | {action.executed_at ? formatDate(action.executed_at) : "Pending"}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <footer style={{ marginTop: "32px", textAlign: "center", color: "#a0a0a0", fontSize: "14px" }}>
        <Clock size={14} style={{ display: "inline", marginRight: "4px" }} />
        Last updated: {new Date().toLocaleString()}
      </footer>
    </div>
  );
}
