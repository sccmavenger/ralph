/**
 * Timer-triggered Azure Function: Gap Auto-Resolution
 * Picks up knowledge gaps with status 'auto_resolving' and attempts to
 * resolve them by searching YouTube for relevant content, indexing it,
 * and marking the gap as resolved.
 * Runs daily at 03:30 UTC (after gap analysis at 03:00).
 */

import { app, InvocationContext, Timer } from "@azure/functions";
import { getPool } from "../lib/pgClient.js";

const SEARCH_ENDPOINT = process.env.AZURE_AI_SEARCH_ENDPOINT || "";
const SEARCH_KEY = process.env.AZURE_AI_SEARCH_KEY || "";
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY || "";

export interface GapRecord {
  id: string;
  clusteredQuestion: string;
  category: string;
  gapType: string;
  autoResolveAction: string | null;
}

export interface GapResolveDeps {
  fetchAutoResolvingGaps: () => Promise<GapRecord[]>;
  searchYouTube: (query: string) => Promise<Array<{ videoId: string; title: string; description: string; channelTitle: string; publishedAt: string }>>;
  uploadDocuments: (docs: Array<{ id: string; content: string; category: string; sourceCreatorName: string; sourceVideoTitle: string; sourceUrl: string; sourceDate: string; sourceTier: number; sourceType: string }>) => Promise<{ succeeded: number; failed: number }>;
  markGapResolved: (gapId: string) => Promise<void>;
  markGapFailed: (gapId: string) => Promise<void>;
}

export async function resolveGaps(
  deps: GapResolveDeps,
  context: InvocationContext
): Promise<{ resolved: number; failed: number; skipped: number }> {
  const gaps = await deps.fetchAutoResolvingGaps();
  if (gaps.length === 0) {
    context.log("No auto-resolving gaps to process");
    return { resolved: 0, failed: 0, skipped: 0 };
  }

  context.log(`Processing ${gaps.length} auto-resolving gaps`);

  let resolved = 0;
  let failed = 0;
  let skipped = 0;

  for (const gap of gaps) {
    try {
      // Search YouTube for content related to the gap question
      const searchQuery = `Marvel Strike Force ${gap.clusteredQuestion}`;
      const videos = await deps.searchYouTube(searchQuery);

      if (videos.length === 0) {
        context.log(`No YouTube results for gap: ${gap.clusteredQuestion}`);
        skipped++;
        continue;
      }

      // Create KB documents from the top results (max 3)
      const docs = videos.slice(0, 3).map((video) => ({
        id: `yt-gap-${gap.id}-${video.videoId}`,
        content: `${video.title}\n\n${video.description}`.slice(0, 5000),
        category: gap.category,
        sourceCreatorName: video.channelTitle,
        sourceVideoTitle: video.title,
        sourceUrl: `https://www.youtube.com/watch?v=${video.videoId}`,
        sourceDate: video.publishedAt.split("T")[0],
        sourceTier: 3,
        sourceType: "youtube-gap-resolve",
      }));

      const result = await deps.uploadDocuments(docs);

      if (result.succeeded > 0) {
        await deps.markGapResolved(gap.id);
        resolved++;
        context.log(`Resolved gap "${gap.clusteredQuestion}" with ${result.succeeded} docs`);
      } else {
        await deps.markGapFailed(gap.id);
        failed++;
      }
    } catch (err) {
      context.warn(`Error resolving gap ${gap.id}: ${err}`);
      failed++;
    }
  }

  context.log(`Gap auto-resolve complete: ${resolved} resolved, ${failed} failed, ${skipped} skipped`);
  return { resolved, failed, skipped };
}

app.timer("gapAutoResolve", {
  schedule: "0 30 3 * * *", // 03:30 UTC daily (after gap analysis at 03:00)
  handler: async (_timer: Timer, context: InvocationContext) => {
    context.log("Starting gap auto-resolution");

    if (!SEARCH_ENDPOINT || !SEARCH_KEY) {
      context.error("Azure AI Search not configured — skipping gap auto-resolve");
      return;
    }

    const pool = getPool();

    const deps: GapResolveDeps = {
      fetchAutoResolvingGaps: async () => {
        const result = await pool.query(
          `SELECT id, "clusteredQuestion", category, "gapType", "autoResolveAction"
           FROM "KnowledgeGap"
           WHERE status = 'auto_resolving'
           ORDER BY frequency DESC
           LIMIT 20`
        );
        return result.rows.map((r: { id: string; clusteredQuestion: string; category: string; gapType: string; autoResolveAction: string | null }) => ({
          id: r.id,
          clusteredQuestion: r.clusteredQuestion,
          category: r.category,
          gapType: r.gapType,
          autoResolveAction: r.autoResolveAction,
        }));
      },

      searchYouTube: async (query: string) => {
        if (!YOUTUBE_API_KEY) {
          // Fallback: use public RSS-like search (no API key needed)
          return [];
        }
        const params = new URLSearchParams({
          part: "snippet",
          q: query,
          type: "video",
          maxResults: "5",
          order: "relevance",
          key: YOUTUBE_API_KEY,
        });
        const response = await fetch(
          `https://www.googleapis.com/youtube/v3/search?${params}`
        );
        if (!response.ok) return [];
        const data = (await response.json()) as {
          items?: Array<{
            id: { videoId: string };
            snippet: { title: string; description: string; channelTitle: string; publishedAt: string };
          }>;
        };
        return (data.items || []).map((item) => ({
          videoId: item.id.videoId,
          title: item.snippet.title,
          description: item.snippet.description,
          channelTitle: item.snippet.channelTitle,
          publishedAt: item.snippet.publishedAt,
        }));
      },

      uploadDocuments: async (docs) => {
        if (docs.length === 0) return { succeeded: 0, failed: 0 };
        const response = await fetch(
          `${SEARCH_ENDPOINT}/indexes/msf-knowledge/docs/index?api-version=2024-07-01`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json", "api-key": SEARCH_KEY },
            body: JSON.stringify({
              value: docs.map((doc) => ({ "@search.action": "mergeOrUpload", ...doc })),
            }),
          }
        );
        if (response.ok) return { succeeded: docs.length, failed: 0 };
        return { succeeded: 0, failed: docs.length };
      },

      markGapResolved: async (gapId: string) => {
        await pool.query(
          `UPDATE "KnowledgeGap" SET status = 'resolved', "resolvedAt" = NOW(), "updatedAt" = NOW()
           WHERE id = $1`,
          [gapId]
        );
      },

      markGapFailed: async (gapId: string) => {
        await pool.query(
          `UPDATE "KnowledgeGap" SET status = 'open', "updatedAt" = NOW()
           WHERE id = $1`,
          [gapId]
        );
      },
    };

    await resolveGaps(deps, context);
  },
});
