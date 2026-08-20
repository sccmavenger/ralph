import { describe, expect, it } from "vitest";
import {
  cleanKnowledgeText,
  createKnowledgeDocument,
  getSourceFreshness,
  inferLegacySourceType,
  sanitizeKnowledgeId,
} from "./kb-contract";

describe("knowledge document contract", () => {
  it("enforces source policy and operational metadata", () => {
    const doc = createKnowledgeDocument({
      id: "official/character:Spider-Man",
      content: "Spider-Man has <color=#fff568>Evade</color> and gains Speed Up.",
      category: "character-kits",
      sourceCreatorName: "MSF Game Data",
      sourceTitle: "Spider-Man kit",
      sourceUrl: "https://marvelstrikeforce.com/characters/spider-man",
      sourcePublishedAt: "2026-08-19",
      sourceType: "api-game-data",
    });

    expect(doc.id).toBe("official-character-Spider-Man");
    expect(doc.sourceTier).toBe(1);
    expect(doc.sourceType).toBe("api-game-data");
    expect(doc.content).not.toContain("<color");
    expect(doc.sourcePublishedAt).toBe("2026-08-19T00:00:00.000Z");
    expect(doc.contentHash).toMatch(/^[a-f0-9]{64}$/);
    expect(doc.lifecycleStatus).toBe("active");
  });

  it("rejects invalid dates and empty content", () => {
    expect(() => createKnowledgeDocument({
      id: "bad",
      content: "too short",
      category: "general",
      sourceCreatorName: "Source",
      sourceTitle: "Title",
      sourceUrl: "https://example.com",
      sourcePublishedAt: "not-a-date",
      sourceType: "reddit-post",
    })).toThrow();
  });

  it("normalizes legacy source metadata without calling every item a YouTube source", () => {
    expect(inferLegacySourceType({ id: "auto-1", sourceCreatorName: "AI Auto-Generated" })).toBe("ai-generated");
    expect(inferLegacySourceType({ id: "blog-weekly-0", sourceCreatorName: "Scopely Official" })).toBe("official-blog");
    expect(inferLegacySourceType({ id: "char-SpiderMan", sourceCreatorName: "MSF Game Data" })).toBe("api-game-data");
  });

  it("reports missing and stale source feeds against source-specific SLOs", () => {
    const now = new Date("2026-08-20T12:00:00Z");
    expect(getSourceFreshness("api-game-data", null, now).status).toBe("missing");
    expect(getSourceFreshness("api-game-data", "2026-08-18T00:00:00Z", now).status).toBe("stale");
    expect(getSourceFreshness("official-blog", "2026-08-18T00:00:00Z", now).status).toBe("healthy");
  });

  it("cleans markup and produces Azure Search-safe IDs", () => {
    expect(cleanKnowledgeText("A&nbsp;B <color=#fff>C</color>\n\n\nD")).toBe("A B C\n\nD");
    expect(sanitizeKnowledgeId("a/b:c d")).toBe("a-b-c-d");
    expect(sanitizeKnowledgeId("yt--8POFK5Ihow-0")).toBe("yt--8POFK5Ihow-0");
    expect(sanitizeKnowledgeId("yt-qc79A--Pm4I-0")).toBe("yt-qc79A--Pm4I-0");
  });
});
