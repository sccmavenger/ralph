"use strict";
/**
 * Cosmos DB change feed triggered function: AI Transcript Processing
 * Processes videos with status: "transcribed" to extract knowledge via Azure OpenAI.
 */
Object.defineProperty(exports, "__esModule", { value: true });
const functions_1 = require("@azure/functions");
const cosmosClient_js_1 = require("../lib/cosmosClient.js");
const aiProcessor_js_1 = require("../lib/aiProcessor.js");
function createOpenAIClient() {
    const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
    const key = process.env.AZURE_OPENAI_KEY;
    const gpt4oMini = process.env.AZURE_OPENAI_GPT4O_MINI_DEPLOYMENT || "gpt-4o-mini";
    const gpt4o = process.env.AZURE_OPENAI_GPT4O_DEPLOYMENT || "gpt-4o";
    if (!endpoint || !key)
        throw new Error("Azure OpenAI not configured");
    return {
        async classify(transcript) {
            const response = await fetch(`${endpoint}/openai/deployments/${gpt4oMini}/chat/completions?api-version=2024-08-01-preview`, {
                method: "POST",
                headers: { "Content-Type": "application/json", "api-key": key },
                body: JSON.stringify({
                    messages: [
                        { role: "system", content: "Classify MSF content categories. Return JSON: {categories: string[], confidence: number}" },
                        { role: "user", content: transcript.slice(0, 4000) },
                    ],
                    max_tokens: 200,
                    temperature: 0.1,
                }),
            });
            const data = await response.json();
            const content = data.choices?.[0]?.message?.content || "{}";
            let result;
            try {
                result = JSON.parse(content);
            }
            catch {
                result = { categories: [], confidence: 0 };
            }
            return { result, tokensUsed: data.usage?.total_tokens || 0 };
        },
        async extract(transcript, categories) {
            const response = await fetch(`${endpoint}/openai/deployments/${gpt4o}/chat/completions?api-version=2024-08-01-preview`, {
                method: "POST",
                headers: { "Content-Type": "application/json", "api-key": key },
                body: JSON.stringify({
                    messages: [
                        { role: "system", content: `Extract MSF knowledge for categories: ${categories.join(", ")}. Return JSON array.` },
                        { role: "user", content: transcript.slice(0, 12000) },
                    ],
                    max_tokens: 2000,
                    temperature: 0.2,
                }),
            });
            const data = await response.json();
            const content = data.choices?.[0]?.message?.content || "[]";
            let items;
            try {
                items = JSON.parse(content);
                if (!Array.isArray(items))
                    items = [];
            }
            catch {
                items = [];
            }
            return { items, tokensUsed: data.usage?.total_tokens || 0 };
        },
    };
}
functions_1.app.cosmosDB("aiProcessor", {
    connection: "COSMOS_CONNECTION_STRING",
    databaseName: "%COSMOS_DATABASE_NAME%",
    containerName: "videos",
    createLeaseContainerIfNotExists: true,
    leaseContainerName: "leases-ai",
    handler: async (documents, context) => {
        const docs = documents;
        const transcribedDocs = docs.filter((d) => d.status === "transcribed");
        if (transcribedDocs.length === 0)
            return;
        context.log(`Processing ${transcribedDocs.length} transcribed videos for AI extraction`);
        const videosContainer = (0, cosmosClient_js_1.getContainer)("videos");
        const knowledgeContainer = (0, cosmosClient_js_1.getContainer)("knowledge");
        const client = createOpenAIClient();
        let totalItems = 0;
        let totalTokens = 0;
        for (const doc of transcribedDocs) {
            try {
                const result = await (0, aiProcessor_js_1.processTranscript)(doc.transcript, {
                    videoId: doc.videoId,
                    channelId: doc.channelId,
                    creatorName: doc.channelName,
                    videoTitle: doc.title,
                    publishedAt: doc.publishedAt,
                }, client);
                // Store knowledge items
                for (const item of result.items) {
                    await knowledgeContainer.items.create(item);
                }
                // Update video status
                await videosContainer.item(doc.videoId, doc.channelId).patch([
                    { op: "set", path: "/status", value: "processed" },
                    { op: "set", path: "/processedAt", value: new Date().toISOString() },
                    { op: "set", path: "/knowledgeItemCount", value: result.items.length },
                    { op: "set", path: "/tokensUsed", value: result.tokensUsed },
                ]);
                totalItems += result.items.length;
                totalTokens += result.tokensUsed.classification + result.tokensUsed.extraction;
                context.log(`Processed video ${doc.videoId}: ${result.items.length} knowledge items, ${result.tokensUsed.classification + result.tokensUsed.extraction} tokens`);
            }
            catch (err) {
                context.error(`AI processing error for video ${doc.videoId}: ${err}`);
                try {
                    await videosContainer.item(doc.videoId, doc.channelId).patch([
                        { op: "set", path: "/status", value: "process_failed" },
                        { op: "set", path: "/processError", value: String(err) },
                    ]);
                }
                catch {
                    context.warn(`Failed to update error status for ${doc.videoId}`);
                }
            }
        }
        context.log(`AI processing batch complete: ${totalItems} knowledge items, ${totalTokens} total tokens`);
    },
});
//# sourceMappingURL=aiProcessor.js.map