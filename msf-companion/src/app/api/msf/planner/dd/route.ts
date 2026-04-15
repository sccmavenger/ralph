import { NextResponse } from "next/server";
import { getValidAccessTokenWithRefresh, refreshAccessToken } from "@/lib/auth";
import { fetchAllDDs, DDServiceError } from "@/lib/dd-service";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  let token = await getValidAccessTokenWithRefresh();

  if (!token) {
    return NextResponse.json(
      { error: "Unauthorized", code: "UNAUTHORIZED", retryable: false },
      { status: 401 },
    );
  }

  const url = new URL(request.url);
  const forceRefresh = url.searchParams.get("refresh") === "true";

  try {
    const dds = await fetchAllDDs(token, forceRefresh);

    const result = dds.map((dd) => ({
      id: dd.id,
      name: dd.name,
      nodeCount: dd.nodeCount ?? dd.nodes.length,
      ddCompletion: dd.ddCompletion,
    }));

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    if (message.includes("401")) {
      const freshToken = await refreshAccessToken();
      if (freshToken) {
        try {
          const dds = await fetchAllDDs(freshToken, true);
          return NextResponse.json(
            dds.map((dd) => ({
              id: dd.id,
              name: dd.name,
              nodeCount: dd.nodeCount ?? dd.nodes.length,
              ddCompletion: dd.ddCompletion,
            })),
          );
        } catch {
          // Second attempt failed
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

    console.error("DD list fetch failed:", err);
    return NextResponse.json(
      { error: "Failed to fetch Dark Dimensions", code: "MSF_API_ERROR", retryable: true },
      { status: 502 },
    );
  }
}
