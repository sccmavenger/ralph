import { NextResponse } from "next/server";
import { getValidAccessTokenWithRefresh, refreshAccessToken } from "@/lib/auth";
import { fetchCampaignNodes } from "@/lib/farming-service";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const token = await getValidAccessTokenWithRefresh();

  if (!token) {
    return NextResponse.json(
      { error: "Unauthorized", code: "UNAUTHORIZED", retryable: false },
      { status: 401 },
    );
  }

  const url = new URL(request.url);
  const forceRefresh = url.searchParams.get("refresh") === "true";

  try {
    const nodes = await fetchCampaignNodes(token, forceRefresh);
    return NextResponse.json(nodes);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    // Token expired — try refresh once
    if (message.includes("401")) {
      const freshToken = await refreshAccessToken();
      if (freshToken) {
        try {
          const nodes = await fetchCampaignNodes(freshToken, true);
          return NextResponse.json(nodes);
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
        {
          error: "Game servers are in maintenance. Please try again later.",
          code: "MAINTENANCE",
          retryable: true,
        },
        { status: 503 },
      );
    }

    if (message.includes("472")) {
      return NextResponse.json(
        {
          error: "Response too large — try again shortly.",
          code: "RESPONSE_TOO_LARGE",
          retryable: true,
        },
        { status: 502 },
      );
    }

    console.error("Farming nodes fetch failed:", err);
    return NextResponse.json(
      {
        error: "Failed to load campaign data",
        code: "MSF_API_ERROR",
        retryable: true,
      },
      { status: 502 },
    );
  }
}
