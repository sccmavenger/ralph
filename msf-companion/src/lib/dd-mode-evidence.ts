import { msfApiFetch } from "@/lib/msf-api";
import { getCached, setCache } from "@/lib/planner-cache";
import type { CharacterModeEvidenceMap } from "@/lib/dd-recommendation";

const CACHE_KEY = "dd-mode-evidence:v1";
const CROSS_MODE_SOURCES = [
  "raids",
  "arena",
  "war",
  "crucible",
  "tower",
  "blitz",
] as const;

type CrossModeSource = (typeof CROSS_MODE_SOURCES)[number];

interface RawTeamOrder {
  squad?: string[];
  total?: number;
}

interface CombinedTeamOrderResponse {
  data?: Partial<Record<CrossModeSource, RawTeamOrder[]>>;
}

interface PagedTeamOrderResponse {
  data?: RawTeamOrder[];
  meta?: { perTotal?: number };
}

export interface CrossModeEvidenceResult {
  byCharacter: CharacterModeEvidenceMap;
  generatedAt: string;
  sourceModes: string[];
}

function validTeams(teams: RawTeamOrder[] | undefined): RawTeamOrder[] {
  return (teams ?? []).filter(
    (team) =>
      Array.isArray(team.squad) &&
      team.squad.length === 5 &&
      new Set(team.squad).size === 5 &&
      typeof team.total === "number" &&
      Number.isFinite(team.total) &&
      team.total >= 0,
  );
}

async function fetchModePages(
  mode: CrossModeSource,
  accessToken: string,
): Promise<RawTeamOrder[]> {
  const perPage = 200;
  const firstPage = await msfApiFetch<PagedTeamOrderResponse>({
    path: `/game/v1/analysis/teamOrder/${mode}?page=1&perPage=${perPage}`,
    accessToken,
  });
  const teams = [...(firstPage.data ?? [])];
  const total = firstPage.meta?.perTotal ?? teams.length;

  for (let page = 2; page <= Math.ceil(total / perPage); page += 1) {
    const response = await msfApiFetch<PagedTeamOrderResponse>({
      path: `/game/v1/analysis/teamOrder/${mode}?page=${page}&perPage=${perPage}`,
      accessToken,
    });
    teams.push(...(response.data ?? []));
  }

  return validTeams(teams);
}

export function buildCharacterModeEvidence(
  modeTeams: Partial<Record<CrossModeSource, RawTeamOrder[]>>,
): CharacterModeEvidenceMap {
  const working = new Map<
    string,
    { modes: Set<string>; totalAppearances: number }
  >();

  for (const mode of CROSS_MODE_SOURCES) {
    for (const team of validTeams(modeTeams[mode])) {
      for (const characterId of team.squad ?? []) {
        const current = working.get(characterId) ?? {
          modes: new Set<string>(),
          totalAppearances: 0,
        };
        current.modes.add(mode);
        current.totalAppearances += team.total ?? 0;
        working.set(characterId, current);
      }
    }
  }

  return Object.fromEntries(
    [...working.entries()].map(([characterId, evidence]) => [
      characterId,
      {
        modes: [...evidence.modes],
        totalAppearances: evidence.totalAppearances,
      },
    ]),
  );
}

/**
 * Fetch current usage breadth across supported modes. This is popularity
 * evidence only; consumers must not describe appearances as wins or clears.
 */
export async function fetchCrossModeEvidence(
  accessToken: string,
): Promise<CrossModeEvidenceResult> {
  const cached = getCached<CrossModeEvidenceResult>(CACHE_KEY);
  if (cached) return cached;

  const modeTeams: Partial<Record<CrossModeSource, RawTeamOrder[]>> = {};
  try {
    const combined = await msfApiFetch<CombinedTeamOrderResponse>({
      path: "/game/v1/analysis/teamOrder",
      accessToken,
    });
    if (!combined.data || typeof combined.data !== "object") {
      throw new Error("MSF team-order response was invalid");
    }
    for (const mode of CROSS_MODE_SOURCES) {
      modeTeams[mode] = validTeams(combined.data[mode]);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!/\b472\b|RESPONSE_TOO_LARGE/i.test(message)) throw error;
    for (const mode of CROSS_MODE_SOURCES) {
      modeTeams[mode] = await fetchModePages(mode, accessToken);
    }
  }

  const result: CrossModeEvidenceResult = {
    byCharacter: buildCharacterModeEvidence(modeTeams),
    generatedAt: new Date().toISOString(),
    sourceModes: [...CROSS_MODE_SOURCES],
  };
  setCache(CACHE_KEY, result);
  return result;
}
