import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockGetAdminSession = vi.fn();
const mockQuestionFindMany = vi.fn();
const mockMessageFindMany = vi.fn();
const mockTokenFindMany = vi.fn();
const mockGapFindMany = vi.fn();
const mockUsageFindMany = vi.fn();
const mockCommanderFindMany = vi.fn();
const mockCancellationFindMany = vi.fn();
const mockActionFindMany = vi.fn();

vi.mock("@/lib/admin-session", () => ({
  getAdminSession: () => mockGetAdminSession(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    advisorQuestionLog: { findMany: (...args: unknown[]) => mockQuestionFindMany(...args) },
    advisorMessage: { findMany: (...args: unknown[]) => mockMessageFindMany(...args) },
    dailyTokenUsage: { findMany: (...args: unknown[]) => mockTokenFindMany(...args) },
    knowledgeGap: { findMany: (...args: unknown[]) => mockGapFindMany(...args) },
    usageEvent: { findMany: (...args: unknown[]) => mockUsageFindMany(...args) },
    commander: { findMany: (...args: unknown[]) => mockCommanderFindMany(...args) },
    cancellationFeedbackCase: { findMany: (...args: unknown[]) => mockCancellationFindMany(...args) },
    aiActionItem: { findMany: (...args: unknown[]) => mockActionFindMany(...args) },
  },
}));

import { GET, dynamic, revalidate } from "./route";

