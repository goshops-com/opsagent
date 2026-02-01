import { getIssueById, getIssueComments, updateIssueStatus, addIssueComment, getServerById, type IssueComment } from "@/lib/db";
import { redirect } from "next/navigation";
import Link from "next/link";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Helper to trigger OpsAgent to process feedback
async function triggerAgentFeedback(serverId: string, issueId: string, feedback: string): Promise<boolean> {
  try {
    // Get server IP to find the OpsAgent
    const server = await getServerById(serverId);
    if (!server?.ip_address) {
      console.log(`[Control Panel] No IP address for server ${serverId}, skipping agent trigger`);
      return false;
    }

    // OpsAgent dashboard runs on port 3001
    const agentUrl = `http://${server.ip_address}:3001/api/issues/${issueId}/process-feedback`;
    console.log(`[Control Panel] Triggering agent at ${agentUrl}`);

    const response = await fetch(agentUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ feedback }),
      signal: AbortSignal.timeout(30000), // 30 second timeout
    });

    if (response.ok) {
      const result = await response.json();
      console.log(`[Control Panel] Agent processed feedback: ${result.success}`);
      return result.success;
    } else {
      console.error(`[Control Panel] Agent returned ${response.status}`);
      return false;
    }
  } catch (error) {
    console.error(`[Control Panel] Failed to trigger agent:`, error);
    return false;
  }
}

// Server Actions
async function updateStatus(formData: FormData) {
  "use server";
  const issueId = formData.get("issueId") as string;
  const status = formData.get("status") as string;

  if (issueId && status) {
    await updateIssueStatus(issueId, status);
  }

  redirect(`/issues/${issueId}`);
}

async function addComment(formData: FormData) {
  "use server";
  const issueId = formData.get("issueId") as string;
  const content = formData.get("content") as string;
  const authorName = formData.get("authorName") as string;
  const commentType = formData.get("commentType") as string || "note";
  const serverId = formData.get("serverId") as string;

  if (issueId && content) {
    // Add the comment first
    await addIssueComment(issueId, content, authorName || undefined, commentType as IssueComment["comment_type"]);

    // If this is feedback, trigger the agent to process it
    if (commentType === "feedback" && serverId) {
      // Fire and forget - don't wait for agent response to complete the redirect
      triggerAgentFeedback(serverId, issueId, content).catch((e) => {
        console.error("[Control Panel] Background agent trigger failed:", e);
      });
    }
  }

  redirect(`/issues/${issueId}`);
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
      padding: "6px 12px",
      borderRadius: "4px",
      fontSize: "13px",
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
      padding: "6px 12px",
      borderRadius: "4px",
      fontSize: "13px",
      fontWeight: 500,
      background: style.bg,
      color: style.color,
    }}>
      {severity}
    </span>
  );
}

function CommentCard({ comment }: { comment: IssueComment }) {
  const typeConfig: Record<string, { label: string; borderColor: string; icon: string }> = {
    analysis: { label: "AI Analysis", borderColor: "#a855f7", icon: "🤖" },
    action: { label: "Action Taken", borderColor: "#22c55e", icon: "⚡" },
    status_change: { label: "Status Change", borderColor: "#3b82f6", icon: "📝" },
    alert_fired: { label: "Alert Fired", borderColor: "#f59e0b", icon: "🔔" },
    note: { label: "Note", borderColor: "#6b7280", icon: "💬" },
    feedback: { label: "Human Feedback", borderColor: "#ec4899", icon: "👤" },
  };

  const config = typeConfig[comment.comment_type] || typeConfig.note;

  return (
    <div style={{
      background: "#1a1a1a",
      padding: "16px",
      borderRadius: "8px",
      border: "1px solid #2a2a2a",
      borderLeft: `4px solid ${config.borderColor}`,
      marginBottom: "12px",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ fontSize: "14px", fontWeight: 500 }}>
            {config.icon} {config.label}
          </span>
          <span style={{ fontSize: "12px", color: "#a0a0a0" }}>
            by {comment.author_type === "agent" ? "AI Agent" : (comment.author_name || "Human")}
          </span>
        </div>
        <span style={{ fontSize: "12px", color: "#a0a0a0" }}>
          {new Date(Number(comment.created_at)).toLocaleString()}
        </span>
      </div>
      <p style={{ whiteSpace: "pre-wrap", lineHeight: 1.6 }}>{comment.content}</p>
      {comment.metadata && (
        <div style={{
          marginTop: "12px",
          fontSize: "12px",
          color: "#a0a0a0",
          background: "#0a0a0a",
          padding: "8px",
          borderRadius: "4px",
          fontFamily: "monospace",
          overflow: "auto",
        }}>
          <pre style={{ margin: 0 }}>{JSON.stringify(JSON.parse(comment.metadata), null, 2)}</pre>
        </div>
      )}
    </div>
  );
}

