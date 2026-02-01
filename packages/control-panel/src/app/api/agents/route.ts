import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET /api/agents - List all agents
export async function GET() {
  try {
    const result = await db.execute(`
      SELECT
        id, hostname, name, ip_address, os, os_version,
        first_seen_at, last_seen_at, status,
        CASE
          WHEN last_seen_at > (strftime('%s', 'now') * 1000 - 120000) THEN 'online'
          ELSE 'offline'
        END as connection_status
      FROM servers
      ORDER BY last_seen_at DESC
    `);

    return NextResponse.json({
      success: true,
      agents: result.rows,
    });
  } catch (error) {
    console.error("[API] Error fetching agents:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch agents" },
      { status: 500 }
    );
  }
}

// POST /api/agents - Register a new agent
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, hostname, name, ip_address, os, os_version } = body;

    if (!id || !hostname) {
      return NextResponse.json(
        { success: false, error: "Missing required fields: id, hostname" },
        { status: 400 }
      );
    }

    const now = Date.now();

    await db.execute({
      sql: `
        INSERT INTO servers (id, hostname, name, ip_address, os, os_version, first_seen_at, last_seen_at, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active')
        ON CONFLICT(id) DO UPDATE SET
          hostname = excluded.hostname,
          name = excluded.name,
          ip_address = excluded.ip_address,
          os = excluded.os,
          os_version = excluded.os_version,
          last_seen_at = excluded.last_seen_at,
          status = 'active'
      `,
      args: [id, hostname, name || hostname, ip_address || null, os || null, os_version || null, now, now],
    });

    console.log(`[API] Agent registered: ${id} (${hostname})`);

    return NextResponse.json({
      success: true,
      message: "Agent registered successfully",
      agent: { id, hostname, name: name || hostname },
    });
  } catch (error) {
    console.error("[API] Error registering agent:", error);
    return NextResponse.json(
      { success: false, error: "Failed to register agent" },
      { status: 500 }
    );
  }
}
