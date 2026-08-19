import { NextResponse } from "next/server";
import { getValidAccessTokenWithRefresh as getValidAccessToken } from "@/lib/auth";
import { msfApiFetch } from "@/lib/msf-api";
import { getCached, setCache } from "@/lib/planner-cache";
import type {
  PerformanceContext,
  TeamPerformanceEvidence,
} from "@/lib/team-analysis";

export const dynamic = "force-dynamic";

const CACHE_KEY = "team-builder:meta:v2";

const GAME_MODES = ["roster", "blitz", "tower", "raids", "arena", "war", "crucible"] as const;
type GameMode = (typeof GAME_MODES)[number];

interface RawTeamOrder {
  squad?: string[];
  total?: number;
}

interface TeamOrderResponse {
  data?: Record<string, RawTeamOrder[]>;
}

interface TeamOrderModeResponse {
  data?: RawTeamOrder[];
  meta?: { perTotal?: number };
}

interface RawPerformanceEntry {
  squad?: string[];
  total?: number;
  wins?: number;
  defends?: number;
  defeats?: number;
}

interface PerformanceResponse {
  data?: RawPerformanceEntry[];
  meta?: { perTotal?: number };
}

interface NormalizedMetaMode {
  mode: string;
  teams: {
    squad: string[];
    total: number;
    performance?: TeamPerformanceEvidence[];
  }[];
}

interface CachedMetaResult {
  data: NormalizedMetaMode[];
  generatedAt: string;
  performanceSources: PerformanceContext[];
}

const PERFORMANCE_SOURCES: {
  mode: "war" | "crucible";
  context: PerformanceContext;
  path: string;
}[] = [
  {
    mode: "war",
    context: "war-offense",
    path: "/game/v1/analysis/war/offense",
  },
  {
    mode: "war",
    context: "war-defense",
    path: "/game/v1/analysis/war/defense",
  },
  {
    mode: "crucible",
    context: "crucible-defense",
    path: "/game/v1/analysis/crucible/defense",
  },
];

function squadKey(squad: string[]) {
  return [...squad].sort().join(",");
}

function normalizeTeams(teams: RawTeamOrder[] | undefined) {
  return Array.isArray(teams)
    ? teams
        .filter(
          (team): team is Required<RawTeamOrder> =>
            Array.isArray(team.squad) &&
            team.squad.length === 5 &&
            new Set(team.squad).size === 5 &&
            typeof team.total === "number" &&
            Number.isFinite(team.total),
        )
        .map((team) => ({ squad: team.squad, total: team.total }))
    : [];
}

async function fetchModePages(mode: GameMode, token: string) {
  const perPage = 200;
  const firstPage = await msfApiFetch<TeamOrderModeResponse>({
    path: `/game/v1/analysis/teamOrder/${mode}?page=1&perPage=${perPage}`,
    accessToken: token,
  });
  const teams = [...(firstPage.data ?? [])];
  const total = firstPage.meta?.perTotal ?? teams.length;

  for (let page = 2; page <= Math.ceil(total / perPage); page += 1) {
    const response = await msfApiFetch<TeamOrderModeResponse>({
      path: `/game/v1/analysis/teamOrder/${mode}?page=${page}&perPage=${perPage}`,
      accessToken: token,
    });
    teams.push(...(response.data ?? []));
  }

  return normalizeTeams(teams);
}

function normalizePerformance(
  entry: RawPerformanceEntry,
  context: PerformanceContext,
): TeamPerformanceEvidence | null {
  const sampleSize =
    context === "crucible-defense" ? entry.defends : entry.total;
  const successes =
    context === "crucible-defense"
      ? typeof entry.defends === "number" && typeof entry.defeats === "number"
        ? entry.defends - entry.defeats
        : undefined
      : entry.wins;

  if (
    !Array.isArray(entry.squad) ||
    entry.squad.length !== 5 ||
    new Set(entry.squad).size !== 5 ||
    typeof sampleSize !== "number" ||
    typeof successes !== "number" ||
    !Number.isFinite(sampleSize) ||
    !Number.isFinite(successes) ||
    sampleSize <= 0
  ) {
    return null;
  }

  const boundedSuccesses = Math.min(sampleSize, Math.max(0, successes));
  return {
    context,
    sampleSize,
    successes: boundedSuccesses,
    rate: boundedSuccesses / sampleSize,
  };
}

