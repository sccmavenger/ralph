/**
 * Timer-triggered Azure Function: Blog KB Sync
 * Checks for new Scopely blog posts daily and indexes them as KB documents.
 */

import { app, InvocationContext, Timer } from "@azure/functions";
import { chunkBlogContent, BlogMeta } from "../lib/blogScraper.js";
import type { KBDocument } from "../lib/kbGameData.js";

const SEARCH_ENDPOINT = process.env.AZURE_AI_SEARCH_ENDPOINT || "";
const SEARCH_KEY = process.env.AZURE_AI_SEARCH_KEY || "";

export interface BlogSyncDeps {
  fetchBlogList: () => Promise<Array<{ url: string; title: string; date: string }>>;
  fetchBlogContent: (url: string) => Promise<string | null>;
  getIndexedBlogIds: () => Promise<Set<string>>;
  uploadDocuments: (docs: KBDocument[]) => Promise<{ succeeded: number; failed: number }>;
  trackSyncedUrl: (url: string) => Promise<void>;
}

export async function syncBlogs(
  deps: BlogSyncDeps,
  context: InvocationContext
): Promise<{ newPosts: number; docsUploaded: number; errors: number }> {
  const posts = await deps.fetchBlogList();
  context.log(`Found ${posts.length} blog posts on updates page`);

  const indexedIds = await deps.getIndexedBlogIds();
  let newPosts = 0;
  let docsUploaded = 0;
  let errors = 0;

  for (const post of posts) {
    const slugTitle = post.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    const baseId = `blog-${slugTitle}`;

    // Skip if already indexed
    if (indexedIds.has(baseId + "-0")) {
      continue;
    }

    try {
      const content = await deps.fetchBlogContent(post.url);
      if (!content) {
        errors++;
        continue;
      }

      const meta: BlogMeta = {
        title: post.title,
        url: post.url,
        publishedDate: post.date || new Date().toISOString().split("T")[0],
      };

      const docs = chunkBlogContent(content, meta);
      if (docs.length > 0) {
        const result = await deps.uploadDocuments(docs);
        docsUploaded += result.succeeded;
        newPosts++;
        await deps.trackSyncedUrl(post.url);
      }
    } catch (err) {
      context.warn(`Error processing blog post ${post.url}: ${err}`);
      errors++;
    }
  }

  context.log(`Blog sync complete: ${newPosts} new posts, ${docsUploaded} docs uploaded, ${errors} errors`);
  return { newPosts, docsUploaded, errors };
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

app.timer("kbBlogSync", {
  schedule: "0 0 7 * * *", // 07:00 UTC daily
  handler: async (_timer: Timer, context: InvocationContext) => {
    context.log("Starting blog KB sync");
    if (!SEARCH_ENDPOINT || !SEARCH_KEY) {
      context.error("Azure AI Search not configured — skipping blog sync");
      return;
    }
    const deps: BlogSyncDeps = {
      fetchBlogList: async () => [],
      fetchBlogContent: async () => null,
      getIndexedBlogIds: async () => new Set(),
      uploadDocuments: uploadToSearch,
      trackSyncedUrl: async () => {},
    };
    await syncBlogs(deps, context);
  },
});
