"use strict";
/**
 * Timer-triggered Azure Function: Gap Auto-Resolution
 * Picks up knowledge gaps with status 'auto_resolving' and attempts to
 * resolve them by searching YouTube for relevant content, indexing it,
 * and marking the gap as resolved.
 * Runs daily at 03:30 UTC (after gap analysis at 03:00).
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveGaps = resolveGaps;
const functions_1 = require("@azure/functions");
const pgClient_js_1 = require("../lib/pgClient.js");
const SEARCH_ENDPOINT = process.env.AZURE_AI_SEARCH_ENDPOINT || "";
const SEARCH_KEY = process.env.AZURE_AI_SEARCH_KEY || "";
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY || "";
async function resolveGaps(deps, context) {
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
            }
            else {
                await deps.markGapFailed(gap.id);
                failed++;
            }
        }
        catch (err) {
            context.warn(`Error resolving gap ${gap.id}: ${err}`);
            failed++;
        }
    }
    context.log(`Gap auto-resolve complete: ${resolved} resolved, ${failed} failed, ${skipped} skipped`);
    return { resolved, failed, skipped };
}
functions_1.app.timer("gapAutoResolve", {
    schedule: "0 30 3 * * *", // 03:30 UTC daily (after gap analysis at 03:00)
    handler: async (_timer, context) => {
        context.log("Starting gap auto-resolution");
        if (!SEARCH_ENDPOINT || !SEARCH_KEY) {
            context.error("Azure AI Search not configured — skipping gap auto-resolve");
            return;
        }
        const pool = (0, pgClient_js_1.getPool)();
        const deps = {
            fetchAutoResolvingGaps: async () => {
                const result = await pool.query(`SELECT id, "clusteredQuestion", category, "gapType", "autoResolveAction"
           FROM "KnowledgeGap"
           WHERE status = 'auto_resolving'
           ORDER BY frequency DESC
           LIMIT 20`);
                return result.rows.map((r) => ({
                    id: r.id,
                    clusteredQuestion: r.clusteredQuestion,
                    category: r.category,
                    gapType: r.gapType,
                    autoResolveAction: r.autoResolveAction,
                }));
            },
            searchYouTube: async (query) => {
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
                const response = await fetch(`https://www.googleapis.com/youtube/v3/search?${params}`);
                if (!response.ok)
                    return [];
                const data = (await response.json());
                return (data.items || []).map((item) => ({
                    videoId: item.id.videoId,
                    title: item.snippet.title,
                    description: item.snippet.description,
                    channelTitle: item.snippet.channelTitle,
                    publishedAt: item.snippet.publishedAt,
                }));
            },
            uploadDocuments: async (docs) => {
                if (docs.length === 0)
                    return { succeeded: 0, failed: 0 };
                const response = await fetch(`${SEARCH_ENDPOINT}/indexes/msf-knowledge/docs/index?api-version=2024-07-01`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json", "api-key": SEARCH_KEY },
                    body: JSON.stringify({
                        value: docs.map((doc) => ({ "@search.action": "mergeOrUpload", ...doc })),
                    }),
                });
                if (response.ok)
                    return { succeeded: docs.length, failed: 0 };
                return { succeeded: 0, failed: docs.length };
            },
            markGapResolved: async (gapId) => {
                await pool.query(`UPDATE "KnowledgeGap" SET status = 'resolved', "resolvedAt" = NOW(), "updatedAt" = NOW()
           WHERE id = $1`, [gapId]);
            },
            markGapFailed: async (gapId) => {
                await pool.query(`UPDATE "KnowledgeGap" SET status = 'open', "updatedAt" = NOW()
           WHERE id = $1`, [gapId]);
            },
        };
        await resolveGaps(deps, context);
    },
});
//# sourceMappingURL=gapAutoResolve.js.map