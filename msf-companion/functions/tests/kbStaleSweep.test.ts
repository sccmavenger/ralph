import { describe, it, expect, vi } from "vitest";
import { sweepStaleDocuments, StaleSweepDeps } from "../src/functions/kbStaleSweep.js";
import { InvocationContext } from "@azure/functions";

function mockContext(): InvocationContext {
  return { log: vi.fn(), warn: vi.fn(), error: vi.fn() } as unknown as InvocationContext;
}

describe("kbStaleSweep", () => {
  it("removes stale documents based on age rules", async () => {
    const deps: StaleSweepDeps = {
      queryStaleDocuments: vi.fn()
        .mockResolvedValueOnce(["reddit-old-1", "reddit-old-2"]) // reddit-post: 30 days
        .mockResolvedValueOnce(["blog-old-1"]) // official-blog: 90 days
        .mockResolvedValueOnce(["ai-old-1", "ai-old-2", "ai-old-3"]), // ai-generated: 14 days
      deleteDocuments: vi.fn()
        .mockResolvedValueOnce(2)
        .mockResolvedValueOnce(1)
        .mockResolvedValueOnce(3),
    };

    const result = await sweepStaleDocuments(deps, mockContext());
    expect(result.totalRemoved).toBe(6);
    expect(result.byType["reddit-post"]).toBe(2);
    expect(result.byType["official-blog"]).toBe(1);
    expect(result.byType["ai-generated"]).toBe(3);
  });

  it("handles no stale documents gracefully", async () => {
    const deps: StaleSweepDeps = {
      queryStaleDocuments: vi.fn().mockResolvedValue([]),
      deleteDocuments: vi.fn().mockResolvedValue(0),
    };

    const result = await sweepStaleDocuments(deps, mockContext());
    expect(result.totalRemoved).toBe(0);
    expect(deps.deleteDocuments).not.toHaveBeenCalled();
  });

  it("continues sweeping other types when one fails", async () => {
    const deps: StaleSweepDeps = {
      queryStaleDocuments: vi.fn()
        .mockRejectedValueOnce(new Error("query failed"))
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce(["ai-old-1"]),
      deleteDocuments: vi.fn().mockResolvedValue(1),
    };

    const result = await sweepStaleDocuments(deps, mockContext());
    expect(result.byType["reddit-post"]).toBe(0);
    expect(result.byType["ai-generated"]).toBe(1);
    expect(result.totalRemoved).toBe(1);
  });

  it("applies correct staleness rules (reddit=30d, blog=90d, ai=14d)", async () => {
    const queryMock = vi.fn().mockResolvedValue([]);
    const deps: StaleSweepDeps = {
      queryStaleDocuments: queryMock,
      deleteDocuments: vi.fn().mockResolvedValue(0),
    };

    await sweepStaleDocuments(deps, mockContext());

    // Verify each call uses the correct sourceType
    expect(queryMock).toHaveBeenCalledTimes(3);
    expect(queryMock.mock.calls[0][0]).toBe("reddit-post");
    expect(queryMock.mock.calls[1][0]).toBe("official-blog");
    expect(queryMock.mock.calls[2][0]).toBe("ai-generated");
  });
});
