import { describe, expect, it } from "vitest";
import {
  buildAdminBusinessInsights,
  buildBusinessInsightsRange,
  BuildAdminBusinessInsightsInput,
  BusinessAdvisorQuestionTelemetry,
  BusinessKnowledgeGapTelemetry,
} from "./admin-business-insights";

const AS_OF = new Date("2026-08-31T12:00:00.000Z");
const CURRENT = new Date("2026-08-15T12:00:00.000Z");
const PREVIOUS = new Date("2026-07-15T12:00:00.000Z");

function makeInput(
  overrides: Partial<BuildAdminBusinessInsightsInput> = {},
): BuildAdminBusinessInsightsInput {
  return {
    days: 30,
    asOf: AS_OF,
    usageEvents: [],
    questions: [],
    messages: [],
    gaps: [],
    commanders: [],
    cancellationCases: [],
    ...overrides,
  };
}

function question(
  commanderId: string,
  category = "general",
  answeredSuccessfully = true,
  createdAt = CURRENT,
): BusinessAdvisorQuestionTelemetry {
  return {
    commanderId,
    category,
    confidenceScore: answeredSuccessfully ? 82 : 42,
    answeredSuccessfully,
    createdAt,
  };
}

function gap(index: number, frequency = 1): BusinessKnowledgeGapTelemetry {
  return {
    category: index % 2 === 0 ? "general" : "war",
    frequency,
    status: "open",
    createdAt: new Date(`2026-06-${String(index + 1).padStart(2, "0")}T12:00:00.000Z`),
    resolvedAt: null,
  };
}

describe("buildBusinessInsightsRange", () => {
  it("uses equal adjacent UTC calendar windows", () => {
    expect(buildBusinessInsightsRange(30, AS_OF)).toEqual({
      days: 30,
      start: "2026-08-02T00:00:00.000Z",
      end: "2026-09-01T00:00:00.000Z",
      previousStart: "2026-07-03T00:00:00.000Z",
      previousEnd: "2026-08-02T00:00:00.000Z",
      timezone: "UTC",
    });
  });
});

