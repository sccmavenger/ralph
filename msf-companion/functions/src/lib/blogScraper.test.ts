import { describe, it, expect, vi } from "vitest";
import {
  extractBlogLinks,
  classifyBlogPost,
  extractStructuredData,
  scrapeBlog,
  classifyBlogCategory,
  chunkBlogContent,
  BlogScraperDeps,
  BlogPost,
} from "./blogScraper.js";

const SAMPLE_UPDATES_HTML = `
<html>
<body>
  <a href="/en/updates/patch-notes-8-5" class="post-link">
    <span class="title">Patch Notes 8.5 — Balance Changes</span>
  </a>
  <a href="/en/updates/new-character-silver-surfer" class="post-link">
    <span class="title">New Character Kit: Silver Surfer</span>
  </a>
  <a href="/en/updates/event-calendar-april-2026" class="post-link">
    <span class="title">Event Calendar — April 2026</span>
  </a>
</body>
</html>`;

const SAMPLE_PATCH_NOTES_HTML = `
<div class="post-content">
  <h1>Patch Notes 8.5 — Balance Changes</h1>
  <p>The following balance changes are now live:</p>
  <p>Ultron: Speed increased from 120 to 135.</p>
  <p>Wolverine: Damage reduced by 10 percent for balance.</p>
  <p>Spider-Man: Added new passive synergy with Spider-Verse allies.</p>
</div>`;

const SAMPLE_CHARACTER_KIT_HTML = `
<div class="post-content">
  <h1>New Character Kit: Silver Surfer</h1>
  <p>Basic - Cosmic Blast: Deal 300% damage to the primary target.</p>
  <p>Special - Power Cosmic: Apply Offense Up to all allies for 2 turns.</p>
  <p>Ultimate - Herald of Galactus: Deal 500% damage to all enemies.</p>
  <p>Passive - Silver Sentinel: On spawn, gain Deflect for 2 turns.</p>
</div>`;

