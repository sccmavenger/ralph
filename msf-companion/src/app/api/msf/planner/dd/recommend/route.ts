import { NextResponse } from "next/server";
import { getValidAccessTokenWithRefresh, refreshAccessToken } from "@/lib/auth";
import { msfApiFetch } from "@/lib/msf-api";
import {
  fetchNode,
  DDServiceError,
  type Iso8State,
  type NodeRequirements,
} from "@/lib/dd-service";
import {
  filterEligible,
  getActiveIso8Level,
  getRequirementTarget,
  type RosterCharacter,
} from "@/lib/dd-eligibility";
import {
  generateRecommendation,
  RECOMMENDATION_MODES,
  type RecommendationMode,
} from "@/lib/dd-recommendation";
import { fetchCrossModeEvidence } from "@/lib/dd-mode-evidence";

export const dynamic = "force-dynamic";

interface RawRosterChar {
  id: string;
  level?: number;
  activeYellow?: number;
  activeRed?: number;
  gearTier?: number;
  power?: number;
  iso8?: Iso8State;
  info?: {
    id?: string;
    name?: string;
    portrait?: string;
    traits?: (string | { id: string })[];
    invisibleTraits?: (string | { id: string })[];
  };
}

function isRecommendationMode(value: unknown): value is RecommendationMode {
  return RECOMMENDATION_MODES.includes(value as RecommendationMode);
}

function investmentGap(
  char: RosterCharacter,
  requirements: NodeRequirements,
): number {
  const target = getRequirementTarget(char, requirements);
  if (!target) return Number.MAX_SAFE_INTEGER;

  let gap = 0;
  gap += Math.max(0, (target.gearTier ?? 0) - (char.gearTier ?? 0)) * 100;
  gap += Math.max(0, (target.level ?? 0) - (char.level ?? 0));
  gap +=
    Math.max(0, (target.activeYellow ?? 0) - (char.activeYellow ?? 0)) * 20;
  gap += Math.max(0, (target.activeRed ?? 0) - (char.activeRed ?? 0)) * 25;
  if (
    target.iso8Class &&
    char.iso8?.active?.toLowerCase() !== target.iso8Class.toLowerCase()
  ) {
    gap += 150;
  }
  gap +=
    Math.max(0, (target.iso8ClassLevel ?? 0) - getActiveIso8Level(char.iso8)) *
    75;
  return gap;
}

