import { getServers, getAlerts, getAgentResponses, getAgentActions, getStats, getExtendedStats } from "@/lib/db";
import { Server, Activity, Bell, Bot, Clock, AlertCircle, MessageSquare, Shield, Plug } from "lucide-react";
import Link from "next/link";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function formatDate(timestamp: number | string) {
  const ts = typeof timestamp === 'number' ? timestamp : parseInt(timestamp);
  return new Date(ts).toLocaleString();
}

function parseAnalysis(analysis: string): string {
  if (!analysis) return "";

  const trimmed = analysis.trim();

  // Try to extract analysis from various formats
  try {
    // Remove markdown code fence if present
    let content = trimmed;
    if (content.startsWith("```json")) {
      content = content.replace(/^```json\s*/, "").replace(/```\s*$/, "");
    } else if (content.startsWith("```")) {
      content = content.replace(/^```\s*/, "").replace(/```\s*$/, "");
    }

    // Try to parse as JSON
    if (content.startsWith("{")) {
      try {
        const parsed = JSON.parse(content);
        if (parsed.analysis) {
          return parsed.analysis;
        }
      } catch {
        // JSON parse failed, try regex extraction for truncated JSON
        const analysisMatch = content.match(/"analysis"\s*:\s*"([^"]+)/);
        if (analysisMatch && analysisMatch[1]) {
          // Unescape basic escape sequences
          return analysisMatch[1]
            .replace(/\\n/g, " ")
            .replace(/\\"/g, '"')
            .replace(/\\\\/g, "\\");
        }
      }
    }
  } catch {
    // Extraction failed
  }

  // If it's just plain text (not JSON-like), return it
  if (!trimmed.startsWith("{") && !trimmed.startsWith("```")) {
    return trimmed.slice(0, 500) + (trimmed.length > 500 ? "..." : "");
  }

  // Last resort: try regex on original
  const analysisMatch = trimmed.match(/"analysis"\s*:\s*"([^"]+)/);
  if (analysisMatch && analysisMatch[1]) {
    return analysisMatch[1]
      .replace(/\\n/g, " ")
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, "\\");
  }

  return "Analysis parsing failed";
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    active: "background: #22c55e20; color: #22c55e;",
    offline: "background: #6b728020; color: #6b7280;",
    resolved: "background: #3b82f620; color: #3b82f6;",
    critical: "background: #ef444420; color: #ef4444;",
    warning: "background: #f59e0b20; color: #f59e0b;",
    pending: "background: #f59e0b20; color: #f59e0b;",
    executed: "background: #22c55e20; color: #22c55e;",
    skipped: "background: #a0a0a020; color: #a0a0a0;",
    failed: "background: #ef444420; color: #ef4444;",
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

