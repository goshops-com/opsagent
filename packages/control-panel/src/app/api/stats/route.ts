import { NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET /api/stats - Dashboard statistics
export async function GET() {
  try {
    const [
      totalAgents,
      onlineAgents,
      activeAlerts,
      pendingActions,
      openIssues,
      recentAlerts,
    ] = await Promise.all([
      // Total agents
      db.execute("SELECT COUNT(*) as count FROM servers"),
      // Online agents (seen in last 2 minutes)
      db.execute(`
        SELECT COUNT(*) as count FROM servers
        WHERE last_seen_at > (strftime('%s', 'now') * 1000 - 120000)
      `),
      // Active alerts
      db.execute("SELECT COUNT(*) as count FROM alerts WHERE resolved_at IS NULL"),
      // Pending actions
      db.execute("SELECT COUNT(*) as count FROM agent_actions WHERE status = 'pending'"),
      // Open issues
      db.execute("SELECT COUNT(*) as count FROM issues WHERE status IN ('open', 'investigating')"),
      // Recent alerts (last 24 hours)
      db.execute(`
        SELECT COUNT(*) as count FROM alerts
        WHERE created_at > (strftime('%s', 'now') * 1000 - 86400000)
      `),
    ]);

    return NextResponse.json({
      success: true,
      stats: {
        totalAgents: Number(totalAgents.rows[0]?.count ?? 0),
        onlineAgents: Number(onlineAgents.rows[0]?.count ?? 0),
        offlineAgents: Number(totalAgents.rows[0]?.count ?? 0) - Number(onlineAgents.rows[0]?.count ?? 0),
        activeAlerts: Number(activeAlerts.rows[0]?.count ?? 0),
        pendingActions: Number(pendingActions.rows[0]?.count ?? 0),
        openIssues: Number(openIssues.rows[0]?.count ?? 0),
        alertsLast24h: Number(recentAlerts.rows[0]?.count ?? 0),
      },
    });
  } catch (error) {
    console.error("[API] Error fetching stats:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch stats" },
      { status: 500 }
    );
  }
}
