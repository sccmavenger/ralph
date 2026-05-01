import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { trackUsageEvent } from "@/lib/usage-tracking";

interface TrackBody {
  feature?: string;
  metadata?: Record<string, unknown>;
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session.scopelyId) {
      return NextResponse.json({ ok: true }); // Silently ignore unauthenticated
    }

    const body = (await request.json()) as TrackBody;
    if (!body.feature || typeof body.feature !== "string") {
      return NextResponse.json({ ok: true });
    }

    // Fire-and-forget
    trackUsageEvent(session.scopelyId, "feature_use", body.feature, body.metadata).catch(() => {});

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: true });
  }
}