describe("GET /api/admin/ai-stats", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-31T12:00:00.000Z"));
    mockQuestionFindMany.mockResolvedValue([]);
    mockMessageFindMany.mockResolvedValue([]);
    mockTokenFindMany.mockResolvedValue([]);
    mockGapFindMany.mockResolvedValue([]);
    mockUsageFindMany.mockResolvedValue([]);
    mockCommanderFindMany.mockResolvedValue([]);
    mockCancellationFindMany.mockResolvedValue([]);
    mockActionFindMany.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("is dynamic and rejects unauthenticated requests without querying telemetry", async () => {
    mockGetAdminSession.mockResolvedValue({ isAdmin: false });

    const response = await GET(new Request("http://localhost/api/admin/ai-stats"));

    expect(dynamic).toBe("force-dynamic");
    expect(revalidate).toBe(0);
    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(mockQuestionFindMany).not.toHaveBeenCalled();
  });

  it("rejects unsupported ranges", async () => {
    mockGetAdminSession.mockResolvedValue({ isAdmin: true });

    const response = await GET(new Request("http://localhost/api/admin/ai-stats?range=14"));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "range must be one of 7, 30, or 90" });
    expect(mockQuestionFindMany).not.toHaveBeenCalled();
  });

  it("defaults to 30 days and returns the complete no-data shape", async () => {
    mockGetAdminSession.mockResolvedValue({ isAdmin: true });

    const response = await GET(new Request("http://localhost/api/admin/ai-stats"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(body.range).toMatchObject({ days: 30, timezone: "UTC" });
    expect(body.kpis).toHaveLength(10);
    expect(body.kpis.map((kpi: { id: string }) => kpi.id)).toEqual([
      "completed-answers",
      "ai-users",
      "classified-pass",
      "low-confidence",
      "grounded",
      "satisfaction",
      "rating-coverage",
      "tokens-per-answer",
      "open-gap-demand",
      "aged-gaps",
    ]);
    expect(body.dailyTrend).toHaveLength(30);
    expect(body).toMatchObject({
      categoryScorecard: [],
      gapSummary: { openGaps: 0, openDemand: 0, agedGaps: 0 },
      modelMix: [],
      actionItems: [],
      productUsage: {
        telemetryStatus: "partial",
        activeUsers: 0,
        advisorUsers: 0,
        cancellationRequests: 0,
      },
      productAreas: expect.any(Array),
      actionableInsights: expect.arrayContaining([
        expect.objectContaining({
          sourceId: "business:measurement:product-journeys",
        }),
      ]),
    });
  });

  it("keeps completed actions in the register while ordering active work first", async () => {
    mockGetAdminSession.mockResolvedValue({ isAdmin: true });
    mockActionFindMany.mockResolvedValue([
      {
        id: "done",
        sourceType: "knowledge_gap",
        sourceId: "gap-1",
        title: "Completed fix",
        description: null,
        priority: "critical",
        status: "completed",
        owner: "Owner",
        notes: "Verified",
        actionUrl: null,
        successMeasure: "No recurrence for 14 days",
        baselineValue: 4,
        targetValue: 0,
        resultValue: 0,
        metricUnit: "gaps",
        reviewAt: new Date("2026-09-14T10:00:00.000Z"),
        completedAt: new Date("2026-08-30T10:00:00.000Z"),
        createdAt: new Date("2026-08-20T10:00:00.000Z"),
        updatedAt: new Date("2026-08-30T10:00:00.000Z"),
      },
      {
        id: "open",
        sourceType: "advisor_question",
        sourceId: "question-1",
        title: "Investigate answer",
        description: null,
        priority: "high",
        status: "investigating",
        owner: null,
        notes: null,
        actionUrl: null,
        successMeasure: null,
        baselineValue: null,
        targetValue: null,
        resultValue: null,
        metricUnit: null,
        reviewAt: null,
        completedAt: null,
        createdAt: new Date("2026-08-21T10:00:00.000Z"),
        updatedAt: new Date("2026-08-29T10:00:00.000Z"),
      },
    ]);

    const response = await GET(new Request("http://localhost/api/admin/ai-stats?range=30"));
    const body = await response.json();

    expect(body.actionItems.map((action: { id: string }) => action.id)).toEqual(["open", "done"]);
    expect(body.actionItems[1].completedAt).toBe("2026-08-30T10:00:00.000Z");
    expect(body.actionItems[1]).toMatchObject({
      successMeasure: "No recurrence for 14 days",
      baselineValue: 4,
      targetValue: 0,
      resultValue: 0,
      metricUnit: "gaps",
      reviewAt: "2026-09-14T10:00:00.000Z",
    });
    expect(mockActionFindMany).toHaveBeenCalledWith({
      orderBy: { updatedAt: "desc" },
      take: 100,
    });
  });

  it("returns privacy-safe business signals from usage and cancellation records", async () => {
    mockGetAdminSession.mockResolvedValue({ isAdmin: true });
    mockUsageFindMany.mockResolvedValue([
      {
        commanderId: "private-commander-id",
        eventType: "page_view",
        eventName: "/roster",
        tier: "PREMIUM",
        createdAt: new Date("2026-08-20T10:00:00.000Z"),
      },
    ]);
    mockCancellationFindMany.mockResolvedValue([
      {
        cancellationRequestedAt: new Date("2026-08-20T10:00:00.000Z"),
        cancellationReversedAt: null,
        firstRespondedAt: new Date("2026-08-22T10:00:00.000Z"),
        reviewStatus: "new",
        actionedAt: null,
        closedAt: null,
      },
    ]);

    const response = await GET(new Request("http://localhost/api/admin/ai-stats?range=30"));
    const body = await response.json();

    expect(body.productUsage).toMatchObject({
      activeUsers: 1,
      pageViews: 1,
      unactionedCancellationResponses: 1,
    });
    expect(body.productAreas[0]).toMatchObject({
      id: "roster",
      uniqueUsers: 1,
      premiumUsers: 1,
    });
    expect(body.actionableInsights).toEqual(expect.arrayContaining([
      expect.objectContaining({
        sourceId: "business:cancellation:response-backlog",
        actionUrl: "/admin/cancellation-feedback",
      }),
    ]));
    expect(JSON.stringify(body)).not.toContain("private-commander-id");
    expect(mockUsageFindMany).toHaveBeenCalledWith(expect.objectContaining({
      select: {
        commanderId: true,
        eventType: true,
        eventName: true,
        tier: true,
        createdAt: true,
      },
    }));
  });
});
