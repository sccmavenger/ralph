import { NextRequest, NextResponse } from "next/server";
import { refreshAccessToken } from "@/lib/auth";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * GET /api/auth/refresh — attempts token refresh, then redirects.
 * If refresh succeeds → redirect to ?redirect param (or /roster).
 * If refresh fails → clear session and redirect to /.
 */
export async function GET(request: NextRequest) {
  const redirectTo = request.nextUrl.searchParams.get("redirect") || "/dashboard";

  // Use forwarded host to build correct public URL (Container Apps terminates TLS)
  const proto = request.headers.get("x-forwarded-proto") || "https";
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host") || new URL(request.url).host;
  const baseUrl = `${proto}://${host}`;

  const newToken = await refreshAccessToken();

  if (newToken) {
    return NextResponse.redirect(new URL(redirectTo, baseUrl));
  }

  // Refresh failed — clear session and send to login
  const session = await getSession();
  session.destroy();

  return NextResponse.redirect(new URL("/", baseUrl));
}
