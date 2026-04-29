/**
 * Timer-triggered Azure Function: KB Stale Document Sweep
 * Removes documents past their expected freshness lifecycle.
 */

import { app, InvocationContext, Timer } from "@azure/functions";

const SEARCH_ENDPOINT = process.env.AZURE_AI_SEARCH_ENDPOINT || "";
const SEARCH_KEY = process.env.AZURE_AI_SEARCH_KEY || "";

export interface StaleSweepDeps {
  queryStaleDocuments: (sourceType: string, olderThan: Date) => Promise<string[]>;
  deleteDocuments: (docIds: string[]) => Promise<number>;
}

interface StalenessRule {
  sourceType: string;
  maxAgeDays: number;
  additionalFilter?: string;
}

const STALENESS_RULES: StalenessRule[] = [
  { sourceType: "reddit-post", maxAgeDays: 30 },
  { sourceType: "official-blog", maxAgeDays: 90 },
  { sourceType: "ai-generated", maxAgeDays: 14 },
];

export async function sweepStaleDocuments(
  deps: StaleSweepDeps,
  context: InvocationContext
): Promise<{ totalRemoved: number; byType: Record<string, number> }> {
  const byType: Record<string, number> = {};
  let totalRemoved = 0;

  for (const rule of STALENESS_RULES) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - rule.maxAgeDays);

    try {
      const staleIds = await deps.queryStaleDocuments(rule.sourceType, cutoff);
      if (staleIds.length > 0) {
        const removed = await deps.deleteDocuments(staleIds);
        byType[rule.sourceType] = removed;
        totalRemoved += removed;
        context.log(`Removed ${removed} stale ${rule.sourceType} documents (older than ${rule.maxAgeDays} days)`);
      } else {
        byType[rule.sourceType] = 0;
      }
    } catch (err) {
      context.warn(`Error sweeping ${rule.sourceType}: ${err}`);
      byType[rule.sourceType] = 0;
    }
  }

  context.log(`Stale sweep complete: ${totalRemoved} documents removed`);
  return { totalRemoved, byType };
}

async function queryStaleDocsFromSearch(sourceType: string, olderThan: Date): Promise<string[]> {
  const filter = `sourceType eq '${sourceType}' and sourceDate lt ${olderThan.toISOString()}`;
  const ids: string[] = [];

  const response = await fetch(
    `${SEARCH_ENDPOINT}/indexes/msf-knowledge/docs/search?api-version=2024-07-01`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "api-key": SEARCH_KEY },
      body: JSON.stringify({ filter, select: "id", top: 1000 }),
    }
  );

  if (response.ok) {
    const data = (await response.json()) as { value?: Array<{ id: string }> };
    for (const doc of data.value || []) {
      ids.push(doc.id);
    }
  }

  return ids;
}

async function deleteDocsFromSearch(docIds: string[]): Promise<number> {
  if (docIds.length === 0) return 0;
  let deleted = 0;
  const batchSize = 100;

  for (let i = 0; i < docIds.length; i += batchSize) {
    const batch = docIds.slice(i, i + batchSize);
    const response = await fetch(
      `${SEARCH_ENDPOINT}/indexes/msf-knowledge/docs/index?api-version=2024-07-01`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "api-key": SEARCH_KEY },
        body: JSON.stringify({
          value: batch.map((id) => ({ "@search.action": "delete", id })),
        }),
      }
    );
    if (response.ok) deleted += batch.length;
  }

  return deleted;
}

app.timer("kbStaleSweep", {
  schedule: "0 0 2 * * 0", // Weekly on Sundays at 02:00 UTC
  handler: async (_timer: Timer, context: InvocationContext) => {
    context.log("Starting KB stale document sweep");
    if (!SEARCH_ENDPOINT || !SEARCH_KEY) {
      context.error("Azure AI Search not configured — skipping stale sweep");
      return;
    }
    const deps: StaleSweepDeps = {
      queryStaleDocuments: queryStaleDocsFromSearch,
      deleteDocuments: deleteDocsFromSearch,
    };
    await sweepStaleDocuments(deps, context);
  },
});
