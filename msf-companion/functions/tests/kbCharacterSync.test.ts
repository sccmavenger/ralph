import { describe, it, expect, vi } from "vitest";
import { syncCharacterKits, CharacterSyncDeps } from "../src/functions/kbCharacterSync.js";
import { InvocationContext } from "@azure/functions";

function mockContext(): InvocationContext {
  return {
    log: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  } as unknown as InvocationContext;
}

describe("kbCharacterSync", () => {
  it("fetches characters and uploads documents", async () => {
    const deps: CharacterSyncDeps = {
      fetchCharacters: vi.fn().mockResolvedValue([
        {
          id: "wolverine",
          name: "Wolverine",
          traits: ["Mutant", "Hero"],
          abilities: [{ name: "Slash", description: "Attack" }],
          teams: ["X-Men"],
        },
        {
          id: "spider-man",
          name: "Spider-Man",
          traits: ["Bio", "Hero"],
          abilities: [{ name: "Web", description: "Web attack" }],
          teams: ["Web Warriors"],
        },
      ]),
      uploadDocuments: vi.fn().mockResolvedValue({ succeeded: 2, failed: 0 }),
    };

    const result = await syncCharacterKits(deps, mockContext());

    expect(result.total).toBe(2);
    expect(result.uploaded).toBe(2);
    expect(result.errors).toBe(0);
    expect(deps.uploadDocuments).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          id: "api-char-wolverine",
          sourceTier: 1,
          sourceType: "api-game-data",
        }),
        expect.objectContaining({
          id: "api-char-spider-man",
          sourceTier: 1,
          sourceType: "api-game-data",
        }),
      ])
    );
  });

  it("continues on individual character errors", async () => {
    const deps: CharacterSyncDeps = {
      fetchCharacters: vi.fn().mockResolvedValue([
        {
          id: "wolverine",
          name: "Wolverine",
          traits: ["Mutant"],
          abilities: [],
          teams: [],
        },
      ]),
      uploadDocuments: vi.fn().mockResolvedValue({ succeeded: 1, failed: 0 }),
    };

    const result = await syncCharacterKits(deps, mockContext());
    expect(result.total).toBe(1);
    expect(result.uploaded).toBe(1);
  });

  it("handles empty character list", async () => {
    const deps: CharacterSyncDeps = {
      fetchCharacters: vi.fn().mockResolvedValue([]),
      uploadDocuments: vi.fn().mockResolvedValue({ succeeded: 0, failed: 0 }),
    };

    const result = await syncCharacterKits(deps, mockContext());
    expect(result.total).toBe(0);
    expect(result.uploaded).toBe(0);
  });
});
