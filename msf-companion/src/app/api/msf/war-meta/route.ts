import { NextRequest, NextResponse } from "next/server";
import { getValidAccessTokenWithRefresh as getValidAccessToken } from "@/lib/auth";
import { msfApiFetch } from "@/lib/msf-api";
import { getCached, setCache } from "@/lib/planner-cache";

export const dynamic = "force-dynamic";

/* ---------- MSF API response shapes ---------- */

interface WarAnalysisEntry {
  squad: string[];
  total?: number;
  wins?: number;
  defends?: number;
  defeats?: number;
}

interface WarAnalysisResponse {
  data?: WarAnalysisEntry[];
}

interface CharacterInfo {
  id: string;
  name?: string;
  portrait?: string;
}

interface CharactersResponse {
  data?: CharacterInfo[];
}

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
    iso8?: { classId?: number | string } | null;
  };
}

/* ---------- Output types ---------- */

interface RosterComparison {
  characterId: string;
  characterName: string;
  portrait: string;
  owned: boolean;
  gearTier: number;
  yellowStars: number;
  redStars: number;
  iso8Class: string;
  status: "built" | "needs-work" | "missing";
}

interface MetaTeam {
  rank: number;
  squad: string[];
  squadNames: string[];
  totalBattles: number;
  wins: number;
  winRate: number;
  rosterComparison: RosterComparison[];
}

/* ---------- Helpers ---------- */

const VALID_MODES = ["offense", "defense", "crucible"] as const;
type Mode = (typeof VALID_MODES)[number];

function analysisPath(mode: Mode): string {
  switch (mode) {
    case "offense":
      return "/game/v1/analysis/war/offense";
    case "defense":
      return "/game/v1/analysis/war/defense";
    case "crucible":
      return "/game/v1/analysis/crucible/defense";
  }
}

function computeWinRate(entry: WarAnalysisEntry, mode: Mode): number {
  if (mode === "crucible") {
    const defends = entry.defends ?? 0;
    const defeats = entry.defeats ?? 0;
    if (defends === 0) return 0;
    return 1 - defeats / defends;
  }
  const total = entry.total ?? 0;
  const wins = entry.wins ?? 0;
  if (total === 0) return 0;
  return wins / total;
}

function totalBattles(entry: WarAnalysisEntry, mode: Mode): number {
  if (mode === "crucible") return entry.defends ?? 0;
  return entry.total ?? 0;
}

function winsCount(entry: WarAnalysisEntry, mode: Mode): number {
  if (mode === "crucible") {
    const defends = entry.defends ?? 0;
    const defeats = entry.defeats ?? 0;
    return Math.max(0, defends - defeats);
  }
  return entry.wins ?? 0;
}

function determineStatus(
  gearTier: number,
  yellowStars: number,
  redStars: number,
  owned: boolean
): "built" | "needs-work" | "missing" {
  if (!owned) return "missing";
  if (gearTier >= 16 && yellowStars >= 7 && redStars >= 5) return "built";
  return "needs-work";
}

/* ---------- Retry wrapper for transient MSF API errors ---------- */

async function msfApiFetchWithRetry<T>(opts: { path: string; accessToken: string }, retries = 2): Promise<T> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await msfApiFetch<T>(opts);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const isRetryable = /\b(502|503|504|429|472)\b/.test(msg);
      if (!isRetryable || attempt === retries) throw err;
      // Exponential backoff: 500ms, 1000ms
      await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
    }
  }
  throw new Error("Unreachable");
}

/* ---------- Analysis fetch with pagination (sequential) ---------- */

async function fetchAnalysis(mode: Mode, token: string): Promise<WarAnalysisEntry[]> {
  const PER_PAGE = 100;
  const basePath = analysisPath(mode);

  const page1 = await msfApiFetchWithRetry<WarAnalysisResponse & { meta?: { perTotal?: number } }>({
    path: `${basePath}?page=1&perPage=${PER_PAGE}`,
    accessToken: token,
  });

  const allEntries: WarAnalysisEntry[] = [...(page1.data ?? [])];
  const total = page1.meta?.perTotal ?? allEntries.length;

  if (total > PER_PAGE) {
    const pageCount = Math.ceil(total / PER_PAGE);
    for (let i = 2; i <= pageCount; i++) {
      const page = await msfApiFetchWithRetry<WarAnalysisResponse>({
        path: `${basePath}?page=${i}&perPage=${PER_PAGE}`,
        accessToken: token,
      });
      allEntries.push(...(page.data ?? []));
    }
  }

  return allEntries;
}

/* ---------- Characters fetch with pagination (sequential) ---------- */

