import { describe, it, expect, vi } from "vitest";
import { stripSrtFormatting } from "./transcriptExtractor.js";
import { processVideoTranscript, TranscriptDeps } from "./transcriptPipeline.js";
import { InvocationContext } from "@azure/functions";

function createMockContext(): InvocationContext {
  return {
    log: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  } as unknown as InvocationContext;
}

function createMockDeps(overrides: Partial<TranscriptDeps> = {}): TranscriptDeps {
  const patchCalls: Array<{ path: string; value: unknown }[]> = [];
  return {
    videosContainer: {
      item: () => ({
        patch: vi.fn().mockImplementation((ops) => {
          patchCalls.push(ops);
          return Promise.resolve({});
        }),
      }),
    } as unknown as TranscriptDeps["videosContainer"],
    extractTranscript: vi.fn().mockResolvedValue({
      transcript: "This is a test transcript about MSF teams.",
      source: "official" as const,
    }),
    apiKey: "test-key",
    ...overrides,
    _patchCalls: patchCalls,
  } as TranscriptDeps & { _patchCalls: typeof patchCalls };
}

describe("stripSrtFormatting", () => {
  it("strips SRT sequence numbers and timestamps", () => {
    const srt = `1
00:00:01,000 --> 00:00:05,000
Hello world

2
00:00:05,000 --> 00:00:10,000
This is a test`;

    const result = stripSrtFormatting(srt);
    expect(result).toBe("Hello world This is a test");
  });

  it("handles empty input", () => {
    expect(stripSrtFormatting("")).toBe("");
  });
});

describe("processVideoTranscript", () => {
  it("successfully extracts transcript when official captions return data", async () => {
    const deps = createMockDeps();
    const context = createMockContext();

    const result = await processVideoTranscript("vid_001", "UC_ch1", deps, context);

    expect(result.status).toBe("transcribed");
    expect(result.source).toBe("official");
  });

  it("falls back to community library when official captions return 404", async () => {
    const deps = createMockDeps({
      extractTranscript: vi.fn().mockResolvedValue({
        transcript: "Community transcript content here.",
        source: "community" as const,
      }),
    });
    const context = createMockContext();

    const result = await processVideoTranscript("vid_002", "UC_ch1", deps, context);

    expect(result.status).toBe("transcribed");
    expect(result.source).toBe("community");
  });

  it("sets status to transcript_failed when both methods fail", async () => {
    const deps = createMockDeps({
      extractTranscript: vi.fn().mockResolvedValue(null),
    });
    const context = createMockContext();

    const result = await processVideoTranscript("vid_003", "UC_ch1", deps, context);

    expect(result.status).toBe("transcript_failed");
    expect(result.error).toContain("No transcript available");
  });

  it("handles empty transcript response", async () => {
    const deps = createMockDeps({
      extractTranscript: vi.fn().mockResolvedValue(null),
    });
    const context = createMockContext();

    const result = await processVideoTranscript("vid_004", "UC_ch1", deps, context);

    expect(result.status).toBe("transcript_failed");
  });

  it("handles API timeout without unhandled exceptions", async () => {
    const deps = createMockDeps({
      extractTranscript: vi.fn().mockRejectedValue(new Error("Timeout")),
    });
    const context = createMockContext();

    const result = await processVideoTranscript("vid_005", "UC_ch1", deps, context);

    expect(result.status).toBe("transcript_failed");
    expect(result.error).toContain("Timeout");
    // Should not throw
  });

  it("integration: full pipeline from discovered to transcribed", async () => {
    const patches: Array<Array<{ op: string; path: string; value: unknown }>> = [];
    const deps = createMockDeps({
      videosContainer: {
        item: () => ({
          patch: vi.fn().mockImplementation((ops) => {
            patches.push(ops);
            return Promise.resolve({});
          }),
        }),
      } as unknown as TranscriptDeps["videosContainer"],
    });
    const context = createMockContext();

    const result = await processVideoTranscript("vid_int", "UC_ch1", deps, context);

    expect(result.status).toBe("transcribed");
    expect(patches.length).toBe(1);
    const statusPatch = patches[0].find((p) => p.path === "/status");
    expect(statusPatch?.value).toBe("transcribed");
    const transcriptPatch = patches[0].find((p) => p.path === "/transcript");
    expect(transcriptPatch?.value).toBeTruthy();
  });
});
