/**
 * Timer-triggered Azure Function: Dark Dimension Node Requirements KB Sync
 */

import { app, InvocationContext, Timer } from "@azure/functions";
import { generateDDNodeDoc, DDData, NodeData, KBDocument } from "../lib/kbGameData.js";

const SEARCH_ENDPOINT = process.env.AZURE_AI_SEARCH_ENDPOINT || "";
const SEARCH_KEY = process.env.AZURE_AI_SEARCH_KEY || "";
const MSF_API_KEY = process.env.MSF_API_KEY || "";
const MSF_API_BASE = "https://api.marvelstrikeforce.com";

export interface DDSyncDeps {
  fetchDDData: () => Promise<Array<{ dd: DDData; nodes: NodeData[] }>>;
  uploadDocuments: (docs: KBDocument[]) => Promise<{ succeeded: number; failed: number }>;
}

export async function syncDDNodes(
  deps: DDSyncDeps,
  context: InvocationContext
): Promise<{ dds: number; nodes: number; skipped: number; uploaded: number }> {
  const ddList = await deps.fetchDDData();
  context.log(`Fetched ${ddList.length} Dark Dimensions`);

  const docs: KBDocument[] = [];
  let skipped = 0;

  for (const { dd, nodes } of ddList) {
    for (const node of nodes) {
      try {
        if (!node.id || node.enemies.length === 0) {
          skipped++;
          continue;
        }
        docs.push(generateDDNodeDoc(dd, node));
      } catch {
        skipped++;
      }
    }
  }

  const result = await deps.uploadDocuments(docs);
  context.log(`DD sync complete: ${result.succeeded} uploaded, ${skipped} skipped`);

  return {
    dds: ddList.length,
    nodes: docs.length,
    skipped,
    uploaded: result.succeeded,
  };
}

async function fetchDDDataFromAPI(): Promise<Array<{ dd: DDData; nodes: NodeData[] }>> {
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

app.timer("kbDDSync", {
  schedule: "0 30 5 * * *", // 05:30 UTC daily
  handler: async (_timer: Timer, context: InvocationContext) => {
    context.log("Starting Dark Dimension KB sync");
    if (!SEARCH_ENDPOINT || !SEARCH_KEY) {
      context.error("Azure AI Search not configured — skipping DD sync");
      return;
    }
    const deps: DDSyncDeps = {
      fetchDDData: fetchDDDataFromAPI,
      uploadDocuments: uploadToSearch,
    };
    await syncDDNodes(deps, context);
  },
});
