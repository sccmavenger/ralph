/**
 * MSF Blog Scraper — fetches and processes official MSF blog posts.
 */

import type { KBDocument } from "./kbGameData.js";

export interface BlogMeta {
  title: string;
  url: string;
  publishedDate: string;
}

export interface BlogPost {
  id: string;
  url: string;
  title: string;
  publishedDate: string;
  source: "official_blog";
  content: string;
  structured: BlogStructuredData;
  scrapedAt: string;
}

export interface BlogStructuredData {
  type: "patch_notes" | "character_kit" | "event_calendar" | "release_notes" | "general";
  patchNotes?: { changes: Array<{ character?: string; change: string }> };
  characterKit?: { name: string; abilities: Array<{ name: string; description: string }> };
  eventCalendar?: { events: Array<{ name: string; startDate?: string; endDate?: string; requirements?: string }> };
  releaseNotes?: { version: string; highlights: string[] };
}

const MSF_BLOG_URL = "https://marvelstrikeforce.com/en/updates";

export interface BlogScraperDeps {
  fetchPage: (url: string) => Promise<string | null>;
  getStoredUrls: () => Promise<Set<string>>;
  storeBlogPost: (post: BlogPost) => Promise<void>;
}

/**
 * Extract blog post links from the MSF updates page.
 */
export function extractBlogLinks(html: string): Array<{ url: string; title: string }> {
  const links: Array<{ url: string; title: string }> = [];

  // Match blog post links from the updates page
  const pattern = /<a[^>]*href="(\/en\/updates\/[^"]+)"[^>]*>[\s\S]*?<[^>]*class="[^"]*title[^"]*"[^>]*>([\s\S]*?)<\//g;
  let match: RegExpExecArray | null;
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
export function classifyBlogPost(title: string, content: string): BlogStructuredData["type"] {
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
export function extractStructuredData(html: string, type: BlogStructuredData["type"]): BlogStructuredData {
  // Strip HTML tags for text content
  const text = html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

  const result: BlogStructuredData = { type };

  switch (type) {
    case "patch_notes": {
      const changes: Array<{ character?: string; change: string }> = [];
      // Look for character-specific changes (e.g., "CharacterName: change description")
      const changePattern = /([A-Z][a-zA-Z\s-]+):\s*([^.]+\.)/g;
      let m: RegExpExecArray | null;
      while ((m = changePattern.exec(text)) !== null) {
        changes.push({ character: m[1].trim(), change: m[2].trim() });
      }
      result.patchNotes = { changes };
      break;
    }
    case "character_kit": {
      const abilities: Array<{ name: string; description: string }> = [];
      const abilityPattern = /(Basic|Special|Ultimate|Passive)\s*[-–:]\s*([^.]+\.)/gi;
      let m: RegExpExecArray | null;
      while ((m = abilityPattern.exec(text)) !== null) {
        abilities.push({ name: m[1], description: m[2].trim() });
      }
      result.characterKit = { name: "", abilities };
      break;
    }
    case "event_calendar": {
      const events: Array<{ name: string }> = [];
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
export async function scrapeBlog(deps: BlogScraperDeps): Promise<{ newPosts: number; skipped: number; errors: number }> {
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

      const post: BlogPost = {
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
    } catch {
      errors++;
    }
  }

  return { newPosts, skipped, errors };
}

/**
 * Classify a blog post into a KB category.
 */
export function classifyBlogCategory(title: string, content: string): string {
  const lower = (title + " " + content.slice(0, 500)).toLowerCase();
  if (lower.includes("character kit") || lower.includes("new character") || lower.includes("ability kit")) return "character-kits";
  if (lower.includes("patch notes") || lower.includes("balance update") || lower.includes("balance changes")) return "balance-change";
  if (lower.includes("event") || lower.includes("calendar") || lower.includes("news")) return "news-events";
  if (lower.includes("guide") || lower.includes("tutorial") || lower.includes("tips")) return "guide";
  return "general";
}

/**
 * Chunk a blog post into ~1000-word KB documents with proper metadata.
 */
export function chunkBlogContent(content: string, meta: BlogMeta): KBDocument[] {
  const words = content.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];

  const category = classifyBlogCategory(meta.title, content);
  const slugTitle = meta.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

  if (words.length <= 1200) {
    return [{
      id: `blog-${slugTitle}-0`,
      content,
      category,
      sourceCreatorName: "Scopely Official",
      sourceVideoTitle: meta.title,
      sourceUrl: meta.url,
      sourceDate: meta.publishedDate,
      sourceTier: 2,
      sourceType: "official-blog",
    }];
  }

  const chunks: KBDocument[] = [];
  let chunkIndex = 0;
  let startWord = 0;
  const targetSize = 1000;

  while (startWord < words.length) {
    const endWord = Math.min(startWord + targetSize, words.length);
    const chunkText = words.slice(startWord, endWord).join(" ");

    chunks.push({
      id: `blog-${slugTitle}-${chunkIndex}`,
      content: chunkText,
      category,
      sourceCreatorName: "Scopely Official",
      sourceVideoTitle: meta.title + (chunkIndex > 0 ? ` (Part ${chunkIndex + 1})` : ""),
      sourceUrl: meta.url,
      sourceDate: meta.publishedDate,
      sourceTier: 2,
      sourceType: "official-blog",
    });

    chunkIndex++;
    startWord = endWord;
  }

  return chunks;
}
