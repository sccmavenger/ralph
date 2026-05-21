"use strict";
/**
 * Timer-triggered Azure Function: Blog KB Sync
 * Checks for new Scopely blog posts daily and indexes them as KB documents.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.syncBlogs = syncBlogs;
const functions_1 = require("@azure/functions");
const blogScraper_js_1 = require("../lib/blogScraper.js");
const SEARCH_ENDPOINT = process.env.AZURE_AI_SEARCH_ENDPOINT || "";
const SEARCH_KEY = process.env.AZURE_AI_SEARCH_KEY || "";
async function syncBlogs(deps, context) {
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
            const meta = {
                title: post.title,
                url: post.url,
                publishedDate: post.date || new Date().toISOString().split("T")[0],
            };
            const docs = (0, blogScraper_js_1.chunkBlogContent)(content, meta);
            if (docs.length > 0) {
                const result = await deps.uploadDocuments(docs);
                docsUploaded += result.succeeded;
                newPosts++;
                await deps.trackSyncedUrl(post.url);
            }
        }
        catch (err) {
            context.warn(`Error processing blog post ${post.url}: ${err}`);
            errors++;
        }
    }
    context.log(`Blog sync complete: ${newPosts} new posts, ${docsUploaded} docs uploaded, ${errors} errors`);
    return { newPosts, docsUploaded, errors };
}
async function uploadToSearch(docs) {
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
}
functions_1.app.timer("kbBlogSync", {
    schedule: "0 0 7 * * *", // 07:00 UTC daily
    handler: async (_timer, context) => {
        context.log("Starting blog KB sync");
        if (!SEARCH_ENDPOINT || !SEARCH_KEY) {
            context.error("Azure AI Search not configured — skipping blog sync");
            return;
        }
        const deps = {
            fetchBlogList: async () => {
                const response = await fetch("https://marvelstrikeforce.com/en/updates", {
                    headers: { "User-Agent": "MSFCompanion/1.0 (KB Blog Sync)" },
                });
                if (!response.ok)
                    return [];
                const html = await response.text();
                const links = (0, blogScraper_js_1.extractBlogLinks)(html);
                return links.map((link) => ({ url: link.url, title: link.title, date: new Date().toISOString().split("T")[0] }));
            },
            fetchBlogContent: async (url) => {
                try {
                    const response = await fetch(url, {
                        headers: { "User-Agent": "MSFCompanion/1.0 (KB Blog Sync)" },
                    });
                    if (!response.ok)
                        return null;
                    const html = await response.text();
                    // Strip HTML tags to get text content
                    return html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
                        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
                        .replace(/<[^>]*>/g, " ")
                        .replace(/\s+/g, " ")
                        .trim();
                }
                catch {
                    return null;
                }
            },
            getIndexedBlogIds: async () => {
                try {
                    const response = await fetch(`${SEARCH_ENDPOINT}/indexes/msf-knowledge/docs?api-version=2024-07-01&$filter=sourceType eq 'official-blog'&$select=id&$top=1000`, { headers: { "api-key": SEARCH_KEY } });
                    if (!response.ok)
                        return new Set();
                    const data = (await response.json());
                    return new Set((data.value || []).map((d) => d.id));
                }
                catch {
                    return new Set();
                }
            },
            uploadDocuments: uploadToSearch,
            trackSyncedUrl: async () => { },
        };
        await syncBlogs(deps, context);
    },
});
//# sourceMappingURL=kbBlogSync.js.map