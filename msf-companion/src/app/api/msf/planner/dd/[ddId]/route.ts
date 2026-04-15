import { NextResponse } from "next/server";
import { getValidAccessTokenWithRefresh, refreshAccessToken } from "@/lib/auth";
import { fetchDD, DDServiceError } from "@/lib/dd-service";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ ddId: string }> },
) {
  const token = await getValidAccessTokenWithRefresh();

  if (!token) {
    return NextResponse.json(
      { error: "Unauthorized", code: "UNAUTHORIZED", retryable: false },
      { status: 401 },
    );
  }

  const { ddId } = await params;
  const url = new URL(request.url);
  const forceRefresh = url.searchParams.get("refresh") === "true";

  try {
    const dd = await fetchDD(ddId, token, forceRefresh);

    return NextResponse.json({
      id: dd.id,
      name: dd.name,
      ddCompletion: dd.ddCompletion,
      startingRoomId: dd.startingRoomId,
      nodes: dd.nodes.map((n) => ({
        roomId: n.roomId,
        name: n.name,
        isBoss: n.isBoss,
        sectionName: n.sectionName,
      })),
    });
  } catch (err) {
    if (err instanceof DDServiceError && err.status === 404) {
      return NextResponse.json(
        { error: err.message, code: "NOT_FOUND", retryable: false },
        { status: 404 },
      );
    }

    const message = err instanceof Error ? err.message : String(err);

    if (message.includes("401")) {
      const freshToken = await refreshAccessToken();
      if (freshToken) {
        try {
          const dd = await fetchDD(ddId, freshToken, true);
          return NextResponse.json({
            id: dd.id,
            name: dd.name,
            ddCompletion: dd.ddCompletion,
            startingRoomId: dd.startingRoomId,
            nodes: dd.nodes.map((n) => ({
              roomId: n.roomId,
              name: n.name,
              isBoss: n.isBoss,
              sectionName: n.sectionName,
            })),
          });
        } catch {
          // fallthrough
        }
      }
      return NextResponse.json(
        { error: "Session expired. Please log in again.", code: "TOKEN_EXPIRED", retryable: false },
        { status: 401 },
      );
    }

    if (message.includes("552") || message.includes("553")) {
      return NextResponse.json(
        { error: "Game servers are in maintenance.", code: "MAINTENANCE", retryable: true },
        { status: 503 },
      );
    }

    console.error("DD detail fetch failed:", err);
    return NextResponse.json(
      { error: "Failed to fetch Dark Dimension detail", code: "MSF_API_ERROR", retryable: true },
      { status: 502 },
    );
  }
}
