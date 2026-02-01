import { getIssues, getIssueStats, updateIssueStatus, discardIssue, type Issue } from "@/lib/db";
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
  
  redirect("/issues?refresh=" + Date.now());
}

async function discardIssueAction(formData: FormData) {
  "use server";
  const issueId = formData.get("issueId") as string;
  
  if (issueId) {
    await discardIssue(issueId);
  }
  
  redirect("/issues?refresh=" + Date.now());
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    open: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
    investigating: "bg-blue-500/20 text-blue-400 border-blue-500/30",
    resolved: "bg-green-500/20 text-green-400 border-green-500/30",
    closed: "bg-gray-500/20 text-gray-400 border-gray-500/30",
  };
  
  return (
    <span className={`px-2 py-1 rounded text-xs font-medium border ${colors[status] || colors.closed}`}>
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
    <span className={`px-2 py-1 rounded text-xs font-medium border ${colors[severity] || colors.info}`}>
      {severity}
    </span>
  );
}

export default async function IssuesPage({
  searchParams,
}: {
  searchParams: { status?: string };
}) {
  const status = searchParams.status || "all";
  const [issues, stats] = await Promise.all([
    getIssues(status === "all" ? undefined : status, 100),
    getIssueStats(),
  ]);

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#fafafa] p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold mb-2">Issues</h1>
            <p className="text-[#a0a0a0]">
              Manage ongoing investigations and track agent actions
            </p>
          </div>
          <Link
            href="/"
            className="px-4 py-2 bg-[#1a1a1a] hover:bg-[#2a2a2a] rounded-lg border border-[#2a2a2a] transition-colors"
          >
            ← Back to Dashboard
          </Link>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-5 gap-4">
          <div className="bg-[#141414] p-4 rounded-lg border border-[#2a2a2a]">
            <div className="text-2xl font-bold text-yellow-400">{stats.open}</div>
            <div className="text-xs text-[#a0a0a0] uppercase tracking-wider mt-1">Open</div>
          </div>
          <div className="bg-[#141414] p-4 rounded-lg border border-[#2a2a2a]">
            <div className="text-2xl font-bold text-blue-400">{stats.investigating}</div>
            <div className="text-xs text-[#a0a0a0] uppercase tracking-wider mt-1">Investigating</div>
          </div>
          <div className="bg-[#141414] p-4 rounded-lg border border-[#2a2a2a]">
            <div className="text-2xl font-bold text-green-400">{stats.resolved}</div>
            <div className="text-xs text-[#a0a0a0] uppercase tracking-wider mt-1">Resolved</div>
          </div>
          <div className="bg-[#141414] p-4 rounded-lg border border-[#2a2a2a]">
            <div className="text-2xl font-bold text-gray-400">{stats.closed}</div>
            <div className="text-xs text-[#a0a0a0] uppercase tracking-wider mt-1">Closed</div>
          </div>
          <div className="bg-[#141414] p-4 rounded-lg border border-[#2a2a2a]">
            <div className="text-2xl font-bold text-white">{stats.total}</div>
            <div className="text-xs text-[#a0a0a0] uppercase tracking-wider mt-1">Total</div>
          </div>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-[#a0a0a0]">Filter:</span>
          {["all", "open", "investigating", "resolved", "closed"].map((s) => (
            <Link
              key={s}
              href={`/issues?status=${s}`}
              className={`px-3 py-1 rounded text-sm capitalize transition-colors ${
                status === s
                  ? "bg-blue-500 text-white"
                  : "bg-[#1a1a1a] hover:bg-[#2a2a2a] text-[#a0a0a0]"
              }`}
            >
              {s}
            </Link>
          ))}
        </div>

        {/* Issues List */}
        <div className="bg-[#141414] rounded-lg border border-[#2a2a2a] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-[#1a1a1a] border-b border-[#2a2a2a]">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-[#a0a0a0] uppercase tracking-wider">
                    Issue
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-[#a0a0a0] uppercase tracking-wider">
                    Server
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-[#a0a0a0] uppercase tracking-wider">
                    Severity
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-[#a0a0a0] uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-[#a0a0a0] uppercase tracking-wider">
                    Alerts
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-[#a0a0a0] uppercase tracking-wider">
                    Last Seen
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-[#a0a0a0] uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#2a2a2a]">
                {issues.map((issue) => (
                  <tr key={issue.id} className="hover:bg-[#1a1a1a]/50">
                    <td className="px-4 py-4">
                      <div className="space-y-1">
                        <Link
                          href={`/issues/${issue.id}`}
                          className="font-medium text-blue-400 hover:text-blue-300"
                        >
                          {issue.title}
                        </Link>
                        <p className="text-sm text-[#a0a0a0] line-clamp-2">
                          {issue.description}
                        </p>
                      </div>
                    </td>
                    <td className="px-4 py-4 text-sm text-[#a0a0a0]">
                      {issue.hostname || issue.server_id}
                    </td>
                    <td className="px-4 py-4">
                      <SeverityBadge severity={issue.severity} />
                    </td>
                    <td className="px-4 py-4">
                      <StatusBadge status={issue.status} />
                    </td>
                    <td className="px-4 py-4 text-sm text-[#a0a0a0]">
                      <span className="font-medium text-white">{issue.alert_count}</span>
                      <span className="text-xs ml-1">firings</span>
                    </td>
                    <td className="px-4 py-4 text-sm text-[#a0a0a0]">
                      {new Date(Number(issue.last_seen_at)).toLocaleString()}
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/issues/${issue.id}`}
                          className="px-3 py-1 bg-blue-500/20 text-blue-400 rounded text-sm hover:bg-blue-500/30 transition-colors"
                        >
                          View
                        </Link>
                        
                        {issue.status !== "resolved" && issue.status !== "closed" && (
                          <form action={updateStatus} className="inline">
                            <input type="hidden" name="issueId" value={issue.id} />
                            <input type="hidden" name="status" value="resolved" />
                            <button
                              type="submit"
                              className="px-3 py-1 bg-green-500/20 text-green-400 rounded text-sm hover:bg-green-500/30 transition-colors"
                            >
                              Resolve
                            </button>
                          </form>
                        )}
                        
                        {issue.status !== "closed" && (
                          <form action={discardIssueAction} className="inline">
                            <input type="hidden" name="issueId" value={issue.id} />
                            <button
                              type="submit"
                              className="px-3 py-1 bg-gray-500/20 text-gray-400 rounded text-sm hover:bg-gray-500/30 transition-colors"
                            >
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
          </div>
          
          {issues.length === 0 && (
            <div className="p-8 text-center text-[#a0a0a0]">
              <p className="text-lg mb-2">No issues found</p>
              <p className="text-sm">{status === "all" ? "Great! No issues in the system." : `No ${status} issues.`}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
