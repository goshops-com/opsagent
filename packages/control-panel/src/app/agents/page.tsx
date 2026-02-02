import { getServers, getAgentPlugins, getExtendedStats } from "@/lib/db";
import { Server, Plug, Activity, CheckCircle, XCircle, AlertCircle } from "lucide-react";
import Link from "next/link";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function formatDate(timestamp: number | string | null) {
  if (!timestamp) return "Never";
  const ts = typeof timestamp === "number" ? timestamp : parseInt(timestamp);
  return new Date(ts).toLocaleString();
}

function HealthBadge({ status }: { status: string }) {
  const config: Record<string, { bg: string; color: string; icon: React.ReactNode }> = {
    healthy: { bg: "#22c55e20", color: "#22c55e", icon: <CheckCircle size={12} /> },
    unhealthy: { bg: "#ef444420", color: "#ef4444", icon: <XCircle size={12} /> },
    unknown: { bg: "#6b728020", color: "#6b7280", icon: <AlertCircle size={12} /> },
  };
  const { bg, color, icon } = config[status] || config.unknown;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "4px",
        padding: "2px 8px",
        borderRadius: "4px",
        fontSize: "12px",
        fontWeight: 500,
        background: bg,
        color: color,
      }}
    >
      {icon}
      {status}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, { bg: string; color: string }> = {
    active: { bg: "#22c55e20", color: "#22c55e" },
    inactive: { bg: "#6b728020", color: "#6b7280" },
    error: { bg: "#ef444420", color: "#ef4444" },
    offline: { bg: "#6b728020", color: "#6b7280" },
  };
  const { bg, color } = colors[status] || colors.inactive;
  return (
    <span
      style={{
        padding: "2px 8px",
        borderRadius: "4px",
        fontSize: "12px",
        fontWeight: 500,
        background: bg,
        color: color,
      }}
    >
      {status}
    </span>
  );
}

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

