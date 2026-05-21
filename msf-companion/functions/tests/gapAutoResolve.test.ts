import { describe, it, expect, vi } from "vitest";
import { resolveGaps, GapResolveDeps, GapRecord } from "../src/functions/gapAutoResolve";
import { InvocationContext } from "@azure/functions";

function createMockContext(): InvocationContext {
  return {
    log: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    trace: vi.fn(),
  } as unknown as InvocationContext;
}

const sampleGaps: GapRecord[] = [
  {
    id: "gap_001",
    clusteredQuestion: "Best team for DD7 node 10",
    category: "dark-dimension",
    gapType: "coverage_gap",
    autoResolveAction: "YouTube search queued for: Best team for DD7 node 10",
  },
  {
    id: "gap_002",
    clusteredQuestion: "Crucible defense meta 2025",
    category: "crucible",
    gapType: "coverage_gap",
    autoResolveAction: "YouTube search queued for: Crucible defense meta 2025",
  },
];

describe("gapAutoResolve", () => {
  it("resolves gaps when YouTube results are found", async () => {
    const context = createMockContext();
    const deps: GapResolveDeps = {
      fetchAutoResolvingGaps: vi.fn().mockResolvedValue(sampleGaps),
      searchYouTube: vi.fn().mockResolvedValue([
        {
          videoId: "abc123",
          title: "DD7 Node 10 Guide",
          description: "Complete walkthrough for DD7 node 10",
          channelTitle: "MSF Creator",
          publishedAt: "2025-01-15T00:00:00Z",
        },
      ]),
      uploadDocuments: vi.fn().mockResolvedValue({ succeeded: 1, failed: 0 }),
      markGapResolved: vi.fn().mockResolvedValue(undefined),
      markGapFailed: vi.fn().mockResolvedValue(undefined),
    };

    const result = await resolveGaps(deps, context);

    expect(result.resolved).toBe(2);
    expect(result.failed).toBe(0);
    expect(result.skipped).toBe(0);
    expect(deps.markGapResolved).toHaveBeenCalledTimes(2);
    expect(deps.markGapResolved).toHaveBeenCalledWith("gap_001");
    expect(deps.markGapResolved).toHaveBeenCalledWith("gap_002");
    expect(deps.uploadDocuments).toHaveBeenCalledTimes(2);
  });

  it("skips gaps when no YouTube results found", async () => {
    const context = createMockContext();
    const deps: GapResolveDeps = {
      fetchAutoResolvingGaps: vi.fn().mockResolvedValue([sampleGaps[0]]),
      searchYouTube: vi.fn().mockResolvedValue([]),
      uploadDocuments: vi.fn(),
      markGapResolved: vi.fn(),
      markGapFailed: vi.fn(),
    };

    const result = await resolveGaps(deps, context);

    expect(result.resolved).toBe(0);
    expect(result.skipped).toBe(1);
    expect(deps.uploadDocuments).not.toHaveBeenCalled();
    expect(deps.markGapResolved).not.toHaveBeenCalled();
  });

  it("marks gap as failed when upload fails", async () => {
    const context = createMockContext();
    const deps: GapResolveDeps = {
      fetchAutoResolvingGaps: vi.fn().mockResolvedValue([sampleGaps[0]]),
      searchYouTube: vi.fn().mockResolvedValue([
        {
          videoId: "xyz789",
          title: "Some video",
          description: "Desc",
          channelTitle: "Channel",
          publishedAt: "2025-02-01T00:00:00Z",
        },
      ]),
      uploadDocuments: vi.fn().mockResolvedValue({ succeeded: 0, failed: 1 }),
      markGapResolved: vi.fn(),
      markGapFailed: vi.fn().mockResolvedValue(undefined),
    };

    const result = await resolveGaps(deps, context);

    expect(result.resolved).toBe(0);
    expect(result.failed).toBe(1);
    expect(deps.markGapFailed).toHaveBeenCalledWith("gap_001");
    expect(deps.markGapResolved).not.toHaveBeenCalled();
  });

  it("returns zeros when no gaps exist", async () => {
    const context = createMockContext();
    const deps: GapResolveDeps = {
      fetchAutoResolvingGaps: vi.fn().mockResolvedValue([]),
      searchYouTube: vi.fn(),
      uploadDocuments: vi.fn(),
      markGapResolved: vi.fn(),
      markGapFailed: vi.fn(),
    };

    const result = await resolveGaps(deps, context);

    expect(result.resolved).toBe(0);
    expect(result.failed).toBe(0);
    expect(result.skipped).toBe(0);
    expect(deps.searchYouTube).not.toHaveBeenCalled();
  });

  it("handles errors gracefully and counts as failed", async () => {
    const context = createMockContext();
    const deps: GapResolveDeps = {
      fetchAutoResolvingGaps: vi.fn().mockResolvedValue([sampleGaps[0]]),
      searchYouTube: vi.fn().mockRejectedValue(new Error("API error")),
      uploadDocuments: vi.fn(),
      markGapResolved: vi.fn(),
      markGapFailed: vi.fn(),
    };

    const result = await resolveGaps(deps, context);

    expect(result.resolved).toBe(0);
    expect(result.failed).toBe(1);
    expect(result.skipped).toBe(0);
  });

  it("limits docs to 3 per gap from YouTube results", async () => {
    const context = createMockContext();
    const manyVideos = Array.from({ length: 5 }, (_, i) => ({
      videoId: `vid${i}`,
      title: `Video ${i}`,
      description: `Description ${i}`,
      channelTitle: `Channel ${i}`,
      publishedAt: "2025-01-01T00:00:00Z",
    }));

    const deps: GapResolveDeps = {
      fetchAutoResolvingGaps: vi.fn().mockResolvedValue([sampleGaps[0]]),
      searchYouTube: vi.fn().mockResolvedValue(manyVideos),
      uploadDocuments: vi.fn().mockResolvedValue({ succeeded: 3, failed: 0 }),
      markGapResolved: vi.fn().mockResolvedValue(undefined),
      markGapFailed: vi.fn(),
    };

    await resolveGaps(deps, context);

    // Should upload exactly 3 docs (the max per gap)
    const uploadCall = (deps.uploadDocuments as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(uploadCall).toHaveLength(3);
  });
});
