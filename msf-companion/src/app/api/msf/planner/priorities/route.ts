import { NextResponse } from "next/server";
import { getValidAccessTokenWithRefresh, refreshAccessToken } from "@/lib/auth";
import { msfApiFetch } from "@/lib/msf-api";
import { fetchNormalizedEvents } from "@/lib/planner-events";
import { calculatePriorities } from "@/lib/investment-priority";

export const dynamic = "force-dynamic";

interface RawRosterChar {
  id: string;
  level?: number;
  activeYellow?: number;
  gearTier?: number;
  power?: number;
  info?: {
    name?: string;
    portrait?: string;
    traits?: (string | { id: string })[];
  };
}

function traitId(t: string | { id: string }): string {
  return typeof t === "string" ? t : t.id;
}

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
    const [rosterRaw, events] = await Promise.all([
      msfApiFetch<{ data?: RawRosterChar[] }>({
        path: "/player/v1/roster?charInfo=full&traitFormat=id",
        accessToken: token,
      }),
      fetchNormalizedEvents(token, forceRefresh),
    ]);

    const characters = (rosterRaw.data ?? []).map((c) => ({
      id: c.id,
      name: c.info?.name ?? c.id,
      portrait: c.info?.portrait ?? "",
      traits: (c.info?.traits ?? []).map(traitId),
      gearTier: c.gearTier ?? 0,
      stars: c.activeYellow ?? 0,
    }));

    const priorities = calculatePriorities(
      characters,
      events,
      new Map(), // Inventory lookup not needed for basic priority scoring
    );

    return NextResponse.json(priorities);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    if (message.includes("552") || message.includes("553")) {
      return NextResponse.json(
        {
          error: "Game servers are in maintenance.",
          code: "MAINTENANCE",
          retryable: true,
        },
        { status: 503 },
      );
    }

    console.error("Planner priorities fetch failed:", err);

    // MSF API rejected our token — try refreshing once
    if (message.includes("401")) {
      const freshToken = await refreshAccessToken();
      if (!freshToken) {
        return NextResponse.json(
          { error: "Session expired. Please log in again.", code: "TOKEN_EXPIRED", retryable: false },
          { status: 401 },
        );
      }
    }

    return NextResponse.json(
      {
        error: "Failed to compute priorities",
        code: "MSF_API_ERROR",
        retryable: true,
      },
      { status: 502 },
    );
  }
}
