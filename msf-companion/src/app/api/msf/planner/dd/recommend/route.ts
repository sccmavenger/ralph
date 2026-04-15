import { NextResponse } from "next/server";
import { getValidAccessTokenWithRefresh, refreshAccessToken } from "@/lib/auth";
import { msfApiFetch } from "@/lib/msf-api";
import { fetchNode, DDServiceError, type CharacterFilter } from "@/lib/dd-service";
import { filterEligible, type RosterCharacter } from "@/lib/dd-eligibility";
import { generateRecommendation } from "@/lib/dd-recommendation";

export const dynamic = "force-dynamic";

function traitId(t: string | { id: string }): string {
  return typeof t === "string" ? t : t.id;
}

interface RawRosterChar {
  id: string;
  level?: number;
  activeYellow?: number;
  activeRed?: number;
  gearTier?: number;
  power?: number;
  iso8?: { active?: string; level?: number; pips?: number };
  info?: {
    id?: string;
    name?: string;
    portrait?: string;
    traits?: (string | { id: string })[];
    invisibleTraits?: (string | { id: string })[];
  };
}

export async function POST(request: Request) {
  const token = await getValidAccessTokenWithRefresh();

  if (!token) {
    return NextResponse.json(
      { error: "Unauthorized", code: "UNAUTHORIZED", retryable: false },
      { status: 401 },
    );
  }

  let body: { ddId?: string; roomId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body", code: "BAD_REQUEST", retryable: false },
      { status: 400 },
    );
  }

  const { ddId, roomId } = body;
  if (!ddId || !roomId) {
    return NextResponse.json(
      { error: "ddId and roomId are required", code: "BAD_REQUEST", retryable: false },
      { status: 400 },
    );
  }

  try {
    // Fetch node data and first roster page in parallel
    const PER_PAGE = 200;
    const [node, rosterPage1] = await Promise.all([
      fetchNode(ddId, roomId, token),
      msfApiFetch<{ data?: RawRosterChar[]; meta?: { perTotal?: number } }>({
        path: `/player/v1/roster?charInfo=full&page=1&perPage=${PER_PAGE}`,
        accessToken: token,
      }),
    ]);

    // Gather all roster characters, fetching additional pages if needed
    const allRawChars: RawRosterChar[] = [...(rosterPage1.data ?? [])];
    const total = rosterPage1.meta?.perTotal ?? allRawChars.length;

    if (total > PER_PAGE) {
      const pageCount = Math.ceil(total / PER_PAGE);
      const remainingPages = Array.from(
        { length: pageCount - 1 },
        (_, i) => i + 2,
      );
      const extraPages = await Promise.all(
        remainingPages.map((p) =>
          msfApiFetch<{ data?: RawRosterChar[] }>({
            path: `/player/v1/roster?charInfo=full&page=${p}&perPage=${PER_PAGE}`,
            accessToken: token,
          }),
        ),
      );
      for (const page of extraPages) {
        allRawChars.push(...(page.data ?? []));
      }
    }

    const roster: RosterCharacter[] = allRawChars.map((c) => ({
      id: c.id,
      level: c.level,
      activeYellow: c.activeYellow,
      activeRed: c.activeRed,
      gearTier: c.gearTier,
      power: c.power,
      iso8: c.iso8,
      info: c.info,
    }));

    // Run eligibility filter
    const requirements = node.requirements ?? {};
    const { eligible, compliant, maxCharacters } = filterEligible(roster, requirements);

    // Run recommendation engine
    const characterFilters = requirements.anyCharacterFilters;
    const recommendation = generateRecommendation(
      compliant,
      node.combat,
      maxCharacters,
      characterFilters,
    );

    // Generate future build suggestions from eligible-but-not-compliant
    const futureBuildSuggestions: Array<{
      id: string;
      name: string;
      reason: string;
      currentState: { gearTier: number; level: number };
      requiredState: { gearTier: number | null; level: number | null };
    }> = [];

    const compliantIds = new Set(compliant.map((c) => c.id));
    const eligibleNotCompliant = eligible.filter((c) => !compliantIds.has(c.id));

    // Find required minimums from filters
    let requiredGear: number | null = null;
    let requiredLevel: number | null = null;
    if (characterFilters) {
      for (const f of characterFilters) {
        if (f.gearTier != null)
          requiredGear = Math.max(requiredGear ?? 0, f.gearTier);
        if (f.level != null)
          requiredLevel = Math.max(requiredLevel ?? 0, f.level);
      }
    }

    // Sort by power descending and take top 2
    const sortedFuture = eligibleNotCompliant
      .sort((a, b) => (b.power ?? 0) - (a.power ?? 0))
      .slice(0, 2);

    for (const char of sortedFuture) {
      futureBuildSuggestions.push({
        id: char.id,
        name: char.info?.name ?? char.id,
        reason: `Eligible but needs gear/level upgrade to meet node requirements`,
        currentState: {
          gearTier: char.gearTier ?? 0,
          level: char.level ?? 0,
        },
        requiredState: {
          gearTier: requiredGear,
          level: requiredLevel,
        },
      });
    }

    // Build swap suggestions when confidence is low
    const swapSuggestions: Array<{
      position: number;
      currentId: string;
      currentName: string;
      suggestedId: string;
      suggestedName: string;
      reason: string;
    }> = [];

    if (recommendation.confidence < 60 && recommendation.primaryTeam.length >= 2) {
      // Suggest swapping the weakest members with alternatives
      const primaryIds = new Set(
        recommendation.primaryTeam.map((m) => m.character.id),
      );
      const alternativeCandidates = compliant
        .filter((c) => !primaryIds.has(c.id))
        .sort((a, b) => (b.power ?? 0) - (a.power ?? 0))
        .slice(0, 2);

      const weakest = [...recommendation.primaryTeam]
        .sort((a, b) => (a.character.power ?? 0) - (b.character.power ?? 0))
        .slice(0, 2);

      for (let i = 0; i < Math.min(weakest.length, alternativeCandidates.length); i++) {
        const pos = recommendation.primaryTeam.indexOf(weakest[i]);
        swapSuggestions.push({
          position: pos + 1,
          currentId: weakest[i].character.id,
          currentName: weakest[i].character.info?.name ?? weakest[i].character.id,
          suggestedId: alternativeCandidates[i].id,
          suggestedName:
            alternativeCandidates[i].info?.name ?? alternativeCandidates[i].id,
          reason: `Higher power (${alternativeCandidates[i].power ?? 0} vs ${weakest[i].character.power ?? 0})`,
        });
      }
    }

    // Gear origin diversity check
    // Derive gear origin from character traits (Bio, Tech, Skill, Mystic, Mutant)
    const gearOrigins = ["Bio", "Tech", "Skill", "Mystic", "Mutant"];
    const originCounts = new Map<string, string[]>();

    for (const member of recommendation.primaryTeam) {
      const charTraits: string[] = [];
      if (member.character.info?.traits) {
        for (const t of member.character.info.traits) {
          charTraits.push(typeof t === "string" ? t : t.id);
        }
      }
      const origin = gearOrigins.find((o) => charTraits.includes(o));
      if (origin) {
        const names = originCounts.get(origin) ?? [];
        names.push(member.character.info?.name ?? member.character.id);
        originCounts.set(origin, names);
      }
    }

    const gearOriginWarnings: string[] = [];
    for (const [origin, names] of originCounts) {
      if (names.length >= 3) {
        gearOriginWarnings.push(
          `Heavy ${origin} gear competition — ${names.join(", ")} all use ${origin} gear. Consider alternatives.`,
        );
      }
    }

    // Build response
    return NextResponse.json({
      primaryTeam: recommendation.primaryTeam.map((m) => ({
        id: m.character.id,
        name: m.character.info?.name ?? m.character.id,
        power: m.character.power ?? 0,
        gearTier: m.character.gearTier ?? 0,
        reasoning: m.reasoning,
      })),
      confidence: recommendation.confidence,
      alternatives: recommendation.alternatives.map((team) =>
        team.map((m) => ({
          id: m.character.id,
          name: m.character.info?.name ?? m.character.id,
          power: m.character.power ?? 0,
          gearTier: m.character.gearTier ?? 0,
          reasoning: m.reasoning,
        })),
      ),
      swapSuggestions,
      futureBuildSuggestions,
      gearOriginWarnings,
      maxCharacters,
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
      if (!freshToken) {
        return NextResponse.json(
          { error: "Session expired. Please log in again.", code: "TOKEN_EXPIRED", retryable: false },
          { status: 401 },
        );
      }
    }

    if (message.includes("552") || message.includes("553")) {
      return NextResponse.json(
        { error: "Game servers are in maintenance.", code: "MAINTENANCE", retryable: true },
        { status: 503 },
      );
    }

    console.error("DD recommendation failed:", err);
    return NextResponse.json(
      { error: "Failed to generate recommendation", code: "RECOMMENDATION_ERROR", retryable: true },
      { status: 502 },
    );
  }
}
