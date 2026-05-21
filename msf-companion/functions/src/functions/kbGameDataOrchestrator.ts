/**
 * Timer-triggered Azure Function: Game Data KB Orchestrator
 * Runs all game data KB syncs in sequence daily at 05:00 UTC.
 */

import { app, InvocationContext, Timer } from "@azure/functions";
import { syncCharacterKits, CharacterSyncDeps } from "./kbCharacterSync.js";
import { syncMeta, MetaSyncDeps } from "./kbMetaSync.js";
import { syncDDNodes, DDSyncDeps } from "./kbDDSync.js";
import { syncISO8, ISO8SyncDeps } from "./kbISO8Sync.js";
import { syncGear, GearSyncDeps } from "./kbGearSync.js";
import type { KBDocument } from "../lib/kbGameData.js";

const SEARCH_ENDPOINT = process.env.AZURE_AI_SEARCH_ENDPOINT || "";
const SEARCH_KEY = process.env.AZURE_AI_SEARCH_KEY || "";
const MSF_API_KEY = process.env.MSF_API_KEY || "";
const MSF_API_BASE = "https://api.marvelstrikeforce.com";

export interface SyncResult {
  name: string;
  success: boolean;
  docsUploaded: number;
  error?: string;
}

export interface OrchestratorDeps {
  syncCharacters: () => Promise<{ uploaded: number }>;
  syncMeta: () => Promise<{ totalDocs: number }>;
  syncDD: () => Promise<{ uploaded: number }>;
  syncISO8: () => Promise<{ indexed: number }>;
  syncGear: () => Promise<{ uploaded: number }>;
}

export async function orchestrateGameDataSync(
  deps: OrchestratorDeps,
  context: InvocationContext
): Promise<{ results: SyncResult[]; totalDocs: number }> {
  const results: SyncResult[] = [];
  let totalDocs = 0;

  const syncs: Array<{ name: string; fn: () => Promise<number> }> = [
    { name: "characters", fn: async () => (await deps.syncCharacters()).uploaded },
    { name: "meta", fn: async () => (await deps.syncMeta()).totalDocs },
    { name: "dd", fn: async () => (await deps.syncDD()).uploaded },
    { name: "iso8", fn: async () => (await deps.syncISO8()).indexed },
    { name: "gear", fn: async () => (await deps.syncGear()).uploaded },
  ];

  for (const sync of syncs) {
    try {
      const docs = await sync.fn();
      results.push({ name: sync.name, success: true, docsUploaded: docs });
      totalDocs += docs;
      context.log(`✅ ${sync.name}: ${docs} documents uploaded`);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      results.push({ name: sync.name, success: false, docsUploaded: 0, error: errorMsg });
      context.warn(`❌ ${sync.name} failed: ${errorMsg}`);
    }
  }

  const succeeded = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;
  context.log(`Orchestrator complete: ${succeeded} succeeded, ${failed} failed, ${totalDocs} total documents`);

  return { results, totalDocs };
}

