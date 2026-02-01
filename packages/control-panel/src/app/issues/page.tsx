import { getIssues, getIssueStats, getServers, updateIssueStatus, discardIssue } from "@/lib/db";
import { redirect } from "next/navigation";
import Link from "next/link";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Server Actions
async function updateStatus(formData: FormData) {
  "use server";
  const issueId = formData.get("issueId") as string;
  const status = formData.get("status") as string;
  const currentStatus = formData.get("currentStatus") as string;
  const server = formData.get("server") as string;

  if (issueId && status) {
    await updateIssueStatus(issueId, status);
  }

  const params = new URLSearchParams();
  if (currentStatus && currentStatus !== "all") params.set("status", currentStatus);
  if (server && server !== "all") params.set("server", server);
  params.set("refresh", Date.now().toString());

  redirect("/issues?" + params.toString());
}

async function discardIssueAction(formData: FormData) {
  "use server";
  const issueId = formData.get("issueId") as string;
  const currentStatus = formData.get("currentStatus") as string;
  const server = formData.get("server") as string;

  if (issueId) {
    await discardIssue(issueId);
  }

  const params = new URLSearchParams();
  if (currentStatus && currentStatus !== "all") params.set("status", currentStatus);
  if (server && server !== "all") params.set("server", server);
  params.set("refresh", Date.now().toString());

  redirect("/issues?" + params.toString());
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, { bg: string; color: string }> = {
    open: { bg: "#f59e0b20", color: "#f59e0b" },
    investigating: { bg: "#3b82f620", color: "#3b82f6" },
    resolved: { bg: "#22c55e20", color: "#22c55e" },
    closed: { bg: "#6b728020", color: "#6b7280" },
  };
  const style = colors[status] || colors.closed;

  return (
    <span style={{
      padding: "4px 8px",
      borderRadius: "4px",
      fontSize: "12px",
      fontWeight: 500,
      background: style.bg,
      color: style.color,
    }}>
      {status}
    </span>
  );
}

function SeverityBadge({ severity }: { severity: string }) {
  const colors: Record<string, { bg: string; color: string }> = {
    critical: { bg: "#ef444420", color: "#ef4444" },
    warning: { bg: "#f59e0b20", color: "#f59e0b" },
    info: { bg: "#3b82f620", color: "#3b82f6" },
  };
  const style = colors[severity] || colors.info;

  return (
    <span style={{
      padding: "4px 8px",
      borderRadius: "4px",
      fontSize: "12px",
      fontWeight: 500,
      background: style.bg,
      color: style.color,
    }}>
      {severity}
    </span>
  );
}

