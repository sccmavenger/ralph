"use strict";
/**
 * MSF Blog Scraper — fetches and processes official MSF blog posts.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractBlogLinks = extractBlogLinks;
exports.classifyBlogPost = classifyBlogPost;
exports.extractStructuredData = extractStructuredData;
exports.scrapeBlog = scrapeBlog;
const MSF_BLOG_URL = "https://marvelstrikeforce.com/en/updates";
/**
 * Extract blog post links from the MSF updates page.
 */
function extractBlogLinks(html) {
    const links = [];
    // Match blog post links from the updates page
    const pattern = /<a[^>]*href="(\/en\/updates\/[^"]+)"[^>]*>[\s\S]*?<[^>]*class="[^"]*title[^"]*"[^>]*>([\s\S]*?)<\//g;
    let match;
    while ((match = pattern.exec(html)) !== null) {
        const path = match[1];
        const title = match[2].replace(/<[^>]*>/g, "").trim();
        if (path && title) {
            links.push({
                url: `https://marvelstrikeforce.com${path}`,
                title,
            });
        }
    }
    // Fallback: simpler pattern for blog links
    if (links.length === 0) {
        const simplePattern = /href="(\/en\/updates\/[^"]+)"/g;
        while ((match = simplePattern.exec(html)) !== null) {
            links.push({
                url: `https://marvelstrikeforce.com${match[1]}`,
                title: match[1].split("/").pop()?.replace(/-/g, " ") || "Unknown",
            });
        }
    }
    return links;
}
/**
 * Classify blog post type from title and content.
 */
function classifyBlogPost(title, content) {
    const lower = (title + " " + content.slice(0, 500)).toLowerCase();
    if (lower.includes("patch notes") || lower.includes("balance update") || lower.includes("balance changes")) {
        return "patch_notes";
    }
    if (lower.includes("character kit") || lower.includes("new character") || lower.includes("ability kit")) {
        return "character_kit";
    }
    if (lower.includes("event calendar") || lower.includes("upcoming events") || lower.includes("event schedule")) {
        return "event_calendar";
    }
    if (lower.includes("release notes") || lower.includes("version") || lower.includes("update ")) {
        return "release_notes";
    }
    return "general";
}
/**
 * Extract structured data from blog post HTML content.
 */
function extractStructuredData(html, type) {
    // Strip HTML tags for text content
    const text = html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
    const result = { type };
    switch (type) {
        case "patch_notes": {
            const changes = [];
            // Look for character-specific changes (e.g., "CharacterName: change description")
            const changePattern = /([A-Z][a-zA-Z\s-]+):\s*([^.]+\.)/g;
            let m;
            while ((m = changePattern.exec(text)) !== null) {
                changes.push({ character: m[1].trim(), change: m[2].trim() });
            }
            result.patchNotes = { changes };
            break;
        }
        case "character_kit": {
            const abilities = [];
            const abilityPattern = /(Basic|Special|Ultimate|Passive)\s*[-–:]\s*([^.]+\.)/gi;
            let m;
            while ((m = abilityPattern.exec(text)) !== null) {
                abilities.push({ name: m[1], description: m[2].trim() });
            }
            result.characterKit = { name: "", abilities };
            break;
        }
        case "event_calendar": {
            const events = [];
            // Simple event extraction
            result.eventCalendar = { events };
            break;
        }
        case "release_notes": {
            const versionMatch = text.match(/(?:version|v)\s*([\d.]+)/i);
            result.releaseNotes = {
                version: versionMatch?.[1] || "unknown",
                highlights: [],
            };
            break;
        }
    }
    return result;
}
/**
 * Run the blog scraper pipeline.
 */
async function scrapeBlog(deps) {
    let newPosts = 0;
    let skipped = 0;
    let errors = 0;
    // Fetch the updates page
    const html = await deps.fetchPage(MSF_BLOG_URL);
    if (!html) {
        return { newPosts: 0, skipped: 0, errors: 1 };
    }
    const links = extractBlogLinks(html);
    const storedUrls = await deps.getStoredUrls();
    for (const link of links) {
        if (storedUrls.has(link.url)) {
            skipped++;
            continue;
        }
        try {
            const postHtml = await deps.fetchPage(link.url);
            if (!postHtml) {
                errors++;
                continue;
            }
            const type = classifyBlogPost(link.title, postHtml);
            const structured = extractStructuredData(postHtml, type);
            const textContent = postHtml.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
            const post = {
                id: link.url.replace(/[^a-zA-Z0-9]/g, "_"),
                url: link.url,
                title: link.title,
                publishedDate: new Date().toISOString(),
                source: "official_blog",
                content: textContent.slice(0, 10000),
                structured,
                scrapedAt: new Date().toISOString(),
            };
            await deps.storeBlogPost(post);
            newPosts++;
        }
        catch {
            errors++;
        }
    }
    return { newPosts, skipped, errors };
}
//# sourceMappingURL=blogScraper.js.map