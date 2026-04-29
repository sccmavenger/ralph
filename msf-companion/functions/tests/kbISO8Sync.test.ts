import { describe, it, expect, vi } from "vitest";
import { syncISO8, ISO8SyncDeps } from "../src/functions/kbISO8Sync.js";
import { InvocationContext } from "@azure/functions";

function mockContext(): InvocationContext {
  return { log: vi.fn(), warn: vi.fn(), error: vi.fn() } as unknown as InvocationContext;
}

describe("kbISO8Sync", () => {
  it("indexes characters with high confidence ISO data", async () => {
    const deps: ISO8SyncDeps = {
      fetchISO8Data: vi.fn().mockResolvedValue([
        {
          characterId: "wolverine",
          characterName: "Wolverine",
          isoData: { topClass: "Skirmisher", topClassPercent: 78.5, runnerUps: [{ className: "Raider", percent: 15 }] },
        },
      ]),
      uploadDocuments: vi.fn().mockResolvedValue({ succeeded: 1, failed: 0 }),
    };

    const result = await syncISO8(deps, mockContext());
    expect(result.indexed).toBe(1);
    expect(result.filtered).toBe(0);
  });

  it("filters characters with low confidence (<=50%)", async () => {
    const deps: ISO8SyncDeps = {
      fetchISO8Data: vi.fn().mockResolvedValue([
        {
          characterId: "minion",
          characterName: "Hydra Minion",
          isoData: { topClass: "Fortifier", topClassPercent: 40, runnerUps: [] },
        },
        {
          characterId: "wolverine",
          characterName: "Wolverine",
          isoData: { topClass: "Skirmisher", topClassPercent: 75, runnerUps: [] },
        },
      ]),
      uploadDocuments: vi.fn().mockResolvedValue({ succeeded: 1, failed: 0 }),
    };

    const result = await syncISO8(deps, mockContext());
    expect(result.indexed).toBe(1);
    expect(result.filtered).toBe(1);
    expect(result.total).toBe(2);
  });

  it("handles empty ISO data", async () => {
    const deps: ISO8SyncDeps = {
      fetchISO8Data: vi.fn().mockResolvedValue([]),
      uploadDocuments: vi.fn().mockResolvedValue({ succeeded: 0, failed: 0 }),
    };

    const result = await syncISO8(deps, mockContext());
    expect(result.total).toBe(0);
    expect(result.indexed).toBe(0);
  });
});
