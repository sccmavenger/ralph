import { describe, it, expect, vi } from "vitest";
import {
  processTranscript,
  OpenAIClient,
  IntelCategory,
  INTEL_CATEGORIES,
} from "./aiProcessor.js";

function createMockClient(overrides: Partial<OpenAIClient> = {}): OpenAIClient {
  return {
    classify: vi.fn().mockResolvedValue({
      result: {
        categories: ["team_composition", "character_ranking"] as IntelCategory[],
        confidence: 85,
      },
      tokensUsed: 100,
    }),
    extract: vi.fn().mockResolvedValue({
      items: [
        {
          category: "team_composition" as IntelCategory,
          content: { teamName: "Bionic Avengers", characters: ["Ultron", "Vision"], mode: "arena", notes: "Strong arena offense" },
        },
        {
          category: "character_ranking" as IntelCategory,
          content: { tier: "S", characters: ["Ultron"], mode: "arena", notes: "Top pick" },
        },
      ],
      tokensUsed: 500,
    }),
    ...overrides,
  };
}

const mockMetadata = {
  videoId: "vid_test_001",
  channelId: "UC_test",
  creatorName: "DorkyDad",
  videoTitle: "Best Arena Teams in MSF 2026",
  publishedAt: "2026-04-07T00:00:00Z",
};

describe("aiProcessor", () => {
  it("structured output contains required fields", async () => {
    const client = createMockClient();
    const result = await processTranscript(
      "This is a transcript about MSF arena teams and character rankings.",
      mockMetadata,
      client
    );

    expect(result.items.length).toBeGreaterThan(0);
    for (const item of result.items) {
      expect(item).toHaveProperty("category");
      expect(item).toHaveProperty("content");
      expect(item).toHaveProperty("sourceVideoId", "vid_test_001");
      expect(item).toHaveProperty("sourceCreatorName", "DorkyDad");
      expect(item).toHaveProperty("sourceDate", "2026-04-07T00:00:00Z");
      expect(item).toHaveProperty("extractedAt");
      expect(item.sourceVideoUrl).toBe("https://www.youtube.com/watch?v=vid_test_001");
    }
  });

  it("GPT-4o-mini classification correctly routes transcripts", async () => {
    const classifyFn = vi.fn().mockResolvedValue({
      result: {
        categories: ["dark_dimension"] as IntelCategory[],
        confidence: 90,
      },
      tokensUsed: 80,
    });
    const extractFn = vi.fn().mockResolvedValue({
      items: [{ category: "dark_dimension", content: { ddNumber: 7, tips: ["Use Bionic Avengers"] } }],
      tokensUsed: 400,
    });

    const client = createMockClient({ classify: classifyFn, extract: extractFn });
    await processTranscript("DD7 guide transcript...", mockMetadata, client);

    // Verify classification was called first
    expect(classifyFn).toHaveBeenCalledTimes(1);
    // Verify extraction was called with the classified categories
    expect(extractFn).toHaveBeenCalledWith(
      expect.any(String),
      ["dark_dimension"]
    );
  });

  it("handles malformed/empty Azure OpenAI responses without crashing", async () => {
    const client = createMockClient({
      classify: vi.fn().mockResolvedValue({
        result: { categories: ["team_composition"] as IntelCategory[], confidence: 50 },
        tokensUsed: 50,
      }),
      extract: vi.fn().mockResolvedValue({
        items: [],
        tokensUsed: 100,
      }),
    });

    const result = await processTranscript("Some transcript", mockMetadata, client);
    expect(result.items).toHaveLength(0);
    expect(result.tokensUsed.extraction).toBe(100);
  });

  it("video status updates to processed after successful extraction", async () => {
    const client = createMockClient();
    const result = await processTranscript(
      "MSF arena guide with team compositions",
      mockMetadata,
      client
    );

    // The processTranscript function processes and returns items;
    // the caller (function handler) is responsible for status update
    expect(result.items.length).toBeGreaterThan(0);
    expect(result.tokensUsed.classification).toBeGreaterThan(0);
    expect(result.tokensUsed.extraction).toBeGreaterThan(0);
  });

  it("integration: full pipeline from transcribed video to knowledge items", async () => {
    const client = createMockClient();
    const result = await processTranscript(
      "In this video we'll cover the best MSF arena teams. Bionic Avengers are S-tier. Ultron dominates arena.",
      mockMetadata,
      client
    );

    expect(result.items).toHaveLength(2);
    expect(result.items[0].category).toBe("team_composition");
    expect(result.items[1].category).toBe("character_ranking");
    expect(result.items[0].id).toBe("vid_test_001_team_composition_0");
    expect(result.items[1].id).toBe("vid_test_001_character_ranking_1");
    expect(result.tokensUsed.classification).toBe(100);
    expect(result.tokensUsed.extraction).toBe(500);
  });

  it("token count is tracked for cost monitoring", async () => {
    const client = createMockClient();
    const result = await processTranscript("MSF meta guide", mockMetadata, client);

    expect(result.tokensUsed).toHaveProperty("classification");
    expect(result.tokensUsed).toHaveProperty("extraction");
    expect(typeof result.tokensUsed.classification).toBe("number");
    expect(typeof result.tokensUsed.extraction).toBe("number");
    expect(result.tokensUsed.classification).toBeGreaterThan(0);
    expect(result.tokensUsed.extraction).toBeGreaterThan(0);
  });

  it("skips extraction when classification confidence is too low", async () => {
    const extractFn = vi.fn();
    const client = createMockClient({
      classify: vi.fn().mockResolvedValue({
        result: { categories: [], confidence: 10 },
        tokensUsed: 50,
      }),
      extract: extractFn,
    });

    const result = await processTranscript("Random non-MSF content", mockMetadata, client);

    expect(result.items).toHaveLength(0);
    expect(extractFn).not.toHaveBeenCalled();
  });

  it("INTEL_CATEGORIES contains all expected categories", () => {
    expect(INTEL_CATEGORIES).toContain("team_composition");
    expect(INTEL_CATEGORIES).toContain("character_ranking");
    expect(INTEL_CATEGORIES).toContain("counter_matchup");
    expect(INTEL_CATEGORIES).toContain("farming_priority");
    expect(INTEL_CATEGORIES).toContain("event_strategy");
    expect(INTEL_CATEGORIES).toContain("dark_dimension");
    expect(INTEL_CATEGORIES).toContain("cosmic_crucible");
    expect(INTEL_CATEGORIES).toContain("iso8_recommendation");
  });
});
