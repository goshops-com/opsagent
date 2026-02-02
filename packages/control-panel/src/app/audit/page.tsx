import { getAuditLog, getAuditLogStats, getServers } from "@/lib/db";
import {
  FileText,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Server,
  Clock,
  Shield,
} from "lucide-react";
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
  const config: Record<string, { bg: string; color: string; icon: React.ReactNode }> = {
    success: { bg: "#22c55e20", color: "#22c55e", icon: <CheckCircle size={12} /> },
    failed: { bg: "#ef444420", color: "#ef4444", icon: <XCircle size={12} /> },
    denied: { bg: "#f59e0b20", color: "#f59e0b", icon: <Shield size={12} /> },
    cancelled: { bg: "#6b728020", color: "#6b7280", icon: <XCircle size={12} /> },
  };
  const { bg, color, icon } = config[status] || config.failed;
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

function RiskBadge({ level }: { level: string }) {
  const config: Record<string, { bg: string; color: string }> = {
    low: { bg: "#22c55e20", color: "#22c55e" },
    medium: { bg: "#f59e0b20", color: "#f59e0b" },
    high: { bg: "#ef444420", color: "#ef4444" },
    critical: { bg: "#dc262620", color: "#dc2626" },
  };
  const { bg, color } = config[level] || config.medium;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "4px",
        padding: "2px 8px",
        borderRadius: "4px",
        fontSize: "11px",
        fontWeight: 600,
        background: bg,
        color: color,
        textTransform: "uppercase",
      }}
    >
      <AlertTriangle size={10} />
      {level}
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

