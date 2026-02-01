import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Basic authentication middleware for the control panel.
 *
 * Uses the CONTROL_PANEL_PASSWORD environment variable for authentication.
 * - Web UI: Basic auth with username "admin" and the password
 * - API routes: Bearer token or Basic auth
 */

const PASSWORD = process.env.CONTROL_PANEL_PASSWORD;

function unauthorized(message: string = "Unauthorized") {
  return new NextResponse(message, {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="OpsAgent Control Panel"',
    },
  });
}

function parseBasicAuth(authHeader: string): { username: string; password: string } | null {
  if (!authHeader.startsWith("Basic ")) {
    return null;
  }

  try {
    const base64 = authHeader.slice(6);
    const decoded = atob(base64);
    const [username, password] = decoded.split(":");
    return { username, password };
  } catch {
    return null;
  }
}

function parseBearerToken(authHeader: string): string | null {
  if (!authHeader.startsWith("Bearer ")) {
    return null;
  }
  return authHeader.slice(7);
}

export function middleware(request: NextRequest) {
  // Skip auth if no password is configured (development mode)
  if (!PASSWORD) {
    return NextResponse.next();
  }

  const authHeader = request.headers.get("authorization") || "";
  const isApiRoute = request.nextUrl.pathname.startsWith("/api/");

  // For API routes, accept both Basic auth and Bearer token
  if (isApiRoute) {
    // Try Bearer token first (for agents)
    const bearerToken = parseBearerToken(authHeader);
    if (bearerToken === PASSWORD) {
      return NextResponse.next();
    }

    // Try Basic auth
    const basicAuth = parseBasicAuth(authHeader);
    if (basicAuth && basicAuth.password === PASSWORD) {
      return NextResponse.next();
    }

    // Health endpoint is always accessible (for monitoring)
    if (request.nextUrl.pathname === "/api/health") {
      return NextResponse.next();
    }

    return unauthorized("Invalid or missing authentication");
  }

  // For web UI, require Basic auth
  const basicAuth = parseBasicAuth(authHeader);
  if (!basicAuth || basicAuth.password !== PASSWORD) {
    return unauthorized();
  }

  // Username must be "admin" for web UI
  if (basicAuth.username !== "admin") {
    return unauthorized("Invalid username");
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Match all paths except static files and _next
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
