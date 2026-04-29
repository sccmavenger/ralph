/**
 * Timer-triggered Azure Function: ISO-8 Recommendations KB Sync
 */

import { app, InvocationContext, Timer } from "@azure/functions";
import { generateISO8Doc, ISO8Data, KBDocument } from "../lib/kbGameData.js";

const SEARCH_ENDPOINT = process.env.AZURE_AI_SEARCH_ENDPOINT || "";
const SEARCH_KEY = process.env.AZURE_AI_SEARCH_KEY || "";
const MSF_API_KEY = process.env.MSF_API_KEY || "";
const MSF_API_BASE = "https://api.marvelstrikeforce.com";

export interface ISO8SyncDeps {
  fetchISO8Data: () => Promise<Array<{ characterId: string; characterName: string; isoData: ISO8Data }>>;
  uploadDocuments: (docs: KBDocument[]) => Promise<{ succeeded: number; failed: number }>;
}

export async function syncISO8(
  deps: ISO8SyncDeps,
  context: InvocationContext
): Promise<{ total: number; indexed: number; filtered: number }> {
  const isoEntries = await deps.fetchISO8Data();
  context.log(`Fetched ISO-8 data for ${isoEntries.length} characters`);

  const docs: KBDocument[] = [];
  let filtered = 0;

  for (const entry of isoEntries) {
    // Only index characters where top ISO class has > 50% confidence
    if (entry.isoData.topClassPercent <= 50) {
      filtered++;
      continue;
    }
    docs.push(generateISO8Doc(entry.characterName, entry.isoData));
  }

  const result = await deps.uploadDocuments(docs);
  context.log(`ISO-8 sync complete: ${result.succeeded} indexed, ${filtered} filtered (low confidence)`);

  return { total: isoEntries.length, indexed: result.succeeded, filtered };
}

async function fetchISO8DataFromAPI(): Promise<Array<{ characterId: string; characterName: string; isoData: ISO8Data }>> {
  // Fetch character names
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

  // Fetch ISO-8 data
  const response = await fetch(
    `${MSF_API_BASE}/game/v1/iso8Abilities`,
    { headers: { "x-api-key": MSF_API_KEY, "Accept": "application/json" } }
  );
  if (!response.ok) return [];

  const data = (await response.json()) as {
    data?: Array<{
      characterId: string;
      classes?: Array<{ name: string; percent: number }>;
    }>;
  };

  return (data.data || []).map((entry) => {
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

app.timer("kbISO8Sync", {
  schedule: "0 40 5 * * *", // 05:40 UTC daily
  handler: async (_timer: Timer, context: InvocationContext) => {
    context.log("Starting ISO-8 recommendations KB sync");
    if (!SEARCH_ENDPOINT || !SEARCH_KEY) {
      context.error("Azure AI Search not configured — skipping ISO-8 sync");
      return;
    }
    const deps: ISO8SyncDeps = {
      fetchISO8Data: fetchISO8DataFromAPI,
      uploadDocuments: uploadToSearch,
    };
    await syncISO8(deps, context);
  },
});
