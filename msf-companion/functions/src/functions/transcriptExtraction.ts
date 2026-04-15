/**
 * Cosmos DB change feed triggered function: Transcript Extraction
 * Processes videos with status: "discovered" to extract transcripts.
 */

import { app, InvocationContext } from "@azure/functions";
import { getContainer } from "../lib/cosmosClient.js";
import { createTranscriptDeps, processVideoTranscript } from "../lib/transcriptPipeline.js";

interface VideoDocument {
  id: string;
  videoId: string;
  channelId: string;
  status: string;
}

app.cosmosDB("transcriptExtraction", {
  connection: "COSMOS_CONNECTION_STRING",
  databaseName: "%COSMOS_DATABASE_NAME%",
  containerName: "videos",
  createLeaseContainerIfNotExists: true,
  handler: async (documents: unknown[], context: InvocationContext): Promise<void> => {
    const docs = documents as VideoDocument[];
    const discoveredDocs = docs.filter((d) => d.status === "discovered");

    if (discoveredDocs.length === 0) return;

    context.log(`Processing ${discoveredDocs.length} discovered videos for transcript extraction`);

    const videosContainer = getContainer("videos");
    const deps = createTranscriptDeps(videosContainer);

    let transcribed = 0;
    let failed = 0;

    for (const doc of discoveredDocs) {
      const result = await processVideoTranscript(doc.videoId, doc.channelId, deps, context);
      if (result.status === "transcribed") {
        transcribed++;
      } else {
        failed++;
      }
    }

    context.log(`Transcript extraction batch complete: ${transcribed} transcribed, ${failed} failed`);
  },
});
