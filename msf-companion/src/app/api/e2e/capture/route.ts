import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";

/**
 * DEV-ONLY: Exports the current session data for E2E test setup.
 * Visit this URL in your browser while logged in to capture tokens for Playwright.
 * Usage: Open http://localhost:3000/api/e2e/capture in the browser where you're logged in.
 */
export async function GET() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not available in production" }, { status: 404 });
  }

  const session = await getSession();

  if (!session.accessToken) {
    return NextResponse.json(
      { error: "No active session. Please log in first at http://localhost:3000" },
      { status: 401 }
    );
  }

  return NextResponse.json({
    accessToken: session.accessToken,
    refreshToken: session.refreshToken,
    tokenExpiresAt: session.tokenExpiresAt,
    scopelyId: session.scopelyId,
    capturedAt: new Date().toISOString(),
  });
}