export default async function IssuesPage({
  searchParams,
}: {
  searchParams: { status?: string; server?: string };
}) {
  const status = searchParams.status || "all";
  const serverFilter = searchParams.server || "all";

  const [allIssues, stats, servers] = await Promise.all([
    getIssues(status === "all" ? undefined : status, 100),
    getIssueStats(),
    getServers(),
  ]);

  // Filter by server if needed
  const issues = serverFilter === "all"
    ? allIssues
    : allIssues.filter(i => i.server_id === serverFilter);

  const cardStyle = {
    background: "#141414",
    border: "1px solid #2a2a2a",
    borderRadius: "8px",
    padding: "16px",
  };

  const buttonStyle = {
    padding: "6px 12px",
    borderRadius: "4px",
    fontSize: "13px",
    cursor: "pointer",
    border: "none",
    transition: "all 0.2s",
  };

  return (
    <div style={{ maxWidth: "1400px", margin: "0 auto", padding: "24px" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
        <div>
          <h1 style={{ fontSize: "28px", fontWeight: 600, marginBottom: "8px" }}>Issues</h1>
          <p style={{ color: "#a0a0a0" }}>Manage ongoing investigations and track agent actions</p>
        </div>
        <Link href="/" style={{
          padding: "8px 16px",
          background: "#1a1a1a",
          borderRadius: "6px",
          color: "#fff",
          textDecoration: "none",
          border: "1px solid #2a2a2a",
        }}>
          ← Back to Dashboard
        </Link>
      </div>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: "16px", marginBottom: "24px" }}>
        <div style={cardStyle}>
          <div style={{ fontSize: "24px", fontWeight: 600, color: "#f59e0b" }}>{stats.open}</div>
          <div style={{ fontSize: "12px", color: "#a0a0a0", textTransform: "uppercase" }}>Open</div>
        </div>
        <div style={cardStyle}>
          <div style={{ fontSize: "24px", fontWeight: 600, color: "#3b82f6" }}>{stats.investigating}</div>
          <div style={{ fontSize: "12px", color: "#a0a0a0", textTransform: "uppercase" }}>Investigating</div>
        </div>
        <div style={cardStyle}>
          <div style={{ fontSize: "24px", fontWeight: 600, color: "#22c55e" }}>{stats.resolved}</div>
          <div style={{ fontSize: "12px", color: "#a0a0a0", textTransform: "uppercase" }}>Resolved</div>
        </div>
        <div style={cardStyle}>
          <div style={{ fontSize: "24px", fontWeight: 600, color: "#6b7280" }}>{stats.closed}</div>
          <div style={{ fontSize: "12px", color: "#a0a0a0", textTransform: "uppercase" }}>Closed</div>
        </div>
        <div style={cardStyle}>
          <div style={{ fontSize: "24px", fontWeight: 600, color: "#fff" }}>{stats.total}</div>
          <div style={{ fontSize: "12px", color: "#a0a0a0", textTransform: "uppercase" }}>Total</div>
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: "24px", marginBottom: "24px", flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ fontSize: "14px", color: "#a0a0a0" }}>Status:</span>
          {["all", "open", "investigating", "resolved", "closed"].map((s) => (
            <Link
              key={s}
              href={`/issues?status=${s}${serverFilter !== "all" ? `&server=${serverFilter}` : ""}`}
              style={{
                padding: "6px 12px",
                borderRadius: "4px",
                fontSize: "13px",
                textDecoration: "none",
                textTransform: "capitalize",
                background: status === s ? "#3b82f6" : "#1a1a1a",
                color: status === s ? "#fff" : "#a0a0a0",
              }}
            >
              {s}
            </Link>
          ))}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ fontSize: "14px", color: "#a0a0a0" }}>Server:</span>
          <Link
            href={`/issues?status=${status}`}
            style={{
              padding: "6px 12px",
              borderRadius: "4px",
              fontSize: "13px",
              textDecoration: "none",
              background: serverFilter === "all" ? "#3b82f6" : "#1a1a1a",
              color: serverFilter === "all" ? "#fff" : "#a0a0a0",
            }}
          >
            All
          </Link>
          {servers.map((server) => (
            <Link
              key={server.id}
              href={`/issues?status=${status}&server=${server.id}`}
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

      {/* Issues List */}
      <div style={{ ...cardStyle, padding: 0, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "#1a1a1a", borderBottom: "1px solid #2a2a2a" }}>
              <th style={{ padding: "12px 16px", textAlign: "left", fontSize: "12px", color: "#a0a0a0", textTransform: "uppercase" }}>Issue</th>
              <th style={{ padding: "12px 16px", textAlign: "left", fontSize: "12px", color: "#a0a0a0", textTransform: "uppercase" }}>Server</th>
              <th style={{ padding: "12px 16px", textAlign: "left", fontSize: "12px", color: "#a0a0a0", textTransform: "uppercase" }}>Severity</th>
              <th style={{ padding: "12px 16px", textAlign: "left", fontSize: "12px", color: "#a0a0a0", textTransform: "uppercase" }}>Status</th>
              <th style={{ padding: "12px 16px", textAlign: "left", fontSize: "12px", color: "#a0a0a0", textTransform: "uppercase" }}>Alerts</th>
              <th style={{ padding: "12px 16px", textAlign: "left", fontSize: "12px", color: "#a0a0a0", textTransform: "uppercase" }}>Last Seen</th>
              <th style={{ padding: "12px 16px", textAlign: "left", fontSize: "12px", color: "#a0a0a0", textTransform: "uppercase" }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {issues.map((issue) => (
              <tr key={issue.id} style={{ borderBottom: "1px solid #2a2a2a" }}>
                <td style={{ padding: "16px" }}>
                  <Link href={`/issues/${issue.id}`} style={{ color: "#3b82f6", textDecoration: "none", fontWeight: 500 }}>
                    {issue.title}
                  </Link>
                  {issue.description && (
                    <p style={{ fontSize: "13px", color: "#a0a0a0", marginTop: "4px" }}>
                      {issue.description.slice(0, 100)}...
                    </p>
                  )}
                </td>
                <td style={{ padding: "16px", fontSize: "13px", color: "#a0a0a0" }}>
                  {issue.hostname || issue.server_id}
                </td>
                <td style={{ padding: "16px" }}>
                  <SeverityBadge severity={issue.severity} />
                </td>
                <td style={{ padding: "16px" }}>
                  <StatusBadge status={issue.status} />
                </td>
                <td style={{ padding: "16px", fontSize: "13px" }}>
                  <span style={{ fontWeight: 500 }}>{issue.alert_count}</span>
                  <span style={{ color: "#a0a0a0", marginLeft: "4px" }}>firings</span>
                </td>
                <td style={{ padding: "16px", fontSize: "13px", color: "#a0a0a0" }}>
                  {new Date(Number(issue.last_seen_at)).toLocaleString()}
                </td>
                <td style={{ padding: "16px" }}>
                  <div style={{ display: "flex", gap: "8px" }}>
                    <Link
                      href={`/issues/${issue.id}`}
                      style={{ ...buttonStyle, background: "#3b82f620", color: "#3b82f6" }}
                    >
                      View
                    </Link>

                    {issue.status !== "resolved" && issue.status !== "closed" && (
                      <form action={updateStatus} style={{ display: "inline" }}>
                        <input type="hidden" name="issueId" value={issue.id} />
                        <input type="hidden" name="status" value="resolved" />
                        <input type="hidden" name="currentStatus" value={status} />
                        <input type="hidden" name="server" value={serverFilter} />
                        <button type="submit" style={{ ...buttonStyle, background: "#22c55e20", color: "#22c55e" }}>
                          Resolve
                        </button>
                      </form>
                    )}

                    {issue.status !== "closed" && (
                      <form action={discardIssueAction} style={{ display: "inline" }}>
                        <input type="hidden" name="issueId" value={issue.id} />
                        <input type="hidden" name="currentStatus" value={status} />
                        <input type="hidden" name="server" value={serverFilter} />
                        <button type="submit" style={{ ...buttonStyle, background: "#6b728020", color: "#6b7280" }}>
                          Discard
                        </button>
                      </form>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {issues.length === 0 && (
          <div style={{ padding: "48px", textAlign: "center", color: "#a0a0a0" }}>
            <p style={{ fontSize: "18px", marginBottom: "8px" }}>No issues found</p>
            <p style={{ fontSize: "14px" }}>
              {status === "all" ? "Great! No issues in the system." : `No ${status} issues.`}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