export default async function AuditPage({
  searchParams,
}: {
  searchParams: { server?: string; risk?: string; status?: string };
}) {
  const serverFilter = searchParams.server;
  const riskFilter = searchParams.risk;
  const statusFilter = searchParams.status;

  const [entries, stats, servers] = await Promise.all([
    getAuditLog(
      {
        serverId: serverFilter,
        riskLevel: riskFilter,
        status: statusFilter,
      },
      100
    ),
    getAuditLogStats(serverFilter),
    getServers(),
  ]);

  return (
    <div style={{ maxWidth: "1400px", margin: "0 auto", padding: "24px" }}>
      <header style={{ marginBottom: "32px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "16px", marginBottom: "8px" }}>
          <Link href="/" style={{ color: "#a0a0a0", textDecoration: "none" }}>
            Dashboard
          </Link>
          <span style={{ color: "#a0a0a0" }}>/</span>
          <h1 style={{ fontSize: "28px", fontWeight: 600, margin: 0 }}>Audit Log</h1>
        </div>
        <p style={{ color: "#a0a0a0" }}>
          Complete history of all plugin operations executed by AI agents
        </p>
      </header>

      {/* Stats */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(5, 1fr)",
          gap: "16px",
          marginBottom: "24px",
        }}
      >
        <div style={statCardStyle}>
          <FileText size={32} color="#8b5cf6" />
          <div>
            <div style={{ fontSize: "24px", fontWeight: 600 }}>{stats.total}</div>
            <div style={{ color: "#a0a0a0", fontSize: "14px" }}>Total Operations</div>
          </div>
        </div>
        <div style={statCardStyle}>
          <Clock size={32} color="#3b82f6" />
          <div>
            <div style={{ fontSize: "24px", fontWeight: 600 }}>{stats.last24Hours}</div>
            <div style={{ color: "#a0a0a0", fontSize: "14px" }}>Last 24 Hours</div>
          </div>
        </div>
        <div style={statCardStyle}>
          <CheckCircle size={32} color="#22c55e" />
          <div>
            <div style={{ fontSize: "24px", fontWeight: 600 }}>{stats.byStatus?.success || 0}</div>
            <div style={{ color: "#a0a0a0", fontSize: "14px" }}>Successful</div>
          </div>
        </div>
        <div style={statCardStyle}>
          <XCircle size={32} color="#ef4444" />
          <div>
            <div style={{ fontSize: "24px", fontWeight: 600 }}>{stats.byStatus?.failed || 0}</div>
            <div style={{ color: "#a0a0a0", fontSize: "14px" }}>Failed</div>
          </div>
        </div>
        <div style={statCardStyle}>
          <Shield size={32} color="#f59e0b" />
          <div>
            <div style={{ fontSize: "24px", fontWeight: 600 }}>{stats.byStatus?.denied || 0}</div>
            <div style={{ color: "#a0a0a0", fontSize: "14px" }}>Denied</div>
          </div>
        </div>
      </div>

      {/* Risk Level Breakdown */}
      <div style={{ ...cardStyle, marginBottom: "24px" }}>
        <h3 style={{ fontSize: "14px", fontWeight: 600, marginBottom: "12px", color: "#a0a0a0" }}>
          Operations by Risk Level
        </h3>
        <div style={{ display: "flex", gap: "24px" }}>
          {["low", "medium", "high", "critical"].map((level) => (
            <div key={level} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <RiskBadge level={level} />
              <span style={{ fontSize: "18px", fontWeight: 600 }}>
                {stats.byRiskLevel?.[level] || 0}
              </span>
            </div>
          ))}
        </div>
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
            href={`/audit?${riskFilter ? `risk=${riskFilter}&` : ""}${statusFilter ? `status=${statusFilter}` : ""}`}
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
              href={`/audit?server=${server.id}${riskFilter ? `&risk=${riskFilter}` : ""}${statusFilter ? `&status=${statusFilter}` : ""}`}
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
          <span style={{ fontSize: "14px", color: "#a0a0a0" }}>Risk:</span>
          {["all", "low", "medium", "high", "critical"].map((level) => (
            <Link
              key={level}
              href={`/audit?${serverFilter ? `server=${serverFilter}&` : ""}${level !== "all" ? `risk=${level}&` : ""}${statusFilter ? `status=${statusFilter}` : ""}`}
              style={{
                padding: "6px 12px",
                borderRadius: "4px",
                fontSize: "13px",
                textDecoration: "none",
                background:
                  (level === "all" && !riskFilter) || riskFilter === level
                    ? "#3b82f6"
                    : "#1a1a1a",
                color:
                  (level === "all" && !riskFilter) || riskFilter === level ? "#fff" : "#a0a0a0",
              }}
            >
              {level.charAt(0).toUpperCase() + level.slice(1)}
            </Link>
          ))}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ fontSize: "14px", color: "#a0a0a0" }}>Status:</span>
          {["all", "success", "failed", "denied"].map((status) => (
            <Link
              key={status}
              href={`/audit?${serverFilter ? `server=${serverFilter}&` : ""}${riskFilter ? `risk=${riskFilter}&` : ""}${status !== "all" ? `status=${status}` : ""}`}
              style={{
                padding: "6px 12px",
                borderRadius: "4px",
                fontSize: "13px",
                textDecoration: "none",
                background:
                  (status === "all" && !statusFilter) || statusFilter === status
                    ? "#3b82f6"
                    : "#1a1a1a",
                color:
                  (status === "all" && !statusFilter) || statusFilter === status
                    ? "#fff"
                    : "#a0a0a0",
              }}
            >
              {status.charAt(0).toUpperCase() + status.slice(1)}
            </Link>
          ))}
        </div>
      </div>

      {/* Audit Log Table */}
      <div style={cardStyle}>
        <h2
          style={{
            fontSize: "18px",
            fontWeight: 600,
            marginBottom: "16px",
            display: "flex",
            alignItems: "center",
            gap: "8px",
          }}
        >
          <FileText size={20} />
          Audit Entries ({entries.length})
        </h2>

        {entries.length === 0 ? (
          <p style={{ color: "#a0a0a0", textAlign: "center", padding: "40px" }}>
            No audit log entries found matching the filters.
          </p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: "13px",
              }}
            >
              <thead>
                <tr style={{ borderBottom: "1px solid #2a2a2a" }}>
                  <th
                    style={{
                      textAlign: "left",
                      padding: "12px 8px",
                      color: "#a0a0a0",
                      fontWeight: 500,
                    }}
                  >
                    Timestamp
                  </th>
                  <th
                    style={{
                      textAlign: "left",
                      padding: "12px 8px",
                      color: "#a0a0a0",
                      fontWeight: 500,
                    }}
                  >
                    Server
                  </th>
                  <th
                    style={{
                      textAlign: "left",
                      padding: "12px 8px",
                      color: "#a0a0a0",
                      fontWeight: 500,
                    }}
                  >
                    Operation
                  </th>
                  <th
                    style={{
                      textAlign: "left",
                      padding: "12px 8px",
                      color: "#a0a0a0",
                      fontWeight: 500,
                    }}
                  >
                    Risk
                  </th>
                  <th
                    style={{
                      textAlign: "left",
                      padding: "12px 8px",
                      color: "#a0a0a0",
                      fontWeight: 500,
                    }}
                  >
                    Status
                  </th>
                  <th
                    style={{
                      textAlign: "left",
                      padding: "12px 8px",
                      color: "#a0a0a0",
                      fontWeight: 500,
                    }}
                  >
                    Duration
                  </th>
                  <th
                    style={{
                      textAlign: "left",
                      padding: "12px 8px",
                      color: "#a0a0a0",
                      fontWeight: 500,
                    }}
                  >
                    Executed By
                  </th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr
                    key={entry.id}
                    style={{
                      borderBottom: "1px solid #1a1a1a",
                    }}
                  >
                    <td style={{ padding: "12px 8px" }}>
                      <div style={{ color: "#fff" }}>{formatRelativeTime(entry.created_at)}</div>
                      <div style={{ color: "#6b7280", fontSize: "11px" }}>
                        {formatDate(entry.created_at)}
                      </div>
                    </td>
                    <td style={{ padding: "12px 8px", color: "#d1d5db" }}>
                      {entry.hostname || entry.server_id}
                    </td>
                    <td style={{ padding: "12px 8px" }}>
                      <div
                        style={{
                          fontFamily: "monospace",
                          background: "#2a2a2a",
                          padding: "2px 6px",
                          borderRadius: "4px",
                          display: "inline-block",
                        }}
                      >
                        {entry.operation}
                      </div>
                      <div style={{ color: "#6b7280", fontSize: "11px", marginTop: "2px" }}>
                        {entry.plugin_name || entry.plugin_id}
                      </div>
                    </td>
                    <td style={{ padding: "12px 8px" }}>
                      <RiskBadge level={entry.risk_level} />
                    </td>
                    <td style={{ padding: "12px 8px" }}>
                      <StatusBadge status={entry.status} />
                    </td>
                    <td style={{ padding: "12px 8px", color: "#a0a0a0" }}>
                      {entry.execution_time_ms ? `${entry.execution_time_ms}ms` : "-"}
                    </td>
                    <td style={{ padding: "12px 8px", color: "#a0a0a0" }}>{entry.executed_by}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