export default async function Dashboard({
  searchParams,
}: {
  searchParams: { server?: string };
}) {
  const serverFilter = searchParams.server || "all";

  const [servers, allAlerts, allResponses, allActions, stats, extendedStats] = await Promise.all([
    getServers(),
    getAlerts(50),
    getAgentResponses(50),
    getAgentActions(50),
    getStats(),
    getExtendedStats(),
  ]);

  // Filter by server if needed
  const alerts = serverFilter === "all"
    ? allAlerts.slice(0, 20)
    : allAlerts.filter(a => a.server_id === serverFilter).slice(0, 20);

  const responses = serverFilter === "all"
    ? allResponses.slice(0, 20)
    : allResponses.filter(r => r.server_id === serverFilter).slice(0, 20);

  const actions = serverFilter === "all"
    ? allActions.slice(0, 20)
    : allActions.filter(a => a.server_id === serverFilter).slice(0, 20);

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
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "16px", marginBottom: "24px" }}>
        <Link href="/agents" style={{ textDecoration: "none" }}>
          <div style={{ ...statCardStyle, cursor: "pointer", transition: "all 0.2s" }}>
            <Server size={32} color="#3b82f6" />
            <div>
              <div style={{ fontSize: "24px", fontWeight: 600 }}>{stats.activeServers}</div>
              <div style={{ color: "#a0a0a0", fontSize: "14px" }}>Active Agents →</div>
            </div>
          </div>
        </Link>
        <div style={statCardStyle}>
          <Bell size={32} color="#f59e0b" />
          <div>
            <div style={{ fontSize: "24px", fontWeight: 600 }}>{stats.activeAlerts}</div>
            <div style={{ color: "#a0a0a0", fontSize: "14px" }}>Active Alerts</div>
          </div>
        </div>
        <Link href="/sessions" style={{ textDecoration: "none" }}>
          <div style={{ ...statCardStyle, cursor: "pointer", transition: "all 0.2s" }}>
            <MessageSquare size={32} color="#8b5cf6" />
            <div>
              <div style={{ fontSize: "24px", fontWeight: 600 }}>{extendedStats.activeSessions || 0}</div>
              <div style={{ color: "#a0a0a0", fontSize: "14px" }}>Chat Sessions →</div>
            </div>
          </div>
        </Link>
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

      {/* Secondary Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "16px", marginBottom: "24px" }}>
        <div style={statCardStyle}>
          <Plug size={32} color="#22c55e" />
          <div>
            <div style={{ fontSize: "24px", fontWeight: 600 }}>{extendedStats.healthyPlugins || 0}/{extendedStats.totalPlugins || 0}</div>
            <div style={{ color: "#a0a0a0", fontSize: "14px" }}>Healthy Plugins</div>
          </div>
        </div>
        <Link href="/approvals" style={{ textDecoration: "none" }}>
          <div style={{ ...statCardStyle, cursor: "pointer", transition: "all 0.2s" }}>
            <Shield size={32} color="#f59e0b" />
            <div>
              <div style={{ fontSize: "24px", fontWeight: 600 }}>{extendedStats.pendingApprovals || 0}</div>
              <div style={{ color: "#a0a0a0", fontSize: "14px" }}>Pending Approvals →</div>
            </div>
          </div>
        </Link>
        <div style={statCardStyle}>
          <Activity size={32} color="#22c55e" />
          <div>
            <div style={{ fontSize: "24px", fontWeight: 600 }}>{stats.pendingActions}</div>
            <div style={{ color: "#a0a0a0", fontSize: "14px" }}>Pending Actions</div>
          </div>
        </div>
        <Link href="/audit" style={{ textDecoration: "none" }}>
          <div style={{ ...statCardStyle, cursor: "pointer", transition: "all 0.2s" }}>
            <Clock size={32} color="#6b7280" />
            <div>
              <div style={{ fontSize: "24px", fontWeight: 600 }}>→</div>
              <div style={{ color: "#a0a0a0", fontSize: "14px" }}>Audit Log →</div>
            </div>
          </div>
        </Link>
      </div>

      {/* Server Filter */}
      <div style={{ marginBottom: "24px", display: "flex", alignItems: "center", gap: "8px" }}>
        <span style={{ fontSize: "14px", color: "#a0a0a0" }}>Filter by server:</span>
        <Link
          href="/"
          style={{
            padding: "6px 12px",
            borderRadius: "4px",
            fontSize: "13px",
            textDecoration: "none",
            background: serverFilter === "all" ? "#3b82f6" : "#1a1a1a",
            color: serverFilter === "all" ? "#fff" : "#a0a0a0",
          }}
        >
          All Servers
        </Link>
        {servers.map((server) => (
          <Link
            key={server.id}
            href={`/?server=${server.id}`}
            style={{
              padding: "6px 12px",
              borderRadius: "4px",
              fontSize: "13px",
              textDecoration: "none",
              background: serverFilter === server.id ? "#3b82f6" : "#1a1a1a",
              color: serverFilter === server.id ? "#fff" : "#a0a0a0",
            }}
          >
            {server.name || server.hostname}
          </Link>
        ))}
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
                    {server.hostname} | {server.ip_address} | Last seen: {formatDate(server.last_seen_at)}
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
                  <div style={{ fontSize: "13px", marginBottom: "8px", lineHeight: 1.5 }}>
                    {parseAnalysis(response.analysis)}
                  </div>
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
                      Result: {action.output.slice(0, 200)}{action.output.length > 200 ? "..." : ""}
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
