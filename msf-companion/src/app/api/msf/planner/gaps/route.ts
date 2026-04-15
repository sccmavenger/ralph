import { NextResponse } from "next/server";
import { getValidAccessTokenWithRefresh, refreshAccessToken } from "@/lib/auth";
import { msfApiFetch } from "@/lib/msf-api";
import { fetchNormalizedEvents, NormalizedRequirements } from "@/lib/planner-events";

export const dynamic = "force-dynamic";

interface RawRosterChar {
  id: string;
  level?: number;
  activeYellow?: number;
  activeRed?: number;
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

function characterMatchesFilter(
  charTraits: string[],
  charId: string,
  reqs: NormalizedRequirements,
): boolean {
  if (reqs.specificCharacters.includes(charId)) return true;
  if (reqs.traits.length > 0) {
    return reqs.traits.some((t) => charTraits.includes(t));
  }
  return false;
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
    // Fetch roster (always fresh) and events (cached unless refresh) in parallel
    const [rosterRaw, events] = await Promise.all([
      msfApiFetch<{ data?: RawRosterChar[] }>({
        path: "/player/v1/roster?charInfo=full&traitFormat=id",
        accessToken: token,
      }),
      fetchNormalizedEvents(token, forceRefresh),
    ]);

    // Build roster lookup
    const rosterChars = (rosterRaw.data ?? []).map((c) => ({
      id: c.id,
      name: c.info?.name ?? c.id,
      portrait: c.info?.portrait ?? "",
      traits: (c.info?.traits ?? []).map(traitId),
      gearTier: c.gearTier ?? 0,
      stars: c.activeYellow ?? 0,
    }));
    const rosterMap = new Map(rosterChars.map((c) => [c.id, c]));

    // Only process events that have character requirements
    const eventsWithReqs = events.filter(
      (e) =>
        e.requirements.traits.length > 0 ||
        e.requirements.specificCharacters.length > 0,
    );

    const gaps = eventsWithReqs.map((event) => {
      const reqs = event.requirements;
      const requiredGear = reqs.minGearTier ?? 0;
      const requiredStars = reqs.minStars ?? 0;

      const characters: Array<{
        id: string;
        name: string;
        portrait: string;
        currentGear: number;
        requiredGear: number;
        currentStars: number;
        requiredStars: number;
        meetsRequirements: boolean;
        owned: boolean;
      }> = [];

      // Find matching owned characters
      for (const char of rosterChars) {
        if (characterMatchesFilter(char.traits, char.id, reqs)) {
          characters.push({
            id: char.id,
            name: char.name,
            portrait: char.portrait,
            currentGear: char.gearTier,
            requiredGear,
            currentStars: char.stars,
            requiredStars,
            meetsRequirements:
              char.gearTier >= requiredGear && char.stars >= requiredStars,
            owned: true,
          });
        }
      }

      // Add unowned specific characters
      for (const charId of reqs.specificCharacters) {
        if (!rosterMap.has(charId)) {
          characters.push({
            id: charId,
            name: charId,
            portrait: "",
            currentGear: 0,
            requiredGear,
            currentStars: 0,
            requiredStars,
            meetsRequirements: false,
            owned: false,
          });
        }
      }

      const meetingReqs = characters.filter((c) => c.meetsRequirements).length;
      const total = characters.length;
      const readinessPercent =
        total > 0 ? Math.round((meetingReqs / total) * 100) : 100;

      return {
        eventId: event.id,
        eventName: event.name,
        type: event.type,
        startTime: event.startTime,
        endTime: event.endTime,
        readinessPercent,
        characters,
      };
    });

    return NextResponse.json(gaps);
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

    console.error("Planner gaps fetch failed:", err);

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
        error: "Failed to compute gap analysis",
        code: "MSF_API_ERROR",
        retryable: true,
      },
      { status: 502 },
    );
  }
}
