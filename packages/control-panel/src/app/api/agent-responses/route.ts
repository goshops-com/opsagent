import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET /api/agent-responses - List agent responses
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get("limit") || "50");
    const server_id = searchParams.get("server_id");

    let sql = `
      SELECT ar.*, s.hostname
      FROM agent_responses ar
      LEFT JOIN servers s ON ar.server_id = s.id
    `;
    const args: (string | number)[] = [];

    if (server_id) {
      sql += " WHERE ar.server_id = ?";
      args.push(server_id);
    }

    sql += " ORDER BY ar.created_at DESC LIMIT ?";
    args.push(limit);

    const result = await db.execute({ sql, args });

    return NextResponse.json({
      success: true,
      responses: result.rows,
    });
  } catch (error) {
    console.error("[API] Error fetching agent responses:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch agent responses" },
      { status: 500 }
    );
  }
}

// POST /api/agent-responses - Submit an agent response
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      id,
      alert_id,
      server_id,
      model,
      analysis,
      can_auto_remediate,
      requires_human_attention,
      human_notification_reason,
      raw_response,
      actions,
      timestamp,
    } = body;

    if (!id || !server_id) {
      return NextResponse.json(
        { success: false, error: "Missing required fields: id, server_id" },
        { status: 400 }
      );
    }

    const now = timestamp || Date.now();

    // Save the agent response
    await db.execute({
      sql: `
        INSERT INTO agent_responses (
          id, alert_id, server_id, model, analysis,
          can_auto_remediate, requires_human_attention,
          human_notification_reason, raw_response, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      args: [
        id,
        alert_id || null,
        server_id,
        model || null,
        analysis || "",
        can_auto_remediate ? 1 : 0,
        requires_human_attention ? 1 : 0,
        human_notification_reason || null,
        raw_response || null,
        now,
      ],
    });

    // Save each action if provided
    if (actions && Array.isArray(actions)) {
      for (const action of actions) {
        await db.execute({
          sql: `
            INSERT INTO agent_actions (
              response_id, alert_id, server_id, action_type, description,
              command, risk, status, output, error, skip_reason, executed_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `,
          args: [
            id,
            alert_id || null,
            server_id,
            action.action_type || action.action,
            action.description || "",
            action.command || null,
            action.risk || "low",
            action.status || "pending",
            action.output || null,
            action.error || null,
            action.skip_reason || null,
            action.executed_at || now,
          ],
        });
      }
    }

    console.log(`[API] Agent response saved: ${id} from ${server_id}`);

    return NextResponse.json({
      success: true,
      message: "Agent response saved successfully",
      response_id: id,
    });
  } catch (error) {
    console.error("[API] Error saving agent response:", error);
    return NextResponse.json(
      { success: false, error: "Failed to save agent response" },
      { status: 500 }
    );
  }
}
