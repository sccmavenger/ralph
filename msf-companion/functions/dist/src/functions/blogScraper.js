"use strict";
/**
 * Timer-triggered Azure Function: MSF Blog Scraper
 * Runs daily to fetch and process official MSF blog posts.
 */
Object.defineProperty(exports, "__esModule", { value: true });
const functions_1 = require("@azure/functions");
const cosmosClient_js_1 = require("../lib/cosmosClient.js");
const blogScraper_js_1 = require("../lib/blogScraper.js");
functions_1.app.timer("blogScraper", {
    // Daily at 08:00 UTC (2 hours after video discovery)
    schedule: "0 0 8 * * *",
    handler: async (_timer, context) => {
        context.log("MSF Blog Scraper started");
        try {
            const knowledgeContainer = (0, cosmosClient_js_1.getContainer)("knowledge");
            const blogPostsContainer = (0, cosmosClient_js_1.getContainer)("blogPosts");
            const deps = {
                fetchPage: async (url) => {
                    try {
                        const response = await fetch(url, {
                            headers: { "User-Agent": "MSFCompanion/1.0 (Blog Scraper)" },
                        });
                        if (!response.ok) {
                            context.warn(`Failed to fetch ${url}: ${response.status}`);
                            return null;
                        }
                        return await response.text();
                    }
                    catch (err) {
                        context.warn(`Error fetching ${url}: ${err}`);
                        return null;
                    }
                },
                getStoredUrls: async () => {
                    const urls = new Set();
                    const queryResult = blogPostsContainer.items.query("SELECT c.url FROM c");
                    const { resources } = await queryResult.fetchAll();
                    for (const doc of resources) {
                        urls.add(doc.url);
                    }
                    return urls;
                },
                storeBlogPost: async (post) => {
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
            const result = await (0, blogScraper_js_1.scrapeBlog)(deps);
            context.log(`Blog Scraper complete: ${result.newPosts} new, ${result.skipped} skipped, ${result.errors} errors`);
        }
        catch (err) {
            context.error(`Blog Scraper failed: ${err}`);
            throw err;
        }
    },
});
//# sourceMappingURL=blogScraper.js.map