export default async function AgentsPage() {
  const [servers, plugins, stats] = await Promise.all([
    getServers(),
    getAgentPlugins(),
    getExtendedStats(),
  ]);

  // Group plugins by server
  const pluginsByServer = plugins.reduce(
    (acc, plugin) => {
      if (!acc[plugin.server_id]) {
        acc[plugin.server_id] = [];
      }
      acc[plugin.server_id].push(plugin);
      return acc;
    },
    {} as Record<string, typeof plugins>
  );

  return (
    <div style={{ maxWidth: "1400px", margin: "0 auto", padding: "24px" }}>
      <header style={{ marginBottom: "32px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "16px", marginBottom: "8px" }}>
          <Link href="/" style={{ color: "#a0a0a0", textDecoration: "none" }}>
            Dashboard
          </Link>
          <span style={{ color: "#a0a0a0" }}>/</span>
          <h1 style={{ fontSize: "28px", fontWeight: 600, margin: 0 }}>Agents & Plugins</h1>
        </div>
        <p style={{ color: "#a0a0a0" }}>Manage OpsAgent instances and their database plugins</p>
      </header>

      {/* Stats */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: "16px",
          marginBottom: "24px",
        }}
      >
        <div style={statCardStyle}>
          <Server size={32} color="#3b82f6" />
          <div>
            <div style={{ fontSize: "24px", fontWeight: 600 }}>{stats.activeServers}</div>
            <div style={{ color: "#a0a0a0", fontSize: "14px" }}>Active Agents</div>
          </div>
        </div>
        <div style={statCardStyle}>
          <Plug size={32} color="#8b5cf6" />
          <div>
            <div style={{ fontSize: "24px", fontWeight: 600 }}>{stats.totalPlugins}</div>
            <div style={{ color: "#a0a0a0", fontSize: "14px" }}>Total Plugins</div>
          </div>
        </div>
        <div style={statCardStyle}>
          <CheckCircle size={32} color="#22c55e" />
          <div>
            <div style={{ fontSize: "24px", fontWeight: 600 }}>{stats.healthyPlugins}</div>
            <div style={{ color: "#a0a0a0", fontSize: "14px" }}>Healthy Plugins</div>
          </div>
        </div>
        <Link href="/sessions" style={{ textDecoration: "none" }}>
          <div style={{ ...statCardStyle, cursor: "pointer" }}>
            <Activity size={32} color="#f59e0b" />
            <div>
              <div style={{ fontSize: "24px", fontWeight: 600 }}>{stats.activeSessions}</div>
              <div style={{ color: "#a0a0a0", fontSize: "14px" }}>Active Sessions →</div>
            </div>
          </div>
        </Link>
      </div>

      {/* Agents List */}
      <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
        {servers.length === 0 ? (
          <div style={cardStyle}>
            <p style={{ color: "#a0a0a0", textAlign: "center", padding: "40px" }}>
              No agents registered yet. Start an OpsAgent instance to see it here.
            </p>
          </div>
        ) : (
          servers.map((server) => {
            const serverPlugins = pluginsByServer[server.id] || [];
            return (
              <div key={server.id} style={cardStyle}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: "16px",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                    <Server size={24} color="#3b82f6" />
                    <div>
                      <h2 style={{ fontSize: "18px", fontWeight: 600, margin: 0 }}>
                        {server.name || server.hostname}
                      </h2>
                      <div style={{ fontSize: "13px", color: "#a0a0a0" }}>
                        {server.hostname} | {server.ip_address} | {server.os} {server.os_version}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                    <StatusBadge status={server.status} />
                    <Link
                      href={`/sessions?server=${server.id}`}
                      style={{
                        padding: "6px 12px",
                        background: "#3b82f6",
                        color: "#fff",
                        borderRadius: "4px",
                        fontSize: "13px",
                        textDecoration: "none",
                      }}
                    >
                      New Chat Session
                    </Link>
                  </div>
                </div>

                {/* Plugins */}
                <div style={{ marginTop: "16px" }}>
                  <h3
                    style={{
                      fontSize: "14px",
                      fontWeight: 600,
                      color: "#a0a0a0",
                      marginBottom: "12px",
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                    }}
                  >
                    <Plug size={16} />
                    Plugins ({serverPlugins.length})
                  </h3>
                  {serverPlugins.length === 0 ? (
                    <p style={{ color: "#6b7280", fontSize: "14px" }}>
                      No plugins configured for this agent.
                    </p>
                  ) : (
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "12px" }}>
                      {serverPlugins.map((plugin) => (
                        <div
                          key={plugin.id}
                          style={{
                            padding: "12px",
                            background: "#1a1a1a",
                            borderRadius: "6px",
                            border: "1px solid #2a2a2a",
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                            }}
                          >
                            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                              <span style={{ fontWeight: 500 }}>
                                {plugin.plugin_name || plugin.plugin_id}
                              </span>
                              <span
                                style={{
                                  fontSize: "11px",
                                  padding: "2px 6px",
                                  background: "#2a2a2a",
                                  borderRadius: "4px",
                                  color: "#a0a0a0",
                                }}
                              >
                                {plugin.plugin_type}
                              </span>
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                              <HealthBadge status={plugin.health_status} />
                              <StatusBadge status={plugin.status} />
                            </div>
                          </div>
                          {plugin.health_message && (
                            <div style={{ fontSize: "12px", color: "#a0a0a0", marginTop: "8px" }}>
                              {plugin.health_message}
                            </div>
                          )}
                          <div style={{ fontSize: "12px", color: "#6b7280", marginTop: "8px" }}>
                            Last check: {formatDate(plugin.last_health_check)}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Agent Info */}
                <div
                  style={{
                    marginTop: "16px",
                    paddingTop: "16px",
                    borderTop: "1px solid #2a2a2a",
                    fontSize: "12px",
                    color: "#6b7280",
                  }}
                >
                  First seen: {formatDate(server.first_seen_at)} | Last seen:{" "}
                  {formatDate(server.last_seen_at)}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
