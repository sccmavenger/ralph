/**
 * Cosmos DB change feed triggered function: AI Transcript Processing
 * Processes videos with status: "transcribed" to extract knowledge via Azure OpenAI.
 */

import { app, InvocationContext } from "@azure/functions";
import { getContainer } from "../lib/cosmosClient.js";
import { processTranscript, KnowledgeItem, OpenAIClient, ClassificationResult, IntelCategory } from "../lib/aiProcessor.js";

interface TranscribedVideoDocument {
  id: string;
  videoId: string;
  channelId: string;
  channelName: string;
  title: string;
  publishedAt: string;
  transcript: string;
  status: string;
}

function createOpenAIClient(): OpenAIClient {
  const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
  const key = process.env.AZURE_OPENAI_KEY;
  const gpt4oMini = process.env.AZURE_OPENAI_GPT4O_MINI_DEPLOYMENT || "gpt-4o-mini";
  const gpt4o = process.env.AZURE_OPENAI_GPT4O_DEPLOYMENT || "gpt-4o";

  if (!endpoint || !key) throw new Error("Azure OpenAI not configured");

  return {
    async classify(transcript: string) {
      const response = await fetch(
        `${endpoint}/openai/deployments/${gpt4oMini}/chat/completions?api-version=2024-08-01-preview`,
        {
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
        }
      );

      const data = await response.json() as { choices: Array<{ message: { content: string } }>; usage: { total_tokens: number } };
      const content = data.choices?.[0]?.message?.content || "{}";
      let result: ClassificationResult;
      try {
        result = JSON.parse(content);
      } catch {
        result = { categories: [], confidence: 0 };
      }
      return { result, tokensUsed: data.usage?.total_tokens || 0 };
    },

    async extract(transcript: string, categories: IntelCategory[]) {
      const response = await fetch(
        `${endpoint}/openai/deployments/${gpt4o}/chat/completions?api-version=2024-08-01-preview`,
        {
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
        }
      );

      const data = await response.json() as { choices: Array<{ message: { content: string } }>; usage: { total_tokens: number } };
      const content = data.choices?.[0]?.message?.content || "[]";
      let items: Array<{ category: IntelCategory; content: Record<string, unknown> }>;
      try {
        items = JSON.parse(content);
        if (!Array.isArray(items)) items = [];
      } catch {
        items = [];
      }
      return { items, tokensUsed: data.usage?.total_tokens || 0 };
    },
  };
}

app.cosmosDB("aiProcessor", {
  connection: "COSMOS_CONNECTION_STRING",
  databaseName: "%COSMOS_DATABASE_NAME%",
  containerName: "videos",
  createLeaseContainerIfNotExists: true,
  leaseContainerName: "leases-ai",
  handler: async (documents: unknown[], context: InvocationContext): Promise<void> => {
    const docs = documents as TranscribedVideoDocument[];
    const transcribedDocs = docs.filter((d) => d.status === "transcribed");

    if (transcribedDocs.length === 0) return;

    context.log(`Processing ${transcribedDocs.length} transcribed videos for AI extraction`);

    const videosContainer = getContainer("videos");
    const knowledgeContainer = getContainer("knowledge");
    const client = createOpenAIClient();

    let totalItems = 0;
    let totalTokens = 0;

    for (const doc of transcribedDocs) {
      try {
        const result = await processTranscript(doc.transcript, {
          videoId: doc.videoId,
          channelId: doc.channelId,
          creatorName: doc.channelName,
          videoTitle: doc.title,
          publishedAt: doc.publishedAt,
        }, client);

        // Store knowledge items
        for (const item of result.items) {
          await knowledgeContainer.items.create(item as KnowledgeItem & { [key: string]: unknown });
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
      } catch (err) {
        context.error(`AI processing error for video ${doc.videoId}: ${err}`);
        try {
          await videosContainer.item(doc.videoId, doc.channelId).patch([
            { op: "set", path: "/status", value: "process_failed" },
            { op: "set", path: "/processError", value: String(err) },
          ]);
        } catch {
          context.warn(`Failed to update error status for ${doc.videoId}`);
        }
      }
    }

    context.log(`AI processing batch complete: ${totalItems} knowledge items, ${totalTokens} total tokens`);
  },
});
