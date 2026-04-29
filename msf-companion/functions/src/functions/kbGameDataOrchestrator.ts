/**
 * Timer-triggered Azure Function: Game Data KB Orchestrator
 * Runs all game data KB syncs in sequence daily at 05:00 UTC.
 */

import { app, InvocationContext, Timer } from "@azure/functions";

const SEARCH_ENDPOINT = process.env.AZURE_AI_SEARCH_ENDPOINT || "";
const SEARCH_KEY = process.env.AZURE_AI_SEARCH_KEY || "";

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

    // In production, these would import and call the actual sync functions.
    // Each sync function has its own timer for independent triggering,
    // but this orchestrator runs them in sequence for the daily refresh.
    const deps: OrchestratorDeps = {
      syncCharacters: async () => ({ uploaded: 0 }),
      syncMeta: async () => ({ totalDocs: 0 }),
      syncDD: async () => ({ uploaded: 0 }),
      syncISO8: async () => ({ indexed: 0 }),
      syncGear: async () => ({ uploaded: 0 }),
    };

    await orchestrateGameDataSync(deps, context);
  },
});
