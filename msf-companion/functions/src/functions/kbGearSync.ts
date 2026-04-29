/**
 * Timer-triggered Azure Function: Gear Upgrade Requirements KB Sync
 */

import { app, InvocationContext, Timer } from "@azure/functions";
import { generateGearDoc, GearItem, KBDocument } from "../lib/kbGameData.js";

const SEARCH_ENDPOINT = process.env.AZURE_AI_SEARCH_ENDPOINT || "";
const SEARCH_KEY = process.env.AZURE_AI_SEARCH_KEY || "";
const MSF_API_KEY = process.env.MSF_API_KEY || "";
const MSF_API_BASE = "https://api.marvelstrikeforce.com";

export interface GearSyncDeps {
  fetchGearData: () => Promise<Array<{
    tier: number;
    origin: string;
    items: GearItem[];
  }>>;
  uploadDocuments: (docs: KBDocument[]) => Promise<{ succeeded: number; failed: number }>;
}

export async function syncGear(
  deps: GearSyncDeps,
  context: InvocationContext
): Promise<{ tiers: number; uploaded: number }> {
  const gearEntries = await deps.fetchGearData();
  context.log(`Fetched gear data for ${gearEntries.length} tier/origin combinations`);

  const docs: KBDocument[] = [];
  for (const entry of gearEntries) {
    docs.push(generateGearDoc(entry.origin, entry.tier - 1, entry.tier, entry.items));
  }

  const result = await deps.uploadDocuments(docs);
  context.log(`Gear sync complete: ${result.succeeded} uploaded`);

  return { tiers: gearEntries.length, uploaded: result.succeeded };
}

async function fetchGearDataFromAPI(): Promise<Array<{ tier: number; origin: string; items: GearItem[] }>> {
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

  // Only G16-G20
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

app.timer("kbGearSync", {
  schedule: "0 50 5 * * *", // 05:50 UTC daily
  handler: async (_timer: Timer, context: InvocationContext) => {
    context.log("Starting gear requirements KB sync");
    if (!SEARCH_ENDPOINT || !SEARCH_KEY) {
      context.error("Azure AI Search not configured — skipping gear sync");
      return;
    }
    const deps: GearSyncDeps = {
      fetchGearData: fetchGearDataFromAPI,
      uploadDocuments: uploadToSearch,
    };
    await syncGear(deps, context);
  },
});
