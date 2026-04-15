"use strict";
/**
 * Cosmos DB change feed triggered function: Transcript Extraction
 * Processes videos with status: "discovered" to extract transcripts.
 */
Object.defineProperty(exports, "__esModule", { value: true });
const functions_1 = require("@azure/functions");
const cosmosClient_js_1 = require("../lib/cosmosClient.js");
const transcriptPipeline_js_1 = require("../lib/transcriptPipeline.js");
functions_1.app.cosmosDB("transcriptExtraction", {
    connection: "COSMOS_CONNECTION_STRING",
    databaseName: "%COSMOS_DATABASE_NAME%",
    containerName: "videos",
    createLeaseContainerIfNotExists: true,
    handler: async (documents, context) => {
        const docs = documents;
        const discoveredDocs = docs.filter((d) => d.status === "discovered");
        if (discoveredDocs.length === 0)
            return;
        context.log(`Processing ${discoveredDocs.length} discovered videos for transcript extraction`);
        const videosContainer = (0, cosmosClient_js_1.getContainer)("videos");
        const deps = (0, transcriptPipeline_js_1.createTranscriptDeps)(videosContainer);
        let transcribed = 0;
        let failed = 0;
        for (const doc of discoveredDocs) {
            const result = await (0, transcriptPipeline_js_1.processVideoTranscript)(doc.videoId, doc.channelId, deps, context);
            if (result.status === "transcribed") {
                transcribed++;
            }
            else {
                failed++;
            }
        }
        context.log(`Transcript extraction batch complete: ${transcribed} transcribed, ${failed} failed`);
    },
});
//# sourceMappingURL=transcriptExtraction.js.map