import { NextResponse } from "next/server";

/**
 * Liveness/readiness probe for the Cloudflare container front door
 * (src/worker/index.ts polls this before forwarding real traffic).
 *
 * This deliberately checks nothing but "the Next.js server is answering".
 * Adding a database or upstream-service check would make a slow or degraded
 * dependency look like a failed container start, and the Worker would keep
 * restarting a container that is actually fine. Dependency health belongs in a
 * separate, non-blocking endpoint.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ status: "ok", at: new Date().toISOString() });
}