describe("buildAdminBusinessInsights", () => {
  it("measures distinct behavior, adoption, return, onboarding, and cancellation cohorts", () => {
    const result = buildAdminBusinessInsights(makeInput({
      usageEvents: [
        { commanderId: "c1", eventType: "page_view", eventName: "/dashboard", tier: "FREE", createdAt: CURRENT },
        { commanderId: "c1", eventType: "page_view", eventName: "/dashboard/offers", tier: "FREE", createdAt: CURRENT },
        { commanderId: "c2", eventType: "page_view", eventName: "/roster", tier: "PREMIUM", createdAt: CURRENT },
        { commanderId: "c1", eventType: "page_view", eventName: "/dashboard", tier: "FREE", createdAt: PREVIOUS },
        { commanderId: "c4", eventType: "page_view", eventName: "/heroes", tier: "FREE", createdAt: PREVIOUS },
      ],
      questions: [
        question("c1"),
        question("c1"),
        question("c3"),
        question("c3", "war", true, PREVIOUS),
        question("c5", "war", true, PREVIOUS),
      ],
      commanders: [
        { id: "new-1", createdAt: CURRENT, hasCompletedOnboarding: true },
        { id: "new-2", createdAt: CURRENT, hasCompletedOnboarding: false },
        { id: "old", createdAt: PREVIOUS, hasCompletedOnboarding: true },
      ],
      cancellationCases: [
        { cancellationRequestedAt: CURRENT, cancellationReversedAt: null, firstRespondedAt: CURRENT, reviewStatus: "new", actionedAt: null, closedAt: null },
        { cancellationRequestedAt: CURRENT, cancellationReversedAt: null, firstRespondedAt: null, reviewStatus: "awaiting_response", actionedAt: null, closedAt: null },
        { cancellationRequestedAt: CURRENT, cancellationReversedAt: CURRENT, firstRespondedAt: null, reviewStatus: "closed", actionedAt: null, closedAt: CURRENT },
        { cancellationRequestedAt: PREVIOUS, cancellationReversedAt: null, firstRespondedAt: PREVIOUS, reviewStatus: "actioned", actionedAt: PREVIOUS, closedAt: null },
      ],
    }));

    expect(result.productUsage).toMatchObject({
      telemetryStatus: "partial",
      activeUsers: 3,
      previousActiveUsers: 4,
      activeUserChangePercent: -25,
      returningUsers: 2,
      returnRate: 50,
      pageViews: 3,
      viewsPerActiveUser: 1,
      advisorUsers: 2,
      previousAdvisorUsers: 2,
      advisorAdoptionRate: 66.7,
      advisorAnswers: 3,
      answersPerAdvisorUser: 1.5,
      multiQuestionUsers: 1,
      multiQuestionRate: 50,
      aiReturningUsers: 1,
      aiReturnRate: 50,
      newCommanders: 2,
      onboardingCompleted: 1,
      onboardingCompletionRate: 50,
      cancellationRequests: 2,
      previousCancellationRequests: 1,
      cancellationRequestChangePercent: 100,
      cancellationResponses: 1,
      cancellationResponseRate: 50,
      cancellationReversals: 1,
      unactionedCancellationResponses: 1,
    });
  });

  it("builds canonical product-area reach, repeat use, and distinct tier reach", () => {
    const result = buildAdminBusinessInsights(makeInput({
      usageEvents: [
        { commanderId: "free-1", eventType: "page_view", eventName: "/roster", tier: "FREE", createdAt: CURRENT },
        { commanderId: "free-1", eventType: "page_view", eventName: "/roster/characters", tier: "FREE", createdAt: CURRENT },
        { commanderId: "premium-1", eventType: "page_view", eventName: "/roster", tier: "PREMIUM", createdAt: CURRENT },
        { commanderId: "premium-1", eventType: "page_view", eventName: "/roster", tier: "PREMIUM", createdAt: PREVIOUS },
        { commanderId: "gone", eventType: "page_view", eventName: "/roster", tier: "FREE", createdAt: PREVIOUS },
        { commanderId: "free-1", eventType: "feature_use", eventName: "roster_sync", tier: "FREE", createdAt: CURRENT },
      ],
    }));

    expect(result.productAreas[0]).toMatchObject({
      id: "roster",
      uniqueUsers: 2,
      pageViews: 3,
      adoptionRate: 100,
      returningUsers: 1,
      returnRate: 50,
      freeUsers: 1,
      premiumUsers: 1,
    });
  });

  it("turns concentrated quality, missing ratings, and fragmented gaps into measurable actions", () => {
    const questions = Array.from({ length: 10 }, (_, index) =>
      question(`commander-${index}`, "general", index < 4),
    );
    const result = buildAdminBusinessInsights(makeInput({
      questions,
      messages: Array.from({ length: 12 }, () => ({ feedback: null, createdAt: CURRENT })),
      gaps: Array.from({ length: 8 }, (_, index) => gap(index)),
    }));

    const quality = result.actionableInsights.find(
      (item) => item.sourceId === "business:quality:general",
    );
    expect(quality).toMatchObject({
      kind: "improvement",
      priority: "critical",
      baselineValue: 40,
      targetValue: 85,
      metricUnit: "percent",
      drilldown: { metric: "classified-pass", category: "general" },
      sampleSize: 10,
    });
    expect(quality?.observation).toContain("40% classified pass");
    expect(quality?.recommendedAction).toContain("Review the failed General answers");
    expect(quality?.successMeasure).toContain("at least 85%");

    expect(result.actionableInsights).toEqual(expect.arrayContaining([
      expect.objectContaining({
        sourceId: "business:measurement:advisor-ratings",
        baselineValue: 0,
        targetValue: 10,
      }),
      expect.objectContaining({
        sourceId: "business:knowledge-gap:fragmentation",
        baselineValue: 100,
        targetValue: 50,
      }),
    ]));
  });

  it("surfaces Advisor depth, a product entry point, and cancellation follow-up", () => {
    const result = buildAdminBusinessInsights(makeInput({
      usageEvents: [
        { commanderId: "a", eventType: "page_view", eventName: "/roster", tier: "FREE", createdAt: CURRENT },
        { commanderId: "b", eventType: "page_view", eventName: "/roster", tier: "PREMIUM", createdAt: CURRENT },
        { commanderId: "c", eventType: "page_view", eventName: "/heroes", tier: "FREE", createdAt: CURRENT },
      ],
      questions: [
        ...Array.from({ length: 4 }, () => question("a")),
        ...Array.from({ length: 3 }, () => question("b")),
        ...Array.from({ length: 3 }, () => question("c")),
      ],
      cancellationCases: [
        { cancellationRequestedAt: PREVIOUS, cancellationReversedAt: null, firstRespondedAt: CURRENT, reviewStatus: "new", actionedAt: null, closedAt: null },
      ],
    }));

    expect(result.actionableInsights).toEqual(expect.arrayContaining([
      expect.objectContaining({ sourceId: "business:opportunity:advisor-depth", kind: "opportunity" }),
      expect.objectContaining({ sourceId: "business:behavior:top-area:roster", kind: "behavior" }),
      expect.objectContaining({ sourceId: "business:cancellation:response-backlog", kind: "risk", targetValue: 0 }),
      expect.objectContaining({ sourceId: "business:measurement:product-journeys", kind: "measurement" }),
    ]));
  });

  it("does not count reversed, actioned, or closed cancellation responses as backlog", () => {
    const result = buildAdminBusinessInsights(makeInput({
      cancellationCases: [
        { cancellationRequestedAt: CURRENT, cancellationReversedAt: CURRENT, firstRespondedAt: CURRENT, reviewStatus: "new", actionedAt: null, closedAt: null },
        { cancellationRequestedAt: CURRENT, cancellationReversedAt: null, firstRespondedAt: CURRENT, reviewStatus: "actioned", actionedAt: CURRENT, closedAt: null },
        { cancellationRequestedAt: CURRENT, cancellationReversedAt: null, firstRespondedAt: CURRENT, reviewStatus: "closed", actionedAt: null, closedAt: CURRENT },
      ],
    }));

    expect(result.productUsage.unactionedCancellationResponses).toBe(0);
    expect(result.actionableInsights).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ sourceId: "business:cancellation:response-backlog" }),
    ]));
  });

  it("returns null rates for empty denominators and never returns commander identifiers", () => {
    const result = buildAdminBusinessInsights(makeInput({
      usageEvents: [
        { commanderId: "private-commander-id", eventType: "feature_use", eventName: "advisor", tier: "FREE", createdAt: CURRENT },
      ],
    }));

    expect(result.productUsage.aiReturnRate).toBeNull();
    expect(result.productUsage.onboardingCompletionRate).toBeNull();
    expect(result.productUsage.cancellationResponseRate).toBeNull();
    expect(JSON.stringify(result)).not.toContain("private-commander-id");
  });
});