app.timer("kbGameDataOrchestrator", {
  schedule: "0 0 5 * * *", // 05:00 UTC daily
  handler: async (_timer: Timer, context: InvocationContext) => {
    context.log("Starting game data KB orchestrator");

    if (!SEARCH_ENDPOINT || !SEARCH_KEY) {
      context.error("Azure AI Search not configured (AZURE_AI_SEARCH_ENDPOINT or AZURE_AI_SEARCH_KEY missing) — exiting");
      return;
    }

    const uploadToSearch = async (docs: KBDocument[]): Promise<{ succeeded: number; failed: number }> => {
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
    };

    const fetchCharactersFromAPI = async () => {
      const characters: Array<{ id: string; name: string; traits: string[]; abilities: Array<{ name: string; description: string }>; teams: string[] }> = [];
      let page = 1;
      while (true) {
        const response = await fetch(
          `${MSF_API_BASE}/game/v1/characters?lang=en&page=${page}&perPage=200`,
          { headers: { "x-api-key": MSF_API_KEY, "Accept": "application/json" } }
        );
        if (!response.ok) break;
        const data = (await response.json()) as { data?: Array<{ id: string; name?: string; traits?: string[]; abilities?: Array<{ name: string; description: string }>; teams?: string[] }>; meta?: { pagination?: { totalPages?: number } } };
        for (const c of data.data || []) {
          characters.push({
            id: c.id,
            name: c.name || c.id,
            traits: c.traits || [],
            abilities: (c.abilities || []).map((a) => ({ name: a.name || "", description: a.description || "" })),
            teams: c.teams || [],
          });
        }
        const totalPages = data.meta?.pagination?.totalPages || 1;
        if (page >= totalPages) break;
        page++;
      }
      return characters;
    };

    const fetchCharacterNamesFromAPI = async () => {
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
    };

    const fetchMetaTeamsFromAPI = async (_mode: string, endpoint: string) => {
      const response = await fetch(
        `${MSF_API_BASE}${endpoint}?page=1&perPage=50`,
        { headers: { "x-api-key": MSF_API_KEY, "Accept": "application/json" } }
      );
      if (!response.ok) return [];
      const data = (await response.json()) as { data?: Array<{ characters?: string[]; total?: number; wins?: number; defends?: number; defeats?: number }> };
      return (data.data || []).map((t, i) => ({
        characters: t.characters || [],
        total: t.total || t.defends || 0,
        wins: t.wins || t.defeats || 0,
        rank: i + 1,
      }));
    };

    const fetchDDDataFromAPI = async () => {
      const response = await fetch(
        `${MSF_API_BASE}/game/v1/dds?raidInfo=full&raidMap=full&lang=en`,
        { headers: { "x-api-key": MSF_API_KEY, "Accept": "application/json" } }
      );
      if (!response.ok) return [];
      const data = (await response.json()) as {
        data?: Array<{
          id: string;
          name?: string;
          nodes?: Array<{
            id: string;
            nodeNumber?: number;
            section?: string;
            requiredTraits?: string[];
            enemies?: Array<{ name?: string; power?: number }>;
          }>;
        }>;
      };
      return (data.data || []).map((dd) => ({
        dd: { id: dd.id, name: dd.name || dd.id },
        nodes: (dd.nodes || []).map((n) => ({
          id: n.id,
          nodeNumber: n.nodeNumber || 0,
          section: n.section || "Unknown",
          requiredTraits: n.requiredTraits || [],
          enemies: (n.enemies || []).map((e) => ({ name: e.name || "Unknown", power: e.power })),
        })),
      }));
    };

    const fetchISO8DataFromAPI = async () => {
      const charResponse = await fetch(
        `${MSF_API_BASE}/game/v1/characters?lang=en&page=1&perPage=500`,
        { headers: { "x-api-key": MSF_API_KEY, "Accept": "application/json" } }
      );
      const charNames = new Map<string, string>();
      if (charResponse.ok) {
        const charData = (await charResponse.json()) as { data?: Array<{ id: string; name?: string }> };
        for (const c of charData.data || []) {
          if (c.name) charNames.set(c.id, c.name);
        }
      }

      const isoResponse = await fetch(
        `${MSF_API_BASE}/game/v1/iso8Abilities`,
        { headers: { "x-api-key": MSF_API_KEY, "Accept": "application/json" } }
      );
      if (!isoResponse.ok) return [];
      const isoData = (await isoResponse.json()) as {
        data?: Array<{ characterId: string; classes?: Array<{ name: string; percent: number }> }>;
      };
      return (isoData.data || []).map((entry) => {
        const sorted = (entry.classes || []).sort((a, b) => b.percent - a.percent);
        const top = sorted[0];
        return {
          characterId: entry.characterId,
          characterName: charNames.get(entry.characterId) || entry.characterId,
          isoData: {
            topClass: top?.name || "Unknown",
            topClassPercent: top?.percent || 0,
            runnerUps: sorted.slice(1, 3).map((c) => ({ className: c.name, percent: c.percent })),
          },
        };
      });
    };

    const fetchGearDataFromAPI = async () => {
      const response = await fetch(
        `${MSF_API_BASE}/game/v1/upgradeData?pieceInfo=full&pieceFlatCost=full&pieceDirectCost=full`,
        { headers: { "x-api-key": MSF_API_KEY, "Accept": "application/json" } }
      );
      if (!response.ok) return [];
      const data = (await response.json()) as {
        data?: Array<{
          tier?: number;
          origin?: string;
          pieces?: Array<{ name?: string; quantity?: number; farmable?: boolean }>;
        }>;
      };
      return (data.data || [])
        .filter((d) => (d.tier || 0) >= 16 && (d.tier || 0) <= 20)
        .map((d) => ({
          tier: d.tier || 0,
          origin: d.origin || "General",
          items: (d.pieces || []).map((p) => ({
            name: p.name || "Unknown",
            quantity: p.quantity || 1,
            farmable: p.farmable ?? false,
          })),
        }));
    };

    const deps: OrchestratorDeps = {
      syncCharacters: async () => {
        const charDeps: CharacterSyncDeps = {
          fetchCharacters: fetchCharactersFromAPI,
          uploadDocuments: uploadToSearch,
        };
        const result = await syncCharacterKits(charDeps, context);
        return { uploaded: result.uploaded };
      },
      syncMeta: async () => {
        const metaDeps: MetaSyncDeps = {
          fetchCharacterNames: fetchCharacterNamesFromAPI,
          fetchMetaTeams: fetchMetaTeamsFromAPI,
          uploadDocuments: uploadToSearch,
        };
        const result = await syncMeta(metaDeps, context);
        return { totalDocs: result.totalDocs };
      },
      syncDD: async () => {
        const ddDeps: DDSyncDeps = {
          fetchDDData: fetchDDDataFromAPI,
          uploadDocuments: uploadToSearch,
        };
        const result = await syncDDNodes(ddDeps, context);
        return { uploaded: result.uploaded };
      },
      syncISO8: async () => {
        const isoDeps: ISO8SyncDeps = {
          fetchISO8Data: fetchISO8DataFromAPI,
          uploadDocuments: uploadToSearch,
        };
        const result = await syncISO8(isoDeps, context);
        return { indexed: result.indexed };
      },
      syncGear: async () => {
        const gearDeps: GearSyncDeps = {
          fetchGearData: fetchGearDataFromAPI,
          uploadDocuments: uploadToSearch,
        };
        const result = await syncGear(gearDeps, context);
        return { uploaded: result.uploaded };
      },
    };

    await orchestrateGameDataSync(deps, context);
  },
});
