/**
 * Timer-triggered Azure Function: MSF Blog Scraper
 * Runs daily to fetch and process official MSF blog posts.
 */

import { app, InvocationContext, Timer } from "@azure/functions";
import { getContainer } from "../lib/cosmosClient.js";
import { scrapeBlog, BlogPost, BlogScraperDeps } from "../lib/blogScraper.js";

app.timer("blogScraper", {
  // Daily at 08:00 UTC (2 hours after video discovery)
  schedule: "0 0 8 * * *",
  handler: async (_timer: Timer, context: InvocationContext): Promise<void> => {
    context.log("MSF Blog Scraper started");

    try {
      const knowledgeContainer = getContainer("knowledge");
      const blogPostsContainer = getContainer("blogPosts");

      const deps: BlogScraperDeps = {
        fetchPage: async (url: string) => {
          try {
            const response = await fetch(url, {
              headers: { "User-Agent": "MSFCompanion/1.0 (Blog Scraper)" },
            });
            if (!response.ok) {
              context.warn(`Failed to fetch ${url}: ${response.status}`);
              return null;
            }
            return await response.text();
          } catch (err) {
            context.warn(`Error fetching ${url}: ${err}`);
            return null;
          }
        },

        getStoredUrls: async () => {
          const urls = new Set<string>();
          const queryResult = blogPostsContainer.items.query("SELECT c.url FROM c");
          const { resources } = await queryResult.fetchAll();
          for (const doc of resources) {
            urls.add(doc.url);
          }
          return urls;
        },

        storeBlogPost: async (post: BlogPost) => {
          // Store in blogPosts container for deduplication
          await blogPostsContainer.items.create({
            ...post,
            source: "official_blog",
          });

          // Also store as knowledge item for search indexing
          await knowledgeContainer.items.create({
            id: `blog_${post.id}`,
            category: `blog_${post.structured.type}`,
            content: post.structured,
            sourceCreatorName: "Official MSF Blog",
            sourceVideoTitle: post.title,
            sourceUrl: post.url,
            sourceDate: post.publishedDate,
            extractedAt: post.scrapedAt,
            fullTextContent: post.content,
          });
        },
      };

      const result = await scrapeBlog(deps);
      context.log(`Blog Scraper complete: ${result.newPosts} new, ${result.skipped} skipped, ${result.errors} errors`);
    } catch (err) {
      context.error(`Blog Scraper failed: ${err}`);
      throw err;
    }
  },
});
