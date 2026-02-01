import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET /api/alerts - List alerts
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get("limit") || "50");
    const server_id = searchParams.get("server_id");

    let sql = `
      SELECT a.*, s.hostname
      FROM alerts a
      LEFT JOIN servers s ON a.server_id = s.id
    `;
    const args: (string | number)[] = [];

    if (server_id) {
      sql += " WHERE a.server_id = ?";
      args.push(server_id);
    }

    sql += " ORDER BY a.created_at DESC LIMIT ?";
    args.push(limit);

    const result = await db.execute({ sql, args });

    return NextResponse.json({
      success: true,
      alerts: result.rows,
    });
  } catch (error) {
    console.error("[API] Error fetching alerts:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch alerts" },
      { status: 500 }
    );
  }
}

// POST /api/alerts - Submit an alert
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      id,
      server_id,
      severity,
      message,
      metric,
      current_value,
      threshold,
      timestamp,
    } = body;

    if (!id || !server_id || !severity || !message) {
      return NextResponse.json(
        { success: false, error: "Missing required fields" },
        { status: 400 }
      );
    }

    const now = timestamp || Date.now();

    await db.execute({
      sql: `
        INSERT INTO alerts (id, server_id, severity, message, metric, current_value, threshold, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          resolved_at = excluded.resolved_at,
          acknowledged = excluded.acknowledged
      `,
      args: [
        id,
        server_id,
        severity,
        message,
        metric || null,
        current_value || null,
        threshold || null,
        now,
      ],
    });

    console.log(`[API] Alert saved: ${id} (${severity}) from ${server_id}`);

    return NextResponse.json({
      success: true,
      message: "Alert saved successfully",
      alert_id: id,
    });
  } catch (error) {
    console.error("[API] Error saving alert:", error);
    return NextResponse.json(
      { success: false, error: "Failed to save alert" },
      { status: 500 }
    );
  }
}
