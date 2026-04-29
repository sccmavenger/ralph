import { describe, it, expect, vi } from "vitest";
import { syncMeta, MetaSyncDeps } from "../src/functions/kbMetaSync.js";
import { InvocationContext } from "@azure/functions";

function mockContext(): InvocationContext {
  return { log: vi.fn(), warn: vi.fn(), error: vi.fn() } as unknown as InvocationContext;
}

describe("kbMetaSync", () => {
  it("processes all three modes and uploads documents", async () => {
    const charNames = new Map([["char1", "Wolverine"], ["char2", "Spider-Man"], ["char3", "Iron Man"]]);
    const deps: MetaSyncDeps = {
      fetchCharacterNames: vi.fn().mockResolvedValue(charNames),
      fetchMetaTeams: vi.fn().mockResolvedValue([
        { characters: ["char1", "char2", "char3"], total: 1000, wins: 800, rank: 1 },
      ]),
      uploadDocuments: vi.fn().mockResolvedValue({ succeeded: 3, failed: 0 }),
    };

    const result = await syncMeta(deps, mockContext());
    expect(result.modes).toBe(3);
    expect(result.totalDocs).toBe(3);
    expect(result.errors).toBe(0);
    // Called 3 times: war-offense, war-defense, crucible-defense
    expect(deps.fetchMetaTeams).toHaveBeenCalledTimes(3);
  });

  it("continues when one mode fails", async () => {
    const deps: MetaSyncDeps = {
      fetchCharacterNames: vi.fn().mockResolvedValue(new Map()),
      fetchMetaTeams: vi.fn()
        .mockResolvedValueOnce([{ characters: ["c1"], total: 100, wins: 50, rank: 1 }])
        .mockRejectedValueOnce(new Error("API down"))
        .mockResolvedValueOnce([{ characters: ["c2"], total: 200, wins: 100, rank: 1 }]),
      uploadDocuments: vi.fn().mockResolvedValue({ succeeded: 2, failed: 0 }),
    };

    const result = await syncMeta(deps, mockContext());
    expect(result.errors).toBe(1);
    expect(result.totalDocs).toBe(2);
  });

  it("resolves character IDs to names", async () => {
    const charNames = new Map([["abc123", "Captain America"]]);
    const uploadMock = vi.fn().mockResolvedValue({ succeeded: 1, failed: 0 });
    const deps: MetaSyncDeps = {
      fetchCharacterNames: vi.fn().mockResolvedValue(charNames),
      fetchMetaTeams: vi.fn().mockResolvedValue([
        { characters: ["abc123"], total: 500, wins: 400, rank: 1 },
      ]),
      uploadDocuments: uploadMock,
    };

    await syncMeta(deps, mockContext());
    const uploadedDocs = uploadMock.mock.calls[0][0];
    expect(uploadedDocs[0].content).toContain("Captain America");
  });
});