export async function POST(request: Request) {
  let token = await getValidAccessTokenWithRefresh();

  if (!token) {
    return NextResponse.json(
      { error: "Unauthorized", code: "UNAUTHORIZED", retryable: false },
      { status: 401 },
    );
  }

  let body: { ddId?: string; roomId?: string; mode?: unknown };
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
      {
        error: "ddId and roomId are required",
        code: "BAD_REQUEST",
        retryable: false,
      },
      { status: 400 },
    );
  }

  if (body.mode != null && !isRecommendationMode(body.mode)) {
    return NextResponse.json(
      {
        error: "Unknown recommendation mode",
        code: "BAD_REQUEST",
        retryable: false,
      },
      { status: 400 },
    );
  }
  const mode: RecommendationMode = isRecommendationMode(body.mode)
    ? body.mode
    : "fastest-clear";

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const node = await fetchNode(ddId, roomId, token);
      const requirements = node.requirements ?? {};

      if (requirements.missionCharacters) {
        return NextResponse.json({
          primaryTeam: [],
          alternatives: [],
          swapSuggestions: [],
          futureBuildSuggestions: [],
          gearOriginWarnings: [],
          maxCharacters: requirements.maxCharacters ?? 5,
          mode,
          missionCharacters: true,
          message:
            "This node uses a fixed mission-provided team, so no roster recommendation is needed.",
        });
      }

      // Large roster pages can exceed the upstream response-size limit. Fetch
      // small pages sequentially to avoid both 472 responses and burst failures.
      const PER_PAGE = 25;
      const rosterPage1 = await msfApiFetch<{
        data?: RawRosterChar[];
        meta?: { perTotal?: number };
      }>({
        path: `/player/v1/roster?charInfo=full&page=1&perPage=${PER_PAGE}`,
        accessToken: token,
      });

      // Gather all roster characters, fetching additional pages if needed
      const allRawChars: RawRosterChar[] = [...(rosterPage1.data ?? [])];
      const total = rosterPage1.meta?.perTotal ?? allRawChars.length;

      if (total > PER_PAGE) {
        const pageCount = Math.ceil(total / PER_PAGE);
        for (let pageNumber = 2; pageNumber <= pageCount; pageNumber++) {
          const page = await msfApiFetch<{ data?: RawRosterChar[] }>({
            path: `/player/v1/roster?charInfo=full&page=${pageNumber}&perPage=${PER_PAGE}`,
            accessToken: token,
          });
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
      const { eligible, compliant, maxCharacters } = filterEligible(
        roster,
        requirements,
      );

      let crossModeEvidence:
        Awaited<ReturnType<typeof fetchCrossModeEvidence>> | undefined;
      if (mode === "cross-mode-value") {
        try {
          crossModeEvidence = await fetchCrossModeEvidence(token);
        } catch (error) {
          console.warn(
            "Cross-mode DD evidence is unavailable; using roster readiness fallback:",
            error,
          );
        }
      }

      // Run recommendation engine
      const characterFilters = requirements.anyCharacterFilters;
      const recommendation = generateRecommendation(
        compliant,
        node.combat,
        maxCharacters,
        characterFilters,
        requirements.specificCharacters,
        mode,
        crossModeEvidence?.byCharacter,
      );

      // Generate future build suggestions from eligible-but-not-compliant
      const futureBuildSuggestions: Array<{
        id: string;
        name: string;
        reason: string;
        currentState: {
          gearTier: number;
          level: number;
          activeYellow: number;
          activeRed: number;
          iso8Class: string | null;
          iso8ClassLevel: number;
        };
        requiredState: {
          gearTier: number | null;
          level: number | null;
          activeYellow: number | null;
          activeRed: number | null;
          iso8Class: string | null;
          iso8ClassLevel: number | null;
        };
      }> = [];

      const compliantIds = new Set(compliant.map((c) => c.id));
      const eligibleNotCompliant = eligible.filter(
        (c) => !compliantIds.has(c.id),
      );
      const requiredIds = new Set(requirements.specificCharacters ?? []);
      const rosterById = new Map(roster.map((char) => [char.id, char]));
      const requiredFuture = [...requiredIds]
        .filter((id) => !compliantIds.has(id))
        .map(
          (id): RosterCharacter =>
            rosterById.get(id) ?? {
              id,
              gearTier: 0,
              level: 0,
              activeYellow: 0,
              activeRed: 0,
            },
        );
      const optionalFuture = eligibleNotCompliant
        .filter((char) => !requiredIds.has(char.id))
        .sort((a, b) =>
          mode === "lowest-investment"
            ? investmentGap(a, requirements) - investmentGap(b, requirements)
            : (b.power ?? 0) - (a.power ?? 0),
        )
        .slice(0, 2);
      const sortedFuture = [...requiredFuture, ...optionalFuture];

      for (const char of sortedFuture) {
        const target =
          getRequirementTarget(char, requirements) ??
          characterFilters?.find((filter) =>
            filter.anyCharacters?.includes(char.id),
          ) ??
          characterFilters?.find(
            (filter) =>
              !filter.allTraits?.length &&
              !filter.anyTraits?.length &&
              !filter.exceptTraits?.length &&
              !filter.anyCharacters?.length,
          );
        const needs: string[] = [];
        if (
          target?.gearTier != null &&
          (char.gearTier ?? 0) < target.gearTier
        ) {
          needs.push(`GT${target.gearTier}`);
        }
        if (target?.level != null && (char.level ?? 0) < target.level) {
          needs.push(`level ${target.level}`);
        }
        if (
          target?.activeYellow != null &&
          (char.activeYellow ?? 0) < target.activeYellow
        ) {
          needs.push(`${target.activeYellow} yellow stars`);
        }
        if (
          target?.activeRed != null &&
          (char.activeRed ?? 0) < target.activeRed
        ) {
          needs.push(`${target.activeRed} red stars`);
        }
        if (
          target?.iso8Class &&
          char.iso8?.active?.toLowerCase() !== target.iso8Class.toLowerCase()
        ) {
          needs.push(`${target.iso8Class} ISO-8`);
        }
        if (
          target?.iso8ClassLevel != null &&
          getActiveIso8Level(char.iso8) < target.iso8ClassLevel
        ) {
          needs.push(`ISO-8 class level ${target.iso8ClassLevel}`);
        }

        futureBuildSuggestions.push({
          id: char.id,
          name: char.info?.name ?? char.id,
          reason: requiredIds.has(char.id)
            ? `Required for this node${needs.length > 0 ? `; needs ${needs.join(", ")}` : ""}`
            : `Eligible build target${needs.length > 0 ? `; needs ${needs.join(", ")}` : ""}`,
          currentState: {
            gearTier: char.gearTier ?? 0,
            level: char.level ?? 0,
            activeYellow: char.activeYellow ?? 0,
            activeRed: char.activeRed ?? 0,
            iso8Class: char.iso8?.active ?? null,
            iso8ClassLevel: getActiveIso8Level(char.iso8),
          },
          requiredState: {
            gearTier: target?.gearTier ?? null,
            level: target?.level ?? null,
            activeYellow: target?.activeYellow ?? null,
            activeRed: target?.activeRed ?? null,
            iso8Class: target?.iso8Class ?? null,
            iso8ClassLevel: target?.iso8ClassLevel ?? null,
          },
        });
      }

      // Build swap suggestions when roster readiness is low
      const swapSuggestions: Array<{
        position: number;
        currentId: string;
        currentName: string;
        suggestedId: string;
        suggestedName: string;
        reason: string;
      }> = [];

      if (
        recommendation.rosterReadiness < 60 &&
        recommendation.primaryTeam.length >= 2
      ) {
        // Suggest swapping the weakest members with alternatives
        const primaryIds = new Set(
          recommendation.primaryTeam.map((m) => m.character.id),
        );
        const alternativeCandidates = compliant
          .filter((c) => !primaryIds.has(c.id))
          .sort((a, b) => (b.power ?? 0) - (a.power ?? 0))
          .slice(0, 2);

        const weakest = [...recommendation.primaryTeam]
          .filter((member) => !requiredIds.has(member.character.id))
          .sort((a, b) => (a.character.power ?? 0) - (b.character.power ?? 0))
          .slice(0, 2);

        for (
          let i = 0;
          i < Math.min(weakest.length, alternativeCandidates.length);
          i++
        ) {
          const pos = recommendation.primaryTeam.indexOf(weakest[i]);
          swapSuggestions.push({
            position: pos + 1,
            currentId: weakest[i].character.id,
            currentName:
              weakest[i].character.info?.name ?? weakest[i].character.id,
            suggestedId: alternativeCandidates[i].id,
            suggestedName:
              alternativeCandidates[i].info?.name ??
              alternativeCandidates[i].id,
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
          portrait: m.character.info?.portrait,
          power: m.character.power ?? 0,
          gearTier: m.character.gearTier ?? 0,
          reasoning: m.reasoning,
        })),
        rosterReadiness: recommendation.rosterReadiness,
        readinessBasis:
          "Eligible team size, available combat power, and role coverage. This is not an observed clear rate.",
        mode: recommendation.mode,
        modeEvidence: {
          available: recommendation.modeEvidenceAvailable,
          generatedAt: crossModeEvidence?.generatedAt ?? null,
          sourceModes: crossModeEvidence?.sourceModes ?? [],
          meaning:
            "Appearances measure current usage breadth and popularity, not wins or guaranteed Dark Dimension performance.",
        },
        alternatives: recommendation.alternatives.map((team) =>
          team.map((m) => ({
            id: m.character.id,
            name: m.character.info?.name ?? m.character.id,
            portrait: m.character.info?.portrait,
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
      if (err instanceof DDServiceError && err.status === 502) {
        return NextResponse.json(
          { error: err.message, code: "MSF_API_ERROR", retryable: true },
          { status: 502 },
        );
      }

      const message = err instanceof Error ? err.message : String(err);

      if (message.includes("401") || message.includes("403")) {
        const freshToken = attempt === 0 ? await refreshAccessToken() : null;
        if (freshToken) {
          token = freshToken;
          continue;
        }
        return NextResponse.json(
          {
            error: "Session expired. Please log in again.",
            code: "TOKEN_EXPIRED",
            retryable: false,
          },
          { status: 401 },
        );
      }

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

      console.error("DD recommendation failed:", err);
      return NextResponse.json(
        {
          error: "Failed to generate recommendation",
          code: "RECOMMENDATION_ERROR",
          retryable: true,
        },
        { status: 502 },
      );
    }
  }

  return NextResponse.json(
    {
      error: "Failed to generate recommendation",
      code: "RECOMMENDATION_ERROR",
      retryable: true,
    },
    { status: 502 },
  );
}
