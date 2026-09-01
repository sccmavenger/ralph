import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { trackUsageEvent } from "@/lib/usage-tracking";
import { parseTrackedPagePath } from "@/lib/usage-track-validation";

interface TrackBody {
  feature?: unknown;
  page?: unknown;
  metadata?: Record<string, unknown>;
}

function ok() {
  return NextResponse.json({ ok: true });
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session.scopelyId) {
      return ok(); // Silently ignore unauthenticated
    }

    const value = await request.json();
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return ok();
    }
    const body = value as TrackBody;
    const hasPage = Object.prototype.hasOwnProperty.call(body, "page");
    const hasFeature = Object.prototype.hasOwnProperty.call(body, "feature");

    // A request represents exactly one event. Do not reinterpret an invalid
    // page payload as a caller-controlled feature event.
    if (hasPage && hasFeature) return ok();

    if (hasPage) {
      const page = parseTrackedPagePath(body.page);
      if (!page) return ok();

      trackUsageEvent(session.scopelyId, "page_view", page).catch(() => {});
      return ok();
    }

    if (typeof body.feature !== "string" || !body.feature) return ok();

    // Preserve the existing feature-event contract.
    trackUsageEvent(
      session.scopelyId,
      "feature_use",
      body.feature,
      body.metadata,
    ).catch(() => {});

    return ok();
  } catch {
    return ok();
  }
}