async function fetchCharacters(token: string): Promise<CharacterInfo[]> {
  const PER_PAGE = 200;
  const page1 = await msfApiFetchWithRetry<CharactersResponse & { meta?: { perTotal?: number } }>({
    path: `/game/v1/characters?lang=en&page=1&perPage=${PER_PAGE}`,
    accessToken: token,
  });

  const allChars: CharacterInfo[] = [...(page1.data ?? [])];
  const total = page1.meta?.perTotal ?? allChars.length;

  if (total > PER_PAGE) {
    const pageCount = Math.ceil(total / PER_PAGE);
    for (let i = 2; i <= pageCount; i++) {
      const page = await msfApiFetchWithRetry<CharactersResponse>({
        path: `/game/v1/characters?lang=en&page=${i}&perPage=${PER_PAGE}`,
        accessToken: token,
      });
      allChars.push(...(page.data ?? []));
    }
  }

  return allChars;
}

/* ---------- Roster fetch with pagination (sequential) ---------- */

async function fetchFullRoster(token: string) {
  const PER_PAGE = 200;
  const page1 = await msfApiFetchWithRetry<{ data?: RawRosterChar[]; meta?: { perTotal?: number } }>({
    path: `/player/v1/roster?charInfo=full&traitFormat=id&page=1&perPage=${PER_PAGE}`,
    accessToken: token,
  });

  const allRaw: RawRosterChar[] = [...(page1.data ?? [])];
  const total = page1.meta?.perTotal ?? allRaw.length;

  if (total > PER_PAGE) {
    const pageCount = Math.ceil(total / PER_PAGE);
    for (let i = 2; i <= pageCount; i++) {
      const page = await msfApiFetchWithRetry<{ data?: RawRosterChar[] }>({
        path: `/player/v1/roster?charInfo=full&traitFormat=id&page=${i}&perPage=${PER_PAGE}`,
        accessToken: token,
      });
      allRaw.push(...(page.data ?? []));
    }
  }

  return allRaw;
}

/* ---------- GET handler ---------- */

export async function GET(request: NextRequest) {
  const token = await getValidAccessToken();

  if (!token) {
    return NextResponse.json(
      { error: "Unauthorized", code: "UNAUTHORIZED", retryable: false },
      { status: 401 }
    );
  }

  // Parse mode query parameter
  const { searchParams } = request.nextUrl;
  const modeParam = searchParams.get("mode") ?? "offense";
  const mode: Mode = (VALID_MODES as readonly string[]).includes(modeParam)
    ? (modeParam as Mode)
    : "offense";

  const cacheKey = `war-meta:${mode}`;

  // Check cache
  const cached = getCached<{ teams: MetaTeam[] }>(cacheKey);
  if (cached) {
    return NextResponse.json(cached);
  }

  try {
    // Fetch data sequentially to avoid overwhelming MSF API rate limits
    const analysisEntries = await fetchAnalysis(mode, token);
    const charsData = await fetchCharacters(token);
    const rosterRaw = await fetchFullRoster(token);

    // Build character lookup: id → { name, portrait }
    const charMap = new Map<string, { name: string; portrait: string }>();
    for (const c of charsData) {
      charMap.set(c.id, {
        name: c.name ?? c.id,
        portrait: c.portrait ?? "",
      });
    }

    // Build roster lookup: id → roster char
    const rosterMap = new Map<string, RawRosterChar>();
    for (const r of rosterRaw) {
      rosterMap.set(r.id, r);
    }

    // Process analysis entries
    const entries = analysisEntries;
    const teamsUnsorted: Omit<MetaTeam, "rank">[] = entries
      .filter((e) => Array.isArray(e.squad) && e.squad.length > 0)
      .map((entry) => {
        const squad = entry.squad;
        const squadNames = squad.map((id) => charMap.get(id)?.name ?? id);
        const winRate = computeWinRate(entry, mode);

        const rosterComparison: RosterComparison[] = squad.map((charId) => {
          const charInfo = charMap.get(charId);
          const rosterChar = rosterMap.get(charId);
          const owned = !!rosterChar;
          const gearTier = rosterChar?.gearTier ?? 0;
          const yellowStars = rosterChar?.activeYellow ?? 0;
          const redStars = rosterChar?.activeRed ?? 0;
          const iso8Class = rosterChar?.info?.iso8?.classId != null
            ? String(rosterChar.info.iso8.classId)
            : "";

          return {
            characterId: charId,
            characterName: charInfo?.name ?? charId,
            portrait: charInfo?.portrait ?? rosterChar?.info?.portrait ?? "",
            owned,
            gearTier,
            yellowStars,
            redStars,
            iso8Class,
            status: determineStatus(gearTier, yellowStars, redStars, owned),
          };
        });

        return {
          squad,
          squadNames,
          totalBattles: totalBattles(entry, mode),
          wins: winsCount(entry, mode),
          winRate,
          rosterComparison,
        };
      });

    // Sort by winRate descending, assign rank
    teamsUnsorted.sort((a, b) => b.winRate - a.winRate);
    const teams: MetaTeam[] = teamsUnsorted.map((t, i) => ({
      ...t,
      rank: i + 1,
    }));

    const result = { teams };
    setCache(cacheKey, result);
    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    console.error("War meta fetch failed:", msg, stack);
    return NextResponse.json(
      {
        error: "Failed to load war meta data",
        detail: msg,
        code: "MSF_API_ERROR",
        retryable: true,
      },
      { status: 502 }
    );
  }
}
