/**
 * Local Knowledge Base Refresh Script
 * 
 * Runs from your local machine to fetch YouTube transcripts (which YouTube
 * blocks from Azure datacenter IPs) and uploads them to Azure AI Search.
 * 
 * Usage:
 *   npx tsx scripts/refresh-kb.ts              # Incremental (new videos only)
 *   npx tsx scripts/refresh-kb.ts --full       # Full refresh (clear + re-ingest)
 *   npx tsx scripts/refresh-kb.ts --status     # Check current index status
 * 
 * Requires .env with:
 *   AZURE_AI_SEARCH_ENDPOINT=https://...
 *   AZURE_AI_SEARCH_KEY=...
 */

import { config } from "dotenv";
import { resolve } from "path";

// Load env BEFORE importing pipeline (which reads env vars at module level)
config({ path: resolve(__dirname, "../.env") });

async function main() {
  // Dynamic import so env vars are available when the module initializes
  const {
    runIngestionPipeline,
    getDocumentCount,
    checkCreatorStaleness,
  } = await import("../src/lib/youtube-pipeline");

  const args = process.argv.slice(2);
  const isFull = args.includes("--full");
  const isStatus = args.includes("--status");
  const requestedMax = Number(args.find((arg) => arg.startsWith("--max="))?.split("=")[1]);
  const maxVideosPerChannel = Number.isInteger(requestedMax) && requestedMax > 0
    ? Math.min(50, requestedMax)
    : 50;

  if (!process.env.AZURE_AI_SEARCH_ENDPOINT || !process.env.AZURE_AI_SEARCH_KEY) {
    console.error("ERROR: Missing AZURE_AI_SEARCH_ENDPOINT or AZURE_AI_SEARCH_KEY in .env");
    process.exit(1);
  }

  if (isStatus) {
    console.log("📊 Knowledge Base Status");
    console.log("========================");
    const count = await getDocumentCount();
    console.log(`Documents in index: ${count}`);
    const staleness = await checkCreatorStaleness();
    console.log("\nCreator Staleness:");
    for (const s of staleness) {
      const status = s.isStale ? "⚠️  STALE" : "✅ Fresh";
      console.log(`  ${status} ${s.name} (last: ${s.lastVideoDate || "never"})`);
    }
    return;
  }

  console.log(isFull ? "🔄 Full KB Refresh" : "📥 Incremental KB Refresh");
  console.log("=".repeat(40));
  console.log(`Running from local machine (transcripts work here)\n`);

  const result = await runIngestionPipeline({
    clearExisting: isFull,
    maxVideosPerChannel,
    incremental: !isFull,
    // Azure retry markers protect the scheduled cloud worker. A trusted local
    // run can retrieve captions that YouTube denies to Azure, so ignore only
    // those temporary markers while still honoring successfully indexed IDs.
    respectRetryMarkers: false,
    onProgress: (msg) => console.log(msg),
  });

  console.log("\n" + "=".repeat(40));
  console.log("📊 Results:");
  console.log(`  Videos processed: ${result.videosProcessed}`);
  console.log(`  Documents uploaded: ${result.documentsUploaded}`);
  console.log(`  New videos found: ${result.newVideosFound}`);
  if (result.skippedVideos.length > 0) {
    console.log(`  Skipped: ${result.skippedVideos.length}`);
  }
  if (result.errors.length > 0) {
    console.log(`  Errors: ${result.errors.length}`);
    for (const err of result.errors) {
      console.log(`    ❌ ${err}`);
    }
  }

  const finalCount = await getDocumentCount();
  console.log(`\n  Total documents in index: ${finalCount}`);
}

main().catch((e) => {
  console.error("Fatal error:", e);
  process.exit(1);
});
