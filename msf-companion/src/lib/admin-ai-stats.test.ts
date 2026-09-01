import { describe, expect, it } from "vitest";
import {
  AIActionItemSummary,
  AdvisorMessageTelemetry,
  AdvisorQuestionTelemetry,
  buildAIStatsRange,
  buildAIStatsResponse,
  parseAIStatsRange,
} from "./admin-ai-stats";

const NOW = new Date("2026-08-31T12:00:00.000Z");

function question(
  id: string,
  createdAt: string,
  overrides: Partial<AdvisorQuestionTelemetry> = {},
): AdvisorQuestionTelemetry {
  return {
    id,
    commanderId: `commander-${id}`,
    question: `Question ${id}`,
    category: "roster",
    confidenceScore: 80,
    answeredSuccessfully: true,
    knowledgeSourcesUsed: [{ title: "Source" }],
    createdAt: new Date(createdAt),
    ...overrides,
  };
}

function message(
  id: string,
  createdAt: string,
  feedback: string | null,
): AdvisorMessageTelemetry {
  return {
    id,
    content: `Answer ${id}`,
    feedback,
    modelUsed: "gpt-test",
    createdAt: new Date(createdAt),
  };
}

describe("admin AI stats helpers", () => {
  it("accepts only the supported ranges and defaults to 30 days", () => {
    expect(parseAIStatsRange(null)).toBe(30);
    expect(parseAIStatsRange("7")).toBe(7);
    expect(parseAIStatsRange("30")).toBe(30);
    expect(parseAIStatsRange("90")).toBe(90);
    expect(parseAIStatsRange("")).toBeNull();
    expect(parseAIStatsRange("07")).toBeNull();
    expect(parseAIStatsRange("14")).toBeNull();
    expect(parseAIStatsRange("30days")).toBeNull();
  });

  it("creates adjacent equal UTC windows", () => {
    const range = buildAIStatsRange(7, NOW);
    expect(range).toEqual({
      days: 7,
      start: "2026-08-25T00:00:00.000Z",
      end: "2026-09-01T00:00:00.000Z",
      previousStart: "2026-08-18T00:00:00.000Z",
      previousEnd: "2026-08-25T00:00:00.000Z",
      timezone: "UTC",
    });
  });

  it("uses null rates for zero denominators and flags satisfaction as insufficient", () => {
    const response = buildAIStatsResponse({
      range: buildAIStatsRange(7, NOW),
      asOf: NOW,
      questions: [],
      messages: [],
      tokenUsage: [],
      gaps: [],
      actionItems: [],
    });

    expect(response.kpis.find((kpi) => kpi.id === "classified-pass")?.value).toBeNull();
    expect(response.kpis.find((kpi) => kpi.id === "grounded")?.status).toBe("insufficient-data");
    expect(response.kpis.find((kpi) => kpi.id === "rating-coverage")?.value).toBeNull();
    expect(response.kpis.find((kpi) => kpi.id === "satisfaction")).toMatchObject({
      value: null,
      sampleSize: 0,
      status: "insufficient-data",
    });
    expect(response.kpis.find((kpi) => kpi.id === "tokens-per-answer")?.value).toBeNull();
    expect(response.dailyTrend).toHaveLength(7);
  });

  it("calculates current-versus-prior changes from the same-sized windows", () => {
    const currentDates = [
      "2026-08-30T01:00:00.000Z",
      "2026-08-30T02:00:00.000Z",
      "2026-08-31T01:00:00.000Z",
      "2026-08-31T02:00:00.000Z",
    ];
    const previousDates = [
      "2026-08-23T01:00:00.000Z",
      "2026-08-24T01:00:00.000Z",
    ];
    const questions = [
      ...currentDates.map((date, index) => question(`c${index}`, date, {
        commanderId: index < 2 ? "same-current-user" : `current-user-${index}`,
        answeredSuccessfully: index !== 3,
        confidenceScore: index === 3 ? 40 : 80,
        knowledgeSourcesUsed: index === 2 ? [] : [{ title: "Source" }],
      })),
      ...previousDates.map((date, index) => question(`p${index}`, date, {
        commanderId: "same-previous-user",
        answeredSuccessfully: index === 0,
      })),
    ];
    const currentMessages = Array.from({ length: 10 }, (_, index) =>
      message(`mc${index}`, currentDates[index % currentDates.length], index < 8 ? "positive" : "negative"),
    );
    const previousMessages = [
      message("mp1", previousDates[0], "positive"),
      message("mp2", previousDates[1], "negative"),
    ];
    const actionItems: AIActionItemSummary[] = [];

    const response = buildAIStatsResponse({
      range: buildAIStatsRange(7, NOW),
      asOf: NOW,
      questions,
      messages: [...currentMessages, ...previousMessages],
      tokenUsage: [
        { id: "tc", date: new Date("2026-08-31T00:00:00.000Z"), tokensUsed: 400 },
        { id: "tp", date: new Date("2026-08-24T00:00:00.000Z"), tokensUsed: 100 },
      ],
      gaps: [],
      actionItems,
    });

    expect(response.kpis.find((kpi) => kpi.id === "completed-answers")).toMatchObject({
      value: 4,
      previousValue: 2,
      change: 100,
      changeType: "percent",
    });
    expect(response.kpis.find((kpi) => kpi.id === "classified-pass")).toMatchObject({
      value: 75,
      previousValue: 50,
      change: 25,
      changeType: "percentage-points",
      status: "watch",
    });
    expect(response.kpis.find((kpi) => kpi.id === "satisfaction")).toMatchObject({
      value: 80,
      previousValue: 50,
      sampleSize: 10,
      status: "watch",
    });
    expect(response.kpis.find((kpi) => kpi.id === "tokens-per-answer")).toMatchObject({
      value: 100,
      previousValue: 50,
      change: 100,
    });
  });
});
