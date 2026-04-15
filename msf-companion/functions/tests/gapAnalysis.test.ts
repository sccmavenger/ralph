import { describe, it, expect, vi } from "vitest";
import { analyzeGaps, GapAnalysisDeps } from "../src/functions/gapAnalysis";
import { InvocationContext } from "@azure/functions";

function createMockContext(): InvocationContext {
  return {
    log: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    trace: vi.fn(),
  } as unknown as InvocationContext;
}

describe("gapAnalysis", () => {
  it("handles empty question log gracefully", async () => {
    const deps: GapAnalysisDeps = {
      fetchFailedQuestions: vi.fn().mockResolvedValue([]),
      fetchExistingGaps: vi.fn().mockResolvedValue([]),
      clusterQuestions: vi.fn().mockResolvedValue([]),
      upsertGap: vi.fn(),
      incrementGapFrequency: vi.fn(),
    };

    const result = await analyzeGaps(deps, createMockContext());
    expect(result).toEqual({ gapsCreated: 0, gapsUpdated: 0 });
    expect(deps.clusterQuestions).not.toHaveBeenCalled();
  });

  it("creates new gaps from failed questions", async () => {
    const deps: GapAnalysisDeps = {
      fetchFailedQuestions: vi.fn().mockResolvedValue([
        { question: "Best team for DD7 node 10?", category: "dark-dimension" },
        { question: "DD7 node 10 tips", category: "dark-dimension" },
      ]),
      fetchExistingGaps: vi.fn().mockResolvedValue([]),
      clusterQuestions: vi.fn().mockResolvedValue([
        {
          clusteredQuestion: "Best team for DD7 node 10?",
          category: "dark-dimension",
          gapType: "coverage_gap",
          questions: [
            "Best team for DD7 node 10?",
            "DD7 node 10 tips",
          ],
        },
      ]),
      upsertGap: vi.fn(),
      incrementGapFrequency: vi.fn(),
    };

    const result = await analyzeGaps(deps, createMockContext());
    expect(result).toEqual({ gapsCreated: 1, gapsUpdated: 0 });
    expect(deps.upsertGap).toHaveBeenCalledWith(
      expect.objectContaining({
        clusteredQuestion: "Best team for DD7 node 10?",
        category: "dark-dimension",
        gapType: "coverage_gap",
        frequency: 2,
        status: "auto_resolving",
      })
    );
  });

  it("increments frequency for existing gaps", async () => {
    const deps: GapAnalysisDeps = {
      fetchFailedQuestions: vi.fn().mockResolvedValue([
        { question: "Who should I farm?", category: "farming" },
      ]),
      fetchExistingGaps: vi.fn().mockResolvedValue([
        {
          id: "gap-1",
          clusteredQuestion: "Who should I farm?",
          category: "farming",
          frequency: 3,
        },
      ]),
      clusterQuestions: vi.fn().mockResolvedValue([
        {
          clusteredQuestion: "Who should I farm?",
          category: "farming",
          gapType: "coverage_gap",
          questions: ["Who should I farm?"],
        },
      ]),
      upsertGap: vi.fn(),
      incrementGapFrequency: vi.fn(),
    };

    const result = await analyzeGaps(deps, createMockContext());
    expect(result).toEqual({ gapsCreated: 0, gapsUpdated: 1 });
    expect(deps.incrementGapFrequency).toHaveBeenCalledWith("gap-1", 1);
  });

  it("classifies gap type correctly", async () => {
    const deps: GapAnalysisDeps = {
      fetchFailedQuestions: vi.fn().mockResolvedValue([
        { question: "Can you auto-equip gear?", category: "general" },
      ]),
      fetchExistingGaps: vi.fn().mockResolvedValue([]),
      clusterQuestions: vi.fn().mockResolvedValue([
        {
          clusteredQuestion: "Can you auto-equip gear?",
          category: "general",
          gapType: "feature_gap",
          questions: ["Can you auto-equip gear?"],
        },
      ]),
      upsertGap: vi.fn(),
      incrementGapFrequency: vi.fn(),
    };

    const result = await analyzeGaps(deps, createMockContext());
    expect(result).toEqual({ gapsCreated: 1, gapsUpdated: 0 });
    expect(deps.upsertGap).toHaveBeenCalledWith(
      expect.objectContaining({
        gapType: "feature_gap",
        status: "open",
        autoResolveAction: undefined,
      })
    );
  });

  it("coverage_gap triggers auto-resolve action", async () => {
    const deps: GapAnalysisDeps = {
      fetchFailedQuestions: vi.fn().mockResolvedValue([
        { question: "Best Crucible defense?", category: "crucible" },
      ]),
      fetchExistingGaps: vi.fn().mockResolvedValue([]),
      clusterQuestions: vi.fn().mockResolvedValue([
        {
          clusteredQuestion: "Best Crucible defense?",
          category: "crucible",
          gapType: "coverage_gap",
          questions: ["Best Crucible defense?"],
        },
      ]),
      upsertGap: vi.fn(),
      incrementGapFrequency: vi.fn(),
    };

    await analyzeGaps(deps, createMockContext());
    expect(deps.upsertGap).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "auto_resolving",
        autoResolveAction: expect.stringContaining("YouTube search queued"),
      })
    );
  });

  it("creates separate gaps for distinct questions", async () => {
    const deps: GapAnalysisDeps = {
      fetchFailedQuestions: vi.fn().mockResolvedValue([
        { question: "DD7 tips", category: "dark-dimension" },
        { question: "Arena meta", category: "general" },
      ]),
      fetchExistingGaps: vi.fn().mockResolvedValue([]),
      clusterQuestions: vi.fn().mockResolvedValue([
        {
          clusteredQuestion: "DD7 tips",
          category: "dark-dimension",
          gapType: "source_gap",
          questions: ["DD7 tips"],
        },
        {
          clusteredQuestion: "Arena meta",
          category: "general",
          gapType: "coverage_gap",
          questions: ["Arena meta"],
        },
      ]),
      upsertGap: vi.fn(),
      incrementGapFrequency: vi.fn(),
    };

    const result = await analyzeGaps(deps, createMockContext());
    expect(result).toEqual({ gapsCreated: 2, gapsUpdated: 0 });
    expect(deps.upsertGap).toHaveBeenCalledTimes(2);
  });
});
