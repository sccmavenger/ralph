import { describe, it, expect, vi } from "vitest";
import { orchestrateGameDataSync, OrchestratorDeps } from "../src/functions/kbGameDataOrchestrator.js";
import { InvocationContext } from "@azure/functions";

function mockContext(): InvocationContext {
  return { log: vi.fn(), warn: vi.fn(), error: vi.fn() } as unknown as InvocationContext;
}

describe("kbGameDataOrchestrator", () => {
  it("runs all syncs in sequence and reports results", async () => {
    const deps: OrchestratorDeps = {
      syncCharacters: vi.fn().mockResolvedValue({ uploaded: 100 }),
      syncMeta: vi.fn().mockResolvedValue({ totalDocs: 150 }),
      syncDD: vi.fn().mockResolvedValue({ uploaded: 50 }),
      syncISO8: vi.fn().mockResolvedValue({ indexed: 200 }),
      syncGear: vi.fn().mockResolvedValue({ uploaded: 25 }),
    };

    const result = await orchestrateGameDataSync(deps, mockContext());

    expect(result.results).toHaveLength(5);
    expect(result.results.every((r) => r.success)).toBe(true);
    expect(result.totalDocs).toBe(525);
  });

  it("continues when individual syncs fail", async () => {
    const deps: OrchestratorDeps = {
      syncCharacters: vi.fn().mockResolvedValue({ uploaded: 100 }),
      syncMeta: vi.fn().mockRejectedValue(new Error("API timeout")),
      syncDD: vi.fn().mockResolvedValue({ uploaded: 50 }),
      syncISO8: vi.fn().mockRejectedValue(new Error("Auth failed")),
      syncGear: vi.fn().mockResolvedValue({ uploaded: 25 }),
    };

    const result = await orchestrateGameDataSync(deps, mockContext());

    expect(result.results).toHaveLength(5);
    expect(result.results.filter((r) => r.success)).toHaveLength(3);
    expect(result.results.filter((r) => !r.success)).toHaveLength(2);
    expect(result.totalDocs).toBe(175);

    const metaResult = result.results.find((r) => r.name === "meta");
    expect(metaResult?.error).toContain("API timeout");
  });

  it("handles all syncs failing gracefully", async () => {
    const deps: OrchestratorDeps = {
      syncCharacters: vi.fn().mockRejectedValue(new Error("fail")),
      syncMeta: vi.fn().mockRejectedValue(new Error("fail")),
      syncDD: vi.fn().mockRejectedValue(new Error("fail")),
      syncISO8: vi.fn().mockRejectedValue(new Error("fail")),
      syncGear: vi.fn().mockRejectedValue(new Error("fail")),
    };

    const result = await orchestrateGameDataSync(deps, mockContext());

    expect(result.results.every((r) => !r.success)).toBe(true);
    expect(result.totalDocs).toBe(0);
  });
});
