import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-session";
import {
  runIngestionPipeline,
  getDocumentCount,
  clearIndex,
  MSF_CREATORS,
} from "@/lib/youtube-pipeline";
import { getRefreshState } from "@/lib/refresh-state";

export async function POST(request: NextRequest) {
  const session = await getAdminSession();
  if (!session.isAdmin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json() as { action?: string; clearExisting?: boolean };
  const action = body.action || "ingest";

  if (action === "clear") {
    await clearIndex();
    return NextResponse.json({ message: "Index cleared", documentsRemaining: 0 });
  }

  if (action === "status") {
    const count = await getDocumentCount();
    return NextResponse.json({
      documentCount: count,
      creators: MSF_CREATORS.map((c) => c.name),
      searchConfigured:
        !!(process.env.AZURE_AI_SEARCH_ENDPOINT && process.env.AZURE_AI_SEARCH_KEY),
    });
  }

  if (action === "ingest") {
    const logs: string[] = [];
    const result = await runIngestionPipeline({
      clearExisting: body.clearExisting ?? false,
      maxVideosPerChannel: 15,
      onProgress: (msg: string) => logs.push(msg),
    });

    return NextResponse.json({
      ...result,
      logs,
      documentCount: await getDocumentCount(),
    });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}

export async function GET() {
  const session = await getAdminSession();
  if (!session.isAdmin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const count = await getDocumentCount();
  const refreshState = await getRefreshState();
  return NextResponse.json({
    documentCount: count,
    creators: MSF_CREATORS.map((c) => c.name),
    searchConfigured:
      !!(process.env.AZURE_AI_SEARCH_ENDPOINT && process.env.AZURE_AI_SEARCH_KEY),
    refreshState,
  });
}
