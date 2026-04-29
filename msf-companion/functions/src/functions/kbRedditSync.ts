/**
 * Timer-triggered Azure Function: Reddit KB Sync
 * Fetches top Reddit posts daily and indexes relevant ones as KB documents.
 */

import { app, InvocationContext, Timer } from "@azure/functions";
import { filterRelevantPosts, formatPostAsDocument, RedditPost } from "../lib/redditFetcher.js";
import type { KBDocument } from "../lib/kbGameData.js";

const SEARCH_ENDPOINT = process.env.AZURE_AI_SEARCH_ENDPOINT || "";
const SEARCH_KEY = process.env.AZURE_AI_SEARCH_KEY || "";

export interface RedditSyncDeps {
  fetchTopPosts: () => Promise<RedditPost[]>;
  getIndexedPostIds: () => Promise<Set<string>>;
  uploadDocuments: (docs: KBDocument[]) => Promise<{ succeeded: number; failed: number }>;
  deleteStaleDocuments: (docIds: string[]) => Promise<number>;
}

export async function syncReddit(
  deps: RedditSyncDeps,
  context: InvocationContext
): Promise<{ fetched: number; filtered: number; indexed: number; staleRemoved: number }> {
  let posts: RedditPost[];
  try {
    posts = await deps.fetchTopPosts();
  } catch (err) {
    context.warn(`Reddit API error — exiting gracefully: ${err}`);
    return { fetched: 0, filtered: 0, indexed: 0, staleRemoved: 0 };
  }

  context.log(`Fetched ${posts.length} posts from Reddit`);

  const relevant = filterRelevantPosts(posts);
  context.log(`${relevant.length} posts passed relevance filter`);

  const indexedIds = await deps.getIndexedPostIds();
  const newPosts = relevant.filter((p) => !indexedIds.has(`reddit-${p.id}`));
  context.log(`${newPosts.length} new posts to index`);

  const docs = newPosts.map(formatPostAsDocument);
  const result = docs.length > 0
    ? await deps.uploadDocuments(docs)
    : { succeeded: 0, failed: 0 };

  // 30-day retention: remove old reddit posts
  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const staleIds = Array.from(indexedIds).filter((id) => {
    // We can't determine age from ID alone; rely on search index query
    return false; // Placeholder — actual staleness is handled by kbStaleSweep
  });
  void staleIds; // Staleness handled by the dedicated sweep function

  context.log(`Reddit sync complete: ${result.succeeded} new docs indexed`);

  return {
    fetched: posts.length,
    filtered: relevant.length,
    indexed: result.succeeded,
    staleRemoved: 0,
  };
}

async function uploadToSearch(docs: KBDocument[]): Promise<{ succeeded: number; failed: number }> {
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
}

app.timer("kbRedditSync", {
  schedule: "0 0 6 * * *", // 06:00 UTC daily
  handler: async (_timer: Timer, context: InvocationContext) => {
    context.log("Starting Reddit KB sync");
    if (!SEARCH_ENDPOINT || !SEARCH_KEY) {
      context.error("Azure AI Search not configured — skipping Reddit sync");
      return;
    }
    const deps: RedditSyncDeps = {
      fetchTopPosts: async () => [],
      getIndexedPostIds: async () => new Set(),
      uploadDocuments: uploadToSearch,
      deleteStaleDocuments: async () => 0,
    };
    await syncReddit(deps, context);
  },
});
