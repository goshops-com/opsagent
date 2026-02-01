import { NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET /api/health - Health check endpoint
export async function GET() {
  try {
    // Try a simple database query to verify connectivity
    await db.execute("SELECT 1");

    return NextResponse.json({
      success: true,
      status: "healthy",
      timestamp: Date.now(),
      version: "1.0.0",
    });
  } catch (error) {
    console.error("[API] Health check failed:", error);
    return NextResponse.json(
      {
        success: false,
        status: "unhealthy",
        error: "Database connection failed",
        timestamp: Date.now(),
      },
      { status: 503 }
    );
  }
}
