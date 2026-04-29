/**
 * Timer-triggered Azure Function: War & Crucible Meta KB Sync
 * Fetches war offense/defense and crucible meta data and indexes it.
 */

import { app, InvocationContext, Timer } from "@azure/functions";
import { generateTeamMetaDoc, TeamData, KBDocument } from "../lib/kbGameData.js";

const SEARCH_ENDPOINT = process.env.AZURE_AI_SEARCH_ENDPOINT || "";
const SEARCH_KEY = process.env.AZURE_AI_SEARCH_KEY || "";
const MSF_API_KEY = process.env.MSF_API_KEY || "";
const MSF_API_BASE = "https://api.marvelstrikeforce.com";

export interface MetaSyncDeps {
  fetchCharacterNames: () => Promise<Map<string, string>>;
  fetchMetaTeams: (mode: string, endpoint: string) => Promise<Array<{
    characters: string[];
    total: number;
    wins: number;
    rank: number;
  }>>;
  uploadDocuments: (docs: KBDocument[]) => Promise<{ succeeded: number; failed: number }>;
}

export async function syncMeta(
  deps: MetaSyncDeps,
  context: InvocationContext
): Promise<{ modes: number; totalDocs: number; errors: number }> {
  const charNames = await deps.fetchCharacterNames();
  context.log(`Loaded ${charNames.size} character name mappings`);

  const modes = [
    { name: "war-offense", endpoint: "/game/v1/analysis/war/offense" },
    { name: "war-defense", endpoint: "/game/v1/analysis/war/defense" },
    { name: "crucible-defense", endpoint: "/game/v1/analysis/crucible/defense" },
  ];

  const allDocs: KBDocument[] = [];
  let errors = 0;

  for (const mode of modes) {
    try {
      const teams = await deps.fetchMetaTeams(mode.name, mode.endpoint);
      const top50 = teams.slice(0, 50);

      for (let i = 0; i < top50.length; i++) {
        const team = top50[i];
        const resolvedNames = team.characters.map((id) => charNames.get(id) || id);
        const winRate = team.total > 0 ? team.wins / team.total : 0;

        const teamData: TeamData = {
          characters: resolvedNames,
          totalBattles: team.total,
          wins: team.wins,
          winRate,
          rank: i + 1,
        };

        allDocs.push(generateTeamMetaDoc(teamData, mode.name));
      }

      context.log(`${mode.name}: processed ${top50.length} teams`);
    } catch (err) {
      context.warn(`Error fetching ${mode.name}: ${err}`);
      errors++;
    }
  }

  const result = await deps.uploadDocuments(allDocs);
  context.log(`Meta sync complete: ${result.succeeded} uploaded across ${modes.length} modes`);

  return { modes: modes.length, totalDocs: result.succeeded, errors };
}

async function fetchCharacterNamesFromAPI(): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  const response = await fetch(
    `${MSF_API_BASE}/game/v1/characters?lang=en&page=1&perPage=500`,
    { headers: { "x-api-key": MSF_API_KEY, "Accept": "application/json" } }
  );
  if (!response.ok) return names;
  const data = (await response.json()) as { data?: Array<{ id: string; name?: string }> };
  for (const c of data.data || []) {
    if (c.name) names.set(c.id, c.name);
  }
  return names;
}

async function fetchMetaTeamsFromAPI(_mode: string, endpoint: string): Promise<Array<{
  characters: string[];
  total: number;
  wins: number;
  rank: number;
}>> {
  const response = await fetch(
    `${MSF_API_BASE}${endpoint}?page=1&perPage=50`,
    { headers: { "x-api-key": MSF_API_KEY, "Accept": "application/json" } }
  );
  if (!response.ok) return [];
  const data = (await response.json()) as {
    data?: Array<{
      characters?: string[];
      total?: number;
      wins?: number;
      defends?: number;
      defeats?: number;
    }>;
  };
  return (data.data || []).map((t, i) => ({
    characters: t.characters || [],
    total: t.total || t.defends || 0,
    wins: t.wins || t.defeats || 0,
    rank: i + 1,
  }));
}

async function uploadToSearch(docs: KBDocument[]): Promise<{ succeeded: number; failed: number }> {
  if (docs.length === 0) return { succeeded: 0, failed: 0 };
  const batchSize = 100;
  let succeeded = 0;
  let failed = 0;
  for (let i = 0; i < docs.length; i += batchSize) {
    const batch = docs.slice(i, i + batchSize);
    const response = await fetch(
      `${SEARCH_ENDPOINT}/indexes/msf-knowledge/docs/index?api-version=2024-07-01`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "api-key": SEARCH_KEY },
        body: JSON.stringify({
          value: batch.map((doc) => ({ "@search.action": "mergeOrUpload", ...doc })),
        }),
      }
    );
    if (response.ok) succeeded += batch.length;
    else failed += batch.length;
  }
  return { succeeded, failed };
}

app.timer("kbMetaSync", {
  schedule: "0 20 5 * * *", // 05:20 UTC daily
  handler: async (_timer: Timer, context: InvocationContext) => {
    context.log("Starting war & crucible meta KB sync");
    if (!SEARCH_ENDPOINT || !SEARCH_KEY) {
      context.error("Azure AI Search not configured — skipping meta sync");
      return;
    }
    const deps: MetaSyncDeps = {
      fetchCharacterNames: fetchCharacterNamesFromAPI,
      fetchMetaTeams: fetchMetaTeamsFromAPI,
      uploadDocuments: uploadToSearch,
    };
    await syncMeta(deps, context);
  },
});