async function fetchPerformancePages(
  path: string,
  context: PerformanceContext,
  token: string,
) {
  const perPage = 100;
  const firstPage = await msfApiFetch<PerformanceResponse>({
    path: `${path}?page=1&perPage=${perPage}`,
    accessToken: token,
  });
  const entries = [...(firstPage.data ?? [])];
  const total = firstPage.meta?.perTotal ?? entries.length;

  for (let page = 2; page <= Math.ceil(total / perPage); page += 1) {
    const response = await msfApiFetch<PerformanceResponse>({
      path: `${path}?page=${page}&perPage=${perPage}`,
      accessToken: token,
    });
    entries.push(...(response.data ?? []));
  }

  const result = new Map<string, TeamPerformanceEvidence>();
  for (const entry of entries) {
    const evidence = normalizePerformance(entry, context);
    if (!evidence || !entry.squad) continue;
    const key = squadKey(entry.squad);
    const existing = result.get(key);
    if (!existing || evidence.sampleSize > existing.sampleSize) {
      result.set(key, evidence);
    }
  }
  return result;
}

export async function GET() {
  const token = await getValidAccessToken();

  if (!token) {
    return NextResponse.json(
      { error: "Unauthorized", code: "UNAUTHORIZED", retryable: false },
      { status: 401 }
    );
  }

  // Check cache first
  const cached = getCached<CachedMetaResult>(CACHE_KEY);
  if (cached) {
    return NextResponse.json(cached);
  }

  try {
    let data: NormalizedMetaMode[];
    try {
      const raw = await msfApiFetch<TeamOrderResponse>({
        path: "/game/v1/analysis/teamOrder",
        accessToken: token,
      });

      if (!raw.data || typeof raw.data !== "object") {
        throw new Error("MSF team order response was invalid");
      }
      data = GAME_MODES.map((mode) => ({
        mode,
        teams: normalizeTeams(raw.data?.[mode]),
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!/\b472\b|RESPONSE_TOO_LARGE/i.test(message)) throw error;

      // The combined endpoint grows with the game and can exceed the MSF API's
      // response-size ceiling. Its per-mode endpoints are the documented fallback.
      data = [];
      for (const mode of GAME_MODES) {
        data.push({ mode, teams: await fetchModePages(mode, token) });
      }
    }

    const evidenceByMode = new Map<string, Map<string, TeamPerformanceEvidence[]>>();
    const performanceSources: PerformanceContext[] = [];
    for (const source of PERFORMANCE_SOURCES) {
      try {
        const entries = await fetchPerformancePages(
          source.path,
          source.context,
          token,
        );
        performanceSources.push(source.context);
        const modeEvidence = evidenceByMode.get(source.mode) ?? new Map();
        for (const [key, evidence] of entries) {
          modeEvidence.set(key, [...(modeEvidence.get(key) ?? []), evidence]);
        }
        evidenceByMode.set(source.mode, modeEvidence);
      } catch (error) {
        console.warn(
          `MSF ${source.context} recommendation data is unavailable:`,
          error,
        );
      }
    }

    data = data.map((modeEntry) => ({
      ...modeEntry,
      teams: modeEntry.teams.map((team) => {
        const performance = evidenceByMode
          .get(modeEntry.mode)
          ?.get(squadKey(team.squad));
        return performance?.length ? { ...team, performance } : team;
      }),
    }));

    const result: CachedMetaResult = {
      data,
      generatedAt: new Date().toISOString(),
      performanceSources,
    };
    setCache(CACHE_KEY, result);
    return NextResponse.json(result);
  } catch (err) {
    console.error("MSF team-builder meta fetch failed:", err);
    return NextResponse.json(
      {
        error: "Failed to load meta team data",
        code: "MSF_API_ERROR",
        retryable: true,
      },
      { status: 502 }
    );
  }
}
