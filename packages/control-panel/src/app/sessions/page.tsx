import { getChatSessions, getServers, getExtendedStats } from "@/lib/db";
import { MessageSquare, Server, Clock, User } from "lucide-react";
import Link from "next/link";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function formatDate(timestamp: number | string | null) {
  if (!timestamp) return "Unknown";
  const ts = typeof timestamp === "number" ? timestamp : parseInt(timestamp);
  return new Date(ts).toLocaleString();
}

function formatRelativeTime(timestamp: number | string | null) {
  if (!timestamp) return "Unknown";
  const ts = typeof timestamp === "number" ? timestamp : parseInt(timestamp);
  const now = Date.now();
  const diff = now - ts;

  if (diff < 60000) return "Just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return `${Math.floor(diff / 86400000)}d ago`;
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, { bg: string; color: string }> = {
    active: { bg: "#22c55e20", color: "#22c55e" },
    closed: { bg: "#6b728020", color: "#6b7280" },
    archived: { bg: "#3b82f620", color: "#3b82f6" },
  };
  const { bg, color } = colors[status] || colors.closed;
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

export default async function SessionsPage({
  searchParams,
}: {
  searchParams: { server?: string; status?: string };
}) {
  const serverFilter = searchParams.server;
  const statusFilter = searchParams.status || "all";

  const [sessions, servers, stats] = await Promise.all([
    getChatSessions(serverFilter, statusFilter),
    getServers(),
    getExtendedStats(),
  ]);

  return (
    <div style={{ maxWidth: "1400px", margin: "0 auto", padding: "24px" }}>
      <header style={{ marginBottom: "32px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "16px", marginBottom: "8px" }}>
          <Link href="/" style={{ color: "#a0a0a0", textDecoration: "none" }}>
            Dashboard
          </Link>
          <span style={{ color: "#a0a0a0" }}>/</span>
          <h1 style={{ fontSize: "28px", fontWeight: 600, margin: 0 }}>Chat Sessions</h1>
        </div>
        <p style={{ color: "#a0a0a0" }}>Conversational AI sessions with OpsAgent</p>
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
          <MessageSquare size={32} color="#8b5cf6" />
          <div>
            <div style={{ fontSize: "24px", fontWeight: 600 }}>{stats.totalSessions}</div>
            <div style={{ color: "#a0a0a0", fontSize: "14px" }}>Total Sessions</div>
          </div>
        </div>
        <div style={statCardStyle}>
          <MessageSquare size={32} color="#22c55e" />
          <div>
            <div style={{ fontSize: "24px", fontWeight: 600 }}>{stats.activeSessions}</div>
            <div style={{ color: "#a0a0a0", fontSize: "14px" }}>Active Sessions</div>
          </div>
        </div>
        <Link href="/approvals" style={{ textDecoration: "none" }}>
          <div style={{ ...statCardStyle, cursor: "pointer" }}>
            <Clock size={32} color="#f59e0b" />
            <div>
              <div style={{ fontSize: "24px", fontWeight: 600 }}>{stats.pendingApprovals}</div>
              <div style={{ color: "#a0a0a0", fontSize: "14px" }}>Pending Approvals →</div>
            </div>
          </div>
        </Link>
        <Link href="/agents" style={{ textDecoration: "none" }}>
          <div style={{ ...statCardStyle, cursor: "pointer" }}>
            <Server size={32} color="#3b82f6" />
            <div>
              <div style={{ fontSize: "24px", fontWeight: 600 }}>{stats.activeServers}</div>
              <div style={{ color: "#a0a0a0", fontSize: "14px" }}>Agents →</div>
            </div>
          </div>
        </Link>
      </div>

      {/* Filters */}
      <div
        style={{
          marginBottom: "24px",
          display: "flex",
          alignItems: "center",
          gap: "16px",
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ fontSize: "14px", color: "#a0a0a0" }}>Server:</span>
          <Link
            href="/sessions"
            style={{
              padding: "6px 12px",
              borderRadius: "4px",
              fontSize: "13px",
              textDecoration: "none",
              background: !serverFilter ? "#3b82f6" : "#1a1a1a",
              color: !serverFilter ? "#fff" : "#a0a0a0",
            }}
          >
            All
          </Link>
          {servers.map((server) => (
            <Link
              key={server.id}
              href={`/sessions?server=${server.id}${statusFilter !== "all" ? `&status=${statusFilter}` : ""}`}
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

        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ fontSize: "14px", color: "#a0a0a0" }}>Status:</span>
          {["all", "active", "closed", "archived"].map((status) => (
            <Link
              key={status}
              href={`/sessions?${serverFilter ? `server=${serverFilter}&` : ""}status=${status}`}
              style={{
                padding: "6px 12px",
                borderRadius: "4px",
                fontSize: "13px",
                textDecoration: "none",
                background: statusFilter === status ? "#3b82f6" : "#1a1a1a",
                color: statusFilter === status ? "#fff" : "#a0a0a0",
              }}
            >
              {status.charAt(0).toUpperCase() + status.slice(1)}
            </Link>
          ))}
        </div>
      </div>

      {/* Sessions List */}
      <div style={cardStyle}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "16px",
          }}
        >
          <h2
            style={{
              fontSize: "18px",
              fontWeight: 600,
              display: "flex",
              alignItems: "center",
              gap: "8px",
              margin: 0,
            }}
          >
            <MessageSquare size={20} />
            Sessions ({sessions.length})
          </h2>
        </div>

        {sessions.length === 0 ? (
          <p style={{ color: "#a0a0a0", textAlign: "center", padding: "40px" }}>
            No chat sessions found. Start a new session from the Agents page.
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {sessions.map((session) => (
              <Link
                key={session.id}
                href={`/sessions/${session.id}`}
                style={{ textDecoration: "none", color: "inherit" }}
              >
                <div
                  style={{
                    padding: "16px",
                    background: "#1a1a1a",
                    borderRadius: "6px",
                    border: "1px solid #2a2a2a",
                    cursor: "pointer",
                    transition: "border-color 0.2s",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "flex-start",
                    }}
                  >
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <span style={{ fontWeight: 500, fontSize: "15px" }}>{session.title}</span>
                        <StatusBadge status={session.status} />
                      </div>
                      <div
                        style={{
                          fontSize: "13px",
                          color: "#a0a0a0",
                          marginTop: "4px",
                          display: "flex",
                          alignItems: "center",
                          gap: "12px",
                        }}
                      >
                        <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                          <Server size={12} />
                          {session.hostname || session.server_id}
                        </span>
                        <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                          <MessageSquare size={12} />
                          {session.message_count || 0} messages
                        </span>
                        {session.created_by && (
                          <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                            <User size={12} />
                            {session.created_by}
                          </span>
                        )}
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: "13px", color: "#6b7280" }}>
                        {formatRelativeTime(session.updated_at || session.created_at)}
                      </div>
                      <div style={{ fontSize: "12px", color: "#4b5563", marginTop: "2px" }}>
                        {formatDate(session.created_at)}
                      </div>
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