describe("blogScraper", () => {
  describe("extractBlogLinks", () => {
    it("identifies new blog posts from MSF updates page", () => {
      const links = extractBlogLinks(SAMPLE_UPDATES_HTML);
      expect(links.length).toBeGreaterThan(0);
      for (const link of links) {
        expect(link.url).toContain("marvelstrikeforce.com/en/updates/");
        expect(link.title.length).toBeGreaterThan(0);
      }
    });
  });

  describe("classifyBlogPost", () => {
    it("classifies patch notes correctly", () => {
      expect(classifyBlogPost("Patch Notes 8.5", "Balance changes are live")).toBe("patch_notes");
    });

    it("classifies character kit correctly", () => {
      expect(classifyBlogPost("New Character Kit: Silver Surfer", "Ability kit details")).toBe("character_kit");
    });

    it("classifies event calendar correctly", () => {
      expect(classifyBlogPost("Event Calendar April 2026", "Upcoming events")).toBe("event_calendar");
    });

    it("defaults to general for unclassifiable posts", () => {
      expect(classifyBlogPost("Community Spotlight", "Player features")).toBe("general");
    });
  });

  describe("extractStructuredData", () => {
    it("extracts data from sample patch notes HTML", () => {
      const data = extractStructuredData(SAMPLE_PATCH_NOTES_HTML, "patch_notes");
      expect(data.type).toBe("patch_notes");
      expect(data.patchNotes).toBeDefined();
      expect(data.patchNotes!.changes.length).toBeGreaterThan(0);
    });

    it("extracts character kit data from sample character release post", () => {
      const data = extractStructuredData(SAMPLE_CHARACTER_KIT_HTML, "character_kit");
      expect(data.type).toBe("character_kit");
      expect(data.characterKit).toBeDefined();
      expect(data.characterKit!.abilities.length).toBeGreaterThan(0);
    });
  });

  describe("scrapeBlog", () => {
    it("skips already-ingested blog posts", async () => {
      const storedUrls = new Set([
        "https://marvelstrikeforce.com/en/updates/patch-notes-8-5",
        "https://marvelstrikeforce.com/en/updates/new-character-silver-surfer",
        "https://marvelstrikeforce.com/en/updates/event-calendar-april-2026",
      ]);

      const deps: BlogScraperDeps = {
        fetchPage: vi.fn().mockResolvedValue(SAMPLE_UPDATES_HTML),
        getStoredUrls: vi.fn().mockResolvedValue(storedUrls),
        storeBlogPost: vi.fn(),
      };

      const result = await scrapeBlog(deps);
      expect(result.skipped).toBeGreaterThan(0);
      expect(result.newPosts).toBe(0);
      expect(deps.storeBlogPost).not.toHaveBeenCalled();
    });

    it("handles MSF blog being unavailable (503, timeout)", async () => {
      const deps: BlogScraperDeps = {
        fetchPage: vi.fn().mockResolvedValue(null),
        getStoredUrls: vi.fn().mockResolvedValue(new Set<string>()),
        storeBlogPost: vi.fn(),
      };

      const result = await scrapeBlog(deps);
      expect(result.errors).toBeGreaterThanOrEqual(1);
      expect(result.newPosts).toBe(0);
      // Should not throw
    });

    it("integration: full scraper run against mocked blog produces knowledge items", async () => {
      const storedPosts: BlogPost[] = [];
      const deps: BlogScraperDeps = {
        fetchPage: vi.fn()
          .mockResolvedValueOnce(SAMPLE_UPDATES_HTML) // updates page
          .mockResolvedValueOnce(SAMPLE_PATCH_NOTES_HTML) // first blog post
          .mockResolvedValueOnce(SAMPLE_CHARACTER_KIT_HTML) // second blog post
          .mockResolvedValueOnce("<div>Event calendar details</div>"), // third
        getStoredUrls: vi.fn().mockResolvedValue(new Set<string>()),
        storeBlogPost: vi.fn().mockImplementation(async (post: BlogPost) => {
          storedPosts.push(post);
        }),
      };

      const result = await scrapeBlog(deps);
      expect(result.newPosts).toBeGreaterThan(0);
      expect(storedPosts.length).toBeGreaterThan(0);
      for (const post of storedPosts) {
        expect(post.source).toBe("official_blog");
        expect(post.url).toBeTruthy();
        expect(post.content).toBeTruthy();
      }
    });

    it("correctly identifies new blog posts by comparing against stored URLs", async () => {
      const storedUrls = new Set([
        "https://marvelstrikeforce.com/en/updates/patch-notes-8-5",
      ]);

      const deps: BlogScraperDeps = {
        fetchPage: vi.fn()
          .mockResolvedValueOnce(SAMPLE_UPDATES_HTML)
          .mockResolvedValue("<div>Blog content</div>"),
        getStoredUrls: vi.fn().mockResolvedValue(storedUrls),
        storeBlogPost: vi.fn(),
      };

      const result = await scrapeBlog(deps);
      // One URL is stored, rest should be new
      expect(result.skipped).toBe(1);
      expect(result.newPosts).toBeGreaterThan(0);
    });
  });

  describe("classifyBlogCategory", () => {
    it("classifies character kits", () => {
      expect(classifyBlogCategory("New Character Kit: Phoenix", "ability kit details")).toBe("character-kits");
    });

    it("classifies balance changes", () => {
      expect(classifyBlogCategory("Patch Notes 9.0", "balance update changes")).toBe("balance-change");
    });

    it("classifies news/events", () => {
      expect(classifyBlogCategory("Event Calendar May", "upcoming events")).toBe("news-events");
    });

    it("classifies guides", () => {
      expect(classifyBlogCategory("Beginner Guide", "tips and tutorial")).toBe("guide");
    });

    it("defaults to general", () => {
      expect(classifyBlogCategory("Random Post", "random content")).toBe("general");
    });
  });

  describe("chunkBlogContent", () => {
    it("creates a single chunk for short content", () => {
      const meta = { title: "Test Post", url: "https://example.com/test", publishedDate: "2026-04-29" };
      const chunks = chunkBlogContent("This is a short blog post about MSF.", meta);

      expect(chunks).toHaveLength(1);
      expect(chunks[0].sourceTier).toBe(2);
      expect(chunks[0].sourceType).toBe("official-blog");
      expect(chunks[0].sourceCreatorName).toBe("Scopely Official");
      expect(chunks[0].id).toMatch(/^blog-/);
    });

    it("splits long content into multiple chunks", () => {
      const longContent = Array(2000).fill("word").join(" ");
      const meta = { title: "Long Post", url: "https://example.com/long", publishedDate: "2026-04-29" };
      const chunks = chunkBlogContent(longContent, meta);

      expect(chunks.length).toBeGreaterThan(1);
      for (const chunk of chunks) {
        expect(chunk.sourceTier).toBe(2);
        expect(chunk.sourceType).toBe("official-blog");
      }
    });

    it("returns empty array for empty content", () => {
      const meta = { title: "Empty", url: "https://example.com/empty", publishedDate: "2026-04-29" };
      expect(chunkBlogContent("", meta)).toHaveLength(0);
    });

    it("uses slugified title in document IDs", () => {
      const meta = { title: "Patch Notes 8.5 — Balance", url: "https://example.com/patch", publishedDate: "2026-04-29" };
      const chunks = chunkBlogContent("Some content here", meta);
      expect(chunks[0].id).toMatch(/^blog-patch-notes-8-5-balance-0$/);
    });
  });
});
