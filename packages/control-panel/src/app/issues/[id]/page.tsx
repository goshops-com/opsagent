import { getIssueById, getIssueComments, updateIssueStatus, addIssueComment, type Issue, type IssueComment } from "@/lib/db";
import { redirect } from "next/navigation";
import Link from "next/link";

export const dynamic = "force-dynamic";
export const revalidate = 0;

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
  
  if (issueId && content) {
    await addIssueComment(issueId, content, authorName || undefined, "note");
  }
  
  redirect(`/issues/${issueId}`);
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    open: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
    investigating: "bg-blue-500/20 text-blue-400 border-blue-500/30",
    resolved: "bg-green-500/20 text-green-400 border-green-500/30",
    closed: "bg-gray-500/20 text-gray-400 border-gray-500/30",
  };
  
  return (
    <span className={`px-3 py-1 rounded text-sm font-medium border ${colors[status] || colors.closed}`}>
      {status}
    </span>
  );
}

function SeverityBadge({ severity }: { severity: string }) {
  const colors: Record<string, string> = {
    critical: "bg-red-500/20 text-red-400 border-red-500/30",
    warning: "bg-orange-500/20 text-orange-400 border-orange-500/30",
    info: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  };
  
  return (
    <span className={`px-3 py-1 rounded text-sm font-medium border ${colors[severity] || colors.info}`}>
      {severity}
    </span>
  );
}