export default async function IssueDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const [issue, comments] = await Promise.all([
    getIssueById(params.id),
    getIssueComments(params.id),
  ]);

  const cardStyle = {
    background: "#141414",
    border: "1px solid #2a2a2a",
    borderRadius: "8px",
    padding: "16px",
  };

  const inputStyle = {
    width: "100%",
    padding: "10px 12px",
    background: "#1a1a1a",
    border: "1px solid #2a2a2a",
    borderRadius: "6px",
    color: "#fafafa",
    fontSize: "14px",
  };

  const buttonStyle = {
    padding: "10px 20px",
    borderRadius: "6px",
    fontSize: "14px",
    fontWeight: 500,
    cursor: "pointer",
    border: "none",
    transition: "all 0.2s",
  };

  if (!issue) {
    return (
      <div style={{ maxWidth: "900px", margin: "0 auto", padding: "24px" }}>
        <div style={{ ...cardStyle, textAlign: "center", padding: "48px" }}>
          <h1 style={{ fontSize: "24px", fontWeight: 600, marginBottom: "16px" }}>Issue Not Found</h1>
          <p style={{ color: "#a0a0a0", marginBottom: "24px" }}>The issue you&apos;re looking for doesn&apos;t exist.</p>
          <Link href="/issues" style={{
            padding: "10px 20px",
            background: "#3b82f6",
            borderRadius: "6px",
            color: "#fff",
            textDecoration: "none",
          }}>
            Back to Issues
          </Link>
        </div>
      </div>
    );
  }

  const duration = issue.resolved_at
    ? Math.floor((Number(issue.resolved_at) - Number(issue.first_seen_at)) / 1000 / 60)
    : Math.floor((Date.now() - Number(issue.first_seen_at)) / 1000 / 60);

  return (
    <div style={{ maxWidth: "900px", margin: "0 auto", padding: "24px" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "24px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <Link href="/issues" style={{
            padding: "8px 16px",
            background: "#1a1a1a",
            borderRadius: "6px",
            color: "#fff",
            textDecoration: "none",
            border: "1px solid #2a2a2a",
          }}>
            ← Back
          </Link>
          <div>
            <h1 style={{ fontSize: "24px", fontWeight: 600, marginBottom: "4px" }}>{issue.title}</h1>
            <p style={{ fontSize: "12px", color: "#a0a0a0" }}>ID: {issue.id}</p>
          </div>
        </div>
        <div style={{ display: "flex", gap: "8px" }}>
          <StatusBadge status={issue.status} />
          <SeverityBadge severity={issue.severity} />
        </div>
      </div>

      {/* Details Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "24px" }}>
        <div style={cardStyle}>
          <h3 style={{ fontSize: "12px", color: "#a0a0a0", textTransform: "uppercase", marginBottom: "12px" }}>Details</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px", fontSize: "14px" }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "#a0a0a0" }}>Server:</span>
              <span>{issue.hostname || issue.server_id}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "#a0a0a0" }}>Source:</span>
              <span style={{ textTransform: "capitalize" }}>{issue.source}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "#a0a0a0" }}>Alert Count:</span>
              <span>{issue.alert_count} firings</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "#a0a0a0" }}>Duration:</span>
              <span>{duration} minutes</span>
            </div>
          </div>
        </div>

        <div style={cardStyle}>
          <h3 style={{ fontSize: "12px", color: "#a0a0a0", textTransform: "uppercase", marginBottom: "12px" }}>Timeline</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px", fontSize: "14px" }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "#a0a0a0" }}>First Seen:</span>
              <span>{new Date(Number(issue.first_seen_at)).toLocaleString()}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "#a0a0a0" }}>Last Seen:</span>
              <span>{new Date(Number(issue.last_seen_at)).toLocaleString()}</span>
            </div>
            {issue.resolved_at && (
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "#a0a0a0" }}>Resolved:</span>
                <span style={{ color: "#22c55e" }}>{new Date(Number(issue.resolved_at)).toLocaleString()}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Description */}
      <div style={{ ...cardStyle, marginBottom: "24px" }}>
        <h3 style={{ fontSize: "12px", color: "#a0a0a0", textTransform: "uppercase", marginBottom: "8px" }}>Description</h3>
        <p style={{ lineHeight: 1.6 }}>{issue.description || "No description available."}</p>
      </div>

      {/* Status Management */}
      <div style={{ ...cardStyle, marginBottom: "24px" }}>
        <h3 style={{ fontSize: "12px", color: "#a0a0a0", textTransform: "uppercase", marginBottom: "16px" }}>Change Status</h3>
        <form action={updateStatus} style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <input type="hidden" name="issueId" value={issue.id} />
          <select
            name="status"
            defaultValue={issue.status}
            style={{
              padding: "10px 12px",
              background: "#1a1a1a",
              border: "1px solid #2a2a2a",
              borderRadius: "6px",
              color: "#fafafa",
              fontSize: "14px",
            }}
          >
            <option value="open">Open</option>
            <option value="investigating">Investigating</option>
            <option value="resolved">Resolved</option>
            <option value="closed">Closed</option>
          </select>
          <button type="submit" style={{ ...buttonStyle, background: "#3b82f6", color: "#fff" }}>
            Update Status
          </button>
        </form>
      </div>

      {/* Feedback to Agent */}
      <div style={{ ...cardStyle, marginBottom: "24px", borderColor: "#ec4899" }}>
        <h3 style={{ fontSize: "14px", color: "#ec4899", marginBottom: "8px", display: "flex", alignItems: "center", gap: "8px" }}>
          👤 Provide Feedback to Agent
        </h3>
        <p style={{ fontSize: "13px", color: "#a0a0a0", marginBottom: "16px" }}>
          Add context or instructions for the AI agent. The agent will see this feedback and can incorporate it into future analysis.
        </p>
        <form action={addComment} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <input type="hidden" name="issueId" value={issue.id} />
          <input type="hidden" name="serverId" value={issue.server_id} />
          <input type="hidden" name="commentType" value="feedback" />
          <input type="hidden" name="authorName" value="Control Panel User" />
          <textarea
            name="content"
            rows={3}
            placeholder="e.g., 'The high memory usage is expected during batch processing. Focus on disk space instead.' or 'This is a known issue, please ignore similar alerts.'"
            required
            style={{ ...inputStyle, resize: "vertical" }}
          />
          <div>
            <button type="submit" style={{ ...buttonStyle, background: "#ec4899", color: "#fff" }}>
              Send Feedback to Agent
            </button>
          </div>
        </form>
      </div>

      {/* Add Note */}
      <div style={{ ...cardStyle, marginBottom: "24px" }}>
        <h3 style={{ fontSize: "12px", color: "#a0a0a0", textTransform: "uppercase", marginBottom: "16px" }}>Add Note</h3>
        <form action={addComment} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <input type="hidden" name="issueId" value={issue.id} />
          <input type="hidden" name="commentType" value="note" />
          <div>
            <label style={{ display: "block", fontSize: "13px", color: "#a0a0a0", marginBottom: "4px" }}>Your Name (optional)</label>
            <input
              type="text"
              name="authorName"
              placeholder="Control Panel User"
              style={inputStyle}
            />
          </div>
          <div>
            <label style={{ display: "block", fontSize: "13px", color: "#a0a0a0", marginBottom: "4px" }}>Note</label>
            <textarea
              name="content"
              rows={3}
              placeholder="Add a note about this issue..."
              required
              style={{ ...inputStyle, resize: "vertical" }}
            />
          </div>
          <div>
            <button type="submit" style={{ ...buttonStyle, background: "#22c55e", color: "#fff" }}>
              Add Note
            </button>
          </div>
        </form>
      </div>

      {/* Activity History */}
      <div>
        <h3 style={{ fontSize: "18px", fontWeight: 500, marginBottom: "16px" }}>
          Activity History ({comments.length} {comments.length === 1 ? "entry" : "entries"})
        </h3>
        <div>
          {comments.length === 0 ? (
            <div style={{ ...cardStyle, textAlign: "center", padding: "32px", color: "#a0a0a0" }}>
              No activity yet. Add a note or feedback to get started.
            </div>
          ) : (
            comments.map((comment) => (
              <CommentCard key={comment.id} comment={comment} />
            ))
          )}
        </div>
      </div>
    </div>
  );
}
