import { getApprovalRequests, getServers, getPendingApprovalsCount } from "@/lib/db";
import { Shield, Clock, CheckCircle, XCircle, AlertTriangle, Server } from "lucide-react";
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
    pending: { bg: "#f59e0b20", color: "#f59e0b", icon: <Clock size={12} /> },
    approved: { bg: "#22c55e20", color: "#22c55e", icon: <CheckCircle size={12} /> },
    rejected: { bg: "#ef444420", color: "#ef4444", icon: <XCircle size={12} /> },
    expired: { bg: "#6b728020", color: "#6b7280", icon: <Clock size={12} /> },
    cancelled: { bg: "#6b728020", color: "#6b7280", icon: <XCircle size={12} /> },
  };
  const { bg, color, icon } = config[status] || config.pending;
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

export default async function ApprovalsPage({
  searchParams,
}: {
  searchParams: { status?: string; server?: string };
}) {
  const statusFilter = searchParams.status || "pending";
  const serverFilter = searchParams.server;

  const [approvals, servers, pendingCount] = await Promise.all([
    getApprovalRequests(statusFilter, serverFilter),
    getServers(),
    getPendingApprovalsCount(),
  ]);

  return (
    <div style={{ maxWidth: "1400px", margin: "0 auto", padding: "24px" }}>
      <header style={{ marginBottom: "32px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "16px", marginBottom: "8px" }}>
          <Link href="/" style={{ color: "#a0a0a0", textDecoration: "none" }}>
            Dashboard
          </Link>
          <span style={{ color: "#a0a0a0" }}>/</span>
          <h1 style={{ fontSize: "28px", fontWeight: 600, margin: 0 }}>Approval Queue</h1>
        </div>
        <p style={{ color: "#a0a0a0" }}>
          Review and approve risky database operations requested by AI agents
        </p>
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
          <Clock size={32} color="#f59e0b" />
          <div>
            <div style={{ fontSize: "24px", fontWeight: 600 }}>{pendingCount}</div>
            <div style={{ color: "#a0a0a0", fontSize: "14px" }}>Pending Approvals</div>
          </div>
        </div>
        <Link href="/audit" style={{ textDecoration: "none" }}>
          <div style={{ ...statCardStyle, cursor: "pointer" }}>
            <Shield size={32} color="#8b5cf6" />
            <div>
              <div style={{ fontSize: "24px", fontWeight: 600 }}>→</div>
              <div style={{ color: "#a0a0a0", fontSize: "14px" }}>View Audit Log</div>
            </div>
          </div>
        </Link>
        <Link href="/sessions" style={{ textDecoration: "none" }}>
          <div style={{ ...statCardStyle, cursor: "pointer" }}>
            <Server size={32} color="#3b82f6" />
            <div>
              <div style={{ fontSize: "24px", fontWeight: 600 }}>→</div>
              <div style={{ color: "#a0a0a0", fontSize: "14px" }}>Chat Sessions</div>
            </div>
          </div>
        </Link>
        <Link href="/agents" style={{ textDecoration: "none" }}>
          <div style={{ ...statCardStyle, cursor: "pointer" }}>
            <Server size={32} color="#22c55e" />
            <div>
              <div style={{ fontSize: "24px", fontWeight: 600 }}>→</div>
              <div style={{ color: "#a0a0a0", fontSize: "14px" }}>Agents</div>
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
          <span style={{ fontSize: "14px", color: "#a0a0a0" }}>Status:</span>
          {["pending", "approved", "rejected", "all"].map((status) => (
            <Link
              key={status}
              href={`/approvals?status=${status}${serverFilter ? `&server=${serverFilter}` : ""}`}
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
              {status === "pending" && pendingCount > 0 && ` (${pendingCount})`}
            </Link>
          ))}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ fontSize: "14px", color: "#a0a0a0" }}>Server:</span>
          <Link
            href={`/approvals?status=${statusFilter}`}
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
              href={`/approvals?status=${statusFilter}&server=${server.id}`}
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
      </div>

      {/* Approvals List */}
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
          <Shield size={20} />
          Approval Requests ({approvals.length})
        </h2>

        {approvals.length === 0 ? (
          <p style={{ color: "#a0a0a0", textAlign: "center", padding: "40px" }}>
            {statusFilter === "pending"
              ? "No pending approval requests. All clear!"
              : "No approval requests found matching the filters."}
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {approvals.map((approval) => (
              <div
                key={approval.id}
                style={{
                  padding: "16px",
                  background: "#1a1a1a",
                  borderRadius: "6px",
                  border:
                    approval.status === "pending"
                      ? "1px solid #f59e0b40"
                      : "1px solid #2a2a2a",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        marginBottom: "8px",
                      }}
                    >
                      <span
                        style={{
                          fontWeight: 600,
                          fontSize: "15px",
                          fontFamily: "monospace",
                          background: "#2a2a2a",
                          padding: "2px 8px",
                          borderRadius: "4px",
                        }}
                      >
                        {approval.operation}
                      </span>
                      <RiskBadge level={approval.risk_level} />
                      <StatusBadge status={approval.status} />
                    </div>

                    <p style={{ fontSize: "14px", color: "#d1d5db", margin: "8px 0" }}>
                      {approval.reason}
                    </p>

                    <div
                      style={{
                        fontSize: "12px",
                        color: "#6b7280",
                        display: "flex",
                        alignItems: "center",
                        gap: "12px",
                        flexWrap: "wrap",
                      }}
                    >
                      <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                        <Server size={12} />
                        {approval.hostname || approval.server_id}
                      </span>
                      <span>Plugin: {approval.plugin_name || approval.plugin_id}</span>
                      <span>Requested: {formatRelativeTime(approval.requested_at)}</span>
                      {approval.expires_at && approval.status === "pending" && (
                        <span style={{ color: "#f59e0b" }}>
                          Expires: {formatRelativeTime(approval.expires_at)}
                        </span>
                      )}
                    </div>

                    {/* Parameters Preview */}
                    {approval.parameters && (
                      <details style={{ marginTop: "12px" }}>
                        <summary
                          style={{
                            fontSize: "12px",
                            color: "#a0a0a0",
                            cursor: "pointer",
                          }}
                        >
                          View Parameters
                        </summary>
                        <pre
                          style={{
                            fontSize: "11px",
                            background: "#0a0a0a",
                            padding: "8px",
                            borderRadius: "4px",
                            marginTop: "8px",
                            overflow: "auto",
                            maxHeight: "150px",
                          }}
                        >
                          {JSON.stringify(JSON.parse(approval.parameters), null, 2)}
                        </pre>
                      </details>
                    )}

                    {/* Response Info */}
                    {approval.responded_at && (
                      <div
                        style={{
                          marginTop: "12px",
                          paddingTop: "12px",
                          borderTop: "1px solid #2a2a2a",
                          fontSize: "13px",
                        }}
                      >
                        <span style={{ color: "#a0a0a0" }}>
                          {approval.status === "approved" ? "Approved" : "Rejected"} by{" "}
                        </span>
                        <span style={{ color: "#fff" }}>{approval.responded_by}</span>
                        <span style={{ color: "#a0a0a0" }}>
                          {" "}
                          on {formatDate(approval.responded_at)}
                        </span>
                        {approval.response_reason && (
                          <p style={{ color: "#6b7280", marginTop: "4px", fontStyle: "italic" }}>
                            "{approval.response_reason}"
                          </p>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Action Buttons for Pending */}
                  {approval.status === "pending" && (
                    <div style={{ display: "flex", gap: "8px", marginLeft: "16px" }}>
                      <form action={`/api/approvals/${approval.id}/approve`} method="POST">
                        <input type="hidden" name="approvedBy" value="Control Panel User" />
                        <button
                          type="submit"
                          style={{
                            padding: "8px 16px",
                            background: "#22c55e",
                            color: "#fff",
                            border: "none",
                            borderRadius: "4px",
                            fontSize: "13px",
                            fontWeight: 500,
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            gap: "4px",
                          }}
                        >
                          <CheckCircle size={14} />
                          Approve
                        </button>
                      </form>
                      <form action={`/api/approvals/${approval.id}/reject`} method="POST">
                        <input type="hidden" name="rejectedBy" value="Control Panel User" />
                        <button
                          type="submit"
                          style={{
                            padding: "8px 16px",
                            background: "#ef4444",
                            color: "#fff",
                            border: "none",
                            borderRadius: "4px",
                            fontSize: "13px",
                            fontWeight: 500,
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            gap: "4px",
                          }}
                        >
                          <XCircle size={14} />
                          Reject
                        </button>
                      </form>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
