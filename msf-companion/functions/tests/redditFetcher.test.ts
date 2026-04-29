import { describe, it, expect } from "vitest";
import { filterRelevantPosts, formatPostAsDocument, RedditPost } from "../src/lib/redditFetcher.js";

const samplePosts: RedditPost[] = [
  {
    id: "abc123",
    title: "Best war defense teams after the update",
    selftext: "After testing extensively, here are my recommendations for war defense...",
    score: 150,
    num_comments: 42,
    link_flair_text: "Strategy",
    created_utc: 1745900000,
    permalink: "/r/MarvelStrikeForce/comments/abc123/best_war_defense/",
  },
  {
    id: "meme1",
    title: "When you finally beat DD7",
    selftext: "Just a funny meme about DD7",
    score: 500,
    num_comments: 100,
    link_flair_text: "Humor",
    created_utc: 1745800000,
    permalink: "/r/MarvelStrikeForce/comments/meme1/when_you_finally/",
  },
  {
    id: "low1",
    title: "Quick question about ISO",
    selftext: "What ISO should I use?",
    score: 5,
    num_comments: 3,
    link_flair_text: null,
    created_utc: 1745700000,
    permalink: "/r/MarvelStrikeForce/comments/low1/quick_question/",
  },
  {
    id: "notext",
    title: "Link post with no text",
    selftext: "",
    score: 200,
    num_comments: 50,
    link_flair_text: "Discussion",
    created_utc: 1745600000,
    permalink: "/r/MarvelStrikeForce/comments/notext/link_post/",
  },
  {
    id: "good1",
    title: "DD7 team recommendations with data",
    selftext: "Based on my alliance's data, here are the best teams for DD7 node by node...",
    score: 300,
    num_comments: 80,
    link_flair_text: "Guide",
    created_utc: 1745500000,
    permalink: "/r/MarvelStrikeForce/comments/good1/dd7_teams/",
  },
];

describe("redditFetcher", () => {
  describe("filterRelevantPosts", () => {
    it("filters by score >= 30", () => {
      const filtered = filterRelevantPosts(samplePosts);
      expect(filtered.every((p) => p.score >= 30)).toBe(true);
      expect(filtered.find((p) => p.id === "low1")).toBeUndefined();
    });

    it("excludes humor/meme flair posts", () => {
      const filtered = filterRelevantPosts(samplePosts);
      expect(filtered.find((p) => p.id === "meme1")).toBeUndefined();
    });

    it("excludes posts with empty selftext", () => {
      const filtered = filterRelevantPosts(samplePosts);
      expect(filtered.find((p) => p.id === "notext")).toBeUndefined();
    });

    it("keeps high-quality strategy/guide posts", () => {
      const filtered = filterRelevantPosts(samplePosts);
      expect(filtered.find((p) => p.id === "abc123")).toBeDefined();
      expect(filtered.find((p) => p.id === "good1")).toBeDefined();
    });
  });

  describe("formatPostAsDocument", () => {
    it("creates a KB document with correct metadata", () => {
      const doc = formatPostAsDocument(samplePosts[0]);
      expect(doc.id).toBe("reddit-abc123");
      expect(doc.sourceTier).toBe(3);
      expect(doc.sourceType).toBe("reddit-post");
      expect(doc.sourceCreatorName).toBe("Reddit Community");
      expect(doc.sourceUrl).toContain("reddit.com");
      expect(doc.content).toContain("Best war defense teams");
    });

    it("classifies category from flair and title", () => {
      const warDoc = formatPostAsDocument(samplePosts[0]);
      expect(warDoc.category).toBe("war-meta");

      const ddDoc = formatPostAsDocument(samplePosts[4]);
      expect(ddDoc.category).toBe("dark-dimension");
    });

    it("converts created_utc to ISO date", () => {
      const doc = formatPostAsDocument(samplePosts[0]);
      expect(doc.sourceDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });
});
