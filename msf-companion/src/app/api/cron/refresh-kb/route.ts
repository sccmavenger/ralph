import { NextRequest, NextResponse } from "next/server";
import { runIngestionPipeline, checkCreatorStaleness } from "@/lib/youtube-pipeline";

export async function GET() {
  return NextResponse.json({ status: "ok" });
}

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await runIngestionPipeline({ incremental: true });
  const staleness = await checkCreatorStaleness();
  const refreshedAt = new Date().toISOString();

  // Persist refresh state if module is available
  try {
    const { setRefreshState } = await import("@/lib/refresh-state");
    await setRefreshState({
      lastRefreshAt: refreshedAt,
      lastResult: {
        videosProcessed: result.videosProcessed,
        documentsUploaded: result.documentsUploaded,
        newVideosFound: result.newVideosFound,
        errors: result.errors,
      },
      staleness: staleness.map((s) => ({
        name: s.name,
        lastVideoDate: s.lastVideoDate,
        isStale: s.isStale,
      })),
    });
  } catch {
    // TODO: refresh-state module may not exist yet
  }

  return NextResponse.json({ result, staleness, refreshedAt });
}
