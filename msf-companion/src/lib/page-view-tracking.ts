import { headers } from "next/headers";
import { getSession } from "@/lib/session";
import { trackUsageEvent } from "@/lib/usage-tracking";

/**
 * Track a page view for the current request.
 * Reads the pathname from the x-pathname header set by middleware.
 * Skips API routes, admin routes, and unauthenticated requests.
 * Fire-and-forget — never throws.
 */
export async function trackPageView(): Promise<void> {
  try {
    const headersList = await headers();
    const pathname = headersList.get("x-pathname");

    if (!pathname) return;

    // Skip API routes
    if (pathname.startsWith("/api/")) return;

    // Skip admin routes
    if (pathname.startsWith("/admin/")) return;
    if (pathname === "/admin") return;

    const session = await getSession();
    if (!session.scopelyId) return;

    // Fire-and-forget: don't await
    trackUsageEvent(session.scopelyId, "page_view", pathname).catch(() => {});
  } catch {
    // Never block rendering
  }
}
