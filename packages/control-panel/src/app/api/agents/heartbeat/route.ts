import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// POST /api/agents/heartbeat - Agent heartbeat
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { agent_id, metrics_summary } = body;

    if (!agent_id) {
      return NextResponse.json(
        { success: false, error: "Missing required field: agent_id" },
        { status: 400 }
      );
    }

    const now = Date.now();

    // Update agent status
    const result = await db.execute({
      sql: `
        UPDATE servers
        SET last_seen_at = ?, status = 'active'
        WHERE id = ?
      `,
      args: [now, agent_id],
    });

    if (result.rowsAffected === 0) {
      return NextResponse.json(
        { success: false, error: "Agent not found. Please register first." },
        { status: 404 }
      );
    }

    // Optionally save metrics summary
    if (metrics_summary) {
      await db.execute({
        sql: `
          INSERT INTO metrics_snapshots (
            server_id, timestamp, cpu_usage, memory_used_percent,
            disk_max_used_percent, process_count
          ) VALUES (?, ?, ?, ?, ?, ?)
        `,
        args: [
          agent_id,
          now,
          metrics_summary.cpu_usage || 0,
          metrics_summary.memory_used_percent || 0,
          metrics_summary.disk_max_used_percent || 0,
          metrics_summary.process_count || 0,
        ],
      });
    }

    return NextResponse.json({
      success: true,
      message: "Heartbeat received",
      timestamp: now,
    });
  } catch (error) {
    console.error("[API] Error processing heartbeat:", error);
    return NextResponse.json(
      { success: false, error: "Failed to process heartbeat" },
      { status: 500 }
    );
  }
}