function CommentCard({ comment }: { comment: IssueComment }) {
  const typeLabels: Record<string, string> = {
    analysis: "🤖 AI Analysis",
    action: "⚡ Action",
    status_change: "📝 Status Change",
    alert_fired: "🔔 Alert",
    note: "💬 Note",
  };
  
  const typeColors: Record<string, string> = {
    analysis: "border-l-purple-500",
    action: "border-l-green-500",
    status_change: "border-l-blue-500",
    alert_fired: "border-l-yellow-500",
    note: "border-l-gray-500",
  };
  
  return (
    <div className={`bg-[#1a1a1a] p-4 rounded-lg border border-[#2a2a2a] border-l-4 ${typeColors[comment.comment_type]} mb-4`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-[#fafafa]">
            {typeLabels[comment.comment_type] || comment.comment_type}
          </span>
          <span className="text-xs text-[#a0a0a0]">
            by {comment.author_type === "agent" ? "AI Agent" : (comment.author_name || "Human")}
          </span>
        </div>
        <span className="text-xs text-[#a0a0a0]">
          {new Date(Number(comment.created_at)).toLocaleString()}
        </span>
      </div>
      <p className="text-[#fafafa] whitespace-pre-wrap">{comment.content}</p>
      {comment.metadata && (
        <div className="mt-2 text-xs text-[#a0a0a0] bg-[#0a0a0a] p-2 rounded">
          <code>{JSON.stringify(JSON.parse(comment.metadata), null, 2)}</code>
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

  if (!issue) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] text-[#fafafa] p-6">
        <div className="max-w-4xl mx-auto">
          <div className="bg-[#141414] p-8 rounded-lg border border-[#2a2a2a] text-center">
            <h1 className="text-2xl font-bold mb-4">Issue Not Found</h1>
            <p className="text-[#a0a0a0] mb-4">The issue you&apos;re looking for doesn&apos;t exist.</p>
            <Link
              href="/issues"
              className="px-4 py-2 bg-blue-500 hover:bg-blue-600 rounded-lg text-white transition-colors"
            >
              Back to Issues
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const duration = issue.resolved_at
    ? Math.floor((Number(issue.resolved_at) - Number(issue.first_seen_at)) / 1000 / 60)
    : Math.floor((Date.now() - Number(issue.first_seen_at)) / 1000 / 60);

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#fafafa] p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              href="/issues"
              className="px-4 py-2 bg-[#1a1a1a] hover:bg-[#2a2a2a] rounded-lg border border-[#2a2a2a] transition-colors"
            >
              ← Back to Issues
            </Link>
            <div>
              <h1 className="text-2xl font-bold">{issue.title}</h1>
              <p className="text-sm text-[#a0a0a0]">ID: {issue.id}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <StatusBadge status={issue.status} />
            <SeverityBadge severity={issue.severity} />
          </div>
        </div>

        {/* Issue Details */}
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-[#141414] p-4 rounded-lg border border-[#2a2a2a]">
            <h3 className="text-sm font-medium text-[#a0a0a0] uppercase tracking-wider mb-3">Details</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-[#a0a0a0]">Server:</span>
                <span className="text-[#fafafa]">{issue.hostname || issue.server_id}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#a0a0a0]">Source:</span>
                <span className="text-[#fafafa] capitalize">{issue.source}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#a0a0a0]">Alert Count:</span>
                <span className="text-[#fafafa]">{issue.alert_count} firings</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#a0a0a0]">Duration:</span>
                <span className="text-[#fafafa]">{duration} minutes</span>
              </div>
            </div>
          </div>

          <div className="bg-[#141414] p-4 rounded-lg border border-[#2a2a2a]">
            <h3 className="text-sm font-medium text-[#a0a0a0] uppercase tracking-wider mb-3">Timeline</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-[#a0a0a0]">First Seen:</span>
                <span className="text-[#fafafa]">
                  {new Date(Number(issue.first_seen_at)).toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#a0a0a0]">Last Seen:</span>
                <span className="text-[#fafafa]">
                  {new Date(Number(issue.last_seen_at)).toLocaleString()}
                </span>
              </div>
              {issue.resolved_at && (
                <div className="flex justify-between">
                  <span className="text-[#a0a0a0]">Resolved:</span>
                  <span className="text-green-400">
                    {new Date(Number(issue.resolved_at)).toLocaleString()}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Description */}
        <div className="bg-[#141414] p-4 rounded-lg border border-[#2a2a2a]">
          <h3 className="text-sm font-medium text-[#a0a0a0] uppercase tracking-wider mb-2">Description</h3>
          <p className="text-[#fafafa]">{issue.description || "No description available."}</p>
        </div>

        {/* Status Management */}
        <div className="bg-[#141414] p-4 rounded-lg border border-[#2a2a2a]">
          <h3 className="text-sm font-medium text-[#a0a0a0] uppercase tracking-wider mb-4">Change Status</h3>
          <form action={updateStatus} className="flex items-center gap-4">
            <input type="hidden" name="issueId" value={issue.id} />
            <select
              name="status"
              className="px-3 py-2 bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg text-[#fafafa] focus:outline-none focus:border-blue-500"
              defaultValue={issue.status}
            >
              <option value="open">Open</option>
              <option value="investigating">Investigating</option>
              <option value="resolved">Resolved</option>
              <option value="closed">Closed</option>
            </select>
            <button
              type="submit"
              className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors"
            >
              Update Status
            </button>
          </form>
        </div>

        {/* Add Comment */}
        <div className="bg-[#141414] p-4 rounded-lg border border-[#2a2a2a]">
          <h3 className="text-sm font-medium text-[#a0a0a0] uppercase tracking-wider mb-4">Add Comment</h3>
          <form action={addComment} className="space-y-4">
            <input type="hidden" name="issueId" value={issue.id} />
            <div>
              <label className="block text-sm text-[#a0a0a0] mb-1">Your Name (optional)</label>
              <input
                type="text"
                name="authorName"
                placeholder="Control Panel User"
                className="w-full px-3 py-2 bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg text-[#fafafa] placeholder-[#666] focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm text-[#a0a0a0] mb-1">Comment</label>
              <textarea
                name="content"
                rows={3}
                placeholder="Add a note about this issue..."
                required
                className="w-full px-3 py-2 bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg text-[#fafafa] placeholder-[#666] focus:outline-none focus:border-blue-500"
              />
            </div>
            <button
              type="submit"
              className="px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg transition-colors"
            >
              Add Comment
            </button>
          </form>
        </div>

        {/* Comments History */}
        <div>
          <h3 className="text-lg font-medium mb-4">Activity History ({comments.length} comments)</h3>
          <div className="space-y-4">
            {comments.length === 0 ? (
              <div className="bg-[#141414] p-6 rounded-lg border border-[#2a2a2a] text-center text-[#a0a0a0]">
                No comments yet. Be the first to add one!
              </div>
            ) : (
              comments.map((comment) => (
                <CommentCard key={comment.id} comment={comment} />
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
