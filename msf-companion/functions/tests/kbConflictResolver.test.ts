import { describe, it, expect, vi } from "vitest";
import { findConflictingTier4Docs, removeDocuments, ConflictResolverDeps } from "../src/lib/kbConflictResolver.js";
import type { KBDocument } from "../src/lib/kbGameData.js";

function makeDeps(overrides?: Partial<ConflictResolverDeps>): ConflictResolverDeps {
  return {
    searchDocuments: vi.fn().mockResolvedValue([]),
    deleteDocuments: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function makeDoc(overrides?: Partial<KBDocument>): KBDocument {
  return {
    id: "api-char-wolverine",
    content: "Wolverine is a Mutant Hero character with traits X-Men Brawler and abilities Adamantium Slash",
    category: "character-kits",
    sourceCreatorName: "MSF API (Official)",
    sourceVideoTitle: "Wolverine Kit",
    sourceUrl: "https://example.com",
    sourceDate: "2026-04-29",
    sourceTier: 1,
    sourceType: "api-game-data",
    ...overrides,
  };
}

describe("kbConflictResolver", () => {
  describe("findConflictingTier4Docs", () => {
    it("finds Tier 4 docs with overlapping content in the same category", async () => {
      const deps = makeDeps({
        searchDocuments: vi.fn().mockResolvedValue([
          {
            id: "gap-wolverine-1",
            category: "character-kits",
            content: "Wolverine abilities include Adamantium Slash and healing factor X-Men Brawler",
            sourceTier: 4,
          },
        ]),
      });

      const newDoc = makeDoc();
      const conflicts = await findConflictingTier4Docs(newDoc, deps);
      expect(conflicts).toContain("gap-wolverine-1");
    });

    it("does not flag Tier 4 docs with no content overlap", async () => {
      const deps = makeDeps({
        searchDocuments: vi.fn().mockResolvedValue([
          {
            id: "gap-ironman-1",
            category: "character-kits",
            content: "Iron Man tech hero repulsor blast energy beam powered armor",
            sourceTier: 4,
          },
        ]),
      });

      const newDoc = makeDoc();
      const conflicts = await findConflictingTier4Docs(newDoc, deps);
      expect(conflicts).not.toContain("gap-ironman-1");
    });

    it("returns empty array when new doc is Tier 4 (no self-conflict)", async () => {
      const deps = makeDeps();
      const newDoc = makeDoc({ sourceTier: 4 });
      const conflicts = await findConflictingTier4Docs(newDoc, deps);
      expect(conflicts).toHaveLength(0);
      expect(deps.searchDocuments).not.toHaveBeenCalled();
    });

    it("only targets Tier 4 documents (never Tier 1-3)", async () => {
      const deps = makeDeps({
        searchDocuments: vi.fn().mockResolvedValue([]),
      });

      const newDoc = makeDoc({ sourceTier: 1 });
      await findConflictingTier4Docs(newDoc, deps);

      // Verify the filter explicitly requests sourceTier eq 4
      const callArgs = (deps.searchDocuments as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(callArgs[0]).toContain("sourceTier eq 4");
    });
  });

  describe("removeDocuments", () => {
    it("calls deleteDocuments with the provided IDs", async () => {
      const deps = makeDeps();
      await removeDocuments(["doc-1", "doc-2"], deps);
      expect(deps.deleteDocuments).toHaveBeenCalledWith(["doc-1", "doc-2"]);
    });

    it("does nothing for empty ID array", async () => {
      const deps = makeDeps();
      await removeDocuments([], deps);
      expect(deps.deleteDocuments).not.toHaveBeenCalled();
    });
  });
});
