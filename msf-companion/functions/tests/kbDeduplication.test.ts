import { describe, it, expect } from "vitest";
import { generateDocId, filterNewDocs } from "../src/lib/kbDeduplication.js";
import type { KBDocument } from "../src/lib/kbGameData.js";

describe("kbDeduplication", () => {
  describe("generateDocId", () => {
    it("generates deterministic IDs from source type and identifiers", () => {
      const id1 = generateDocId("api-char", "wolverine");
      const id2 = generateDocId("api-char", "wolverine");
      expect(id1).toBe(id2);
      expect(id1).toBe("api-char-wolverine");
    });

    it("handles multiple identifiers", () => {
      const id = generateDocId("api-meta", "war-offense", "1");
      expect(id).toBe("api-meta-war-offense-1");
    });

    it("slugifies special characters", () => {
      const id = generateDocId("blog", "Patch Notes 8.5 — Balance");
      expect(id).toBe("blog-patch-notes-8-5-balance");
    });

    it("handles identifiers with spaces and mixed case", () => {
      const id = generateDocId("api-iso8", "Captain America");
      expect(id).toBe("api-iso8-captain-america");
    });
  });

  describe("filterNewDocs", () => {
    const makeDocs = (ids: string[]): KBDocument[] =>
      ids.map((id) => ({
        id,
        content: "test",
        category: "test",
        sourceCreatorName: "test",
        sourceVideoTitle: "test",
        sourceUrl: "test",
        sourceDate: "2026-04-29",
        sourceTier: 1,
        sourceType: "test",
      }));

    it("filters out documents that already exist", () => {
      const docs = makeDocs(["doc-1", "doc-2", "doc-3"]);
      const existing = new Set(["doc-1", "doc-3"]);
      const filtered = filterNewDocs(docs, existing);
      expect(filtered).toHaveLength(1);
      expect(filtered[0].id).toBe("doc-2");
    });

    it("returns all documents when none exist", () => {
      const docs = makeDocs(["doc-1", "doc-2"]);
      const filtered = filterNewDocs(docs, new Set());
      expect(filtered).toHaveLength(2);
    });

    it("returns empty array when all exist", () => {
      const docs = makeDocs(["doc-1", "doc-2"]);
      const existing = new Set(["doc-1", "doc-2"]);
      const filtered = filterNewDocs(docs, existing);
      expect(filtered).toHaveLength(0);
    });
  });
});
