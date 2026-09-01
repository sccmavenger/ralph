import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockGetAdminSession = vi.fn();
const mockQuestionFindMany = vi.fn();
const mockQuestionCount = vi.fn();
const mockMessageFindMany = vi.fn();
const mockTokenFindMany = vi.fn();
const mockGapFindMany = vi.fn();

vi.mock("@/lib/admin-session", () => ({
  getAdminSession: () => mockGetAdminSession(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    advisorQuestionLog: {
      findMany: (...args: unknown[]) => mockQuestionFindMany(...args),
      count: (...args: unknown[]) => mockQuestionCount(...args),
    },
    advisorMessage: { findMany: (...args: unknown[]) => mockMessageFindMany(...args) },
    dailyTokenUsage: { findMany: (...args: unknown[]) => mockTokenFindMany(...args) },
    knowledgeGap: { findMany: (...args: unknown[]) => mockGapFindMany(...args) },
  },
}));

import { GET } from "./route";

describe("GET /api/admin/ai-stats/drilldown", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-31T12:00:00.000Z"));
    mockQuestionFindMany.mockResolvedValue([]);
    mockQuestionCount.mockResolvedValue(0);
    mockMessageFindMany.mockResolvedValue([]);
    mockTokenFindMany.mockResolvedValue([]);
    mockGapFindMany.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("requires an admin session", async () => {
    mockGetAdminSession.mockResolvedValue({ isAdmin: false });

    const response = await GET(new Request(
      "http://localhost/api/admin/ai-stats/drilldown?metric=completed-answers&range=30&page=1",
    ));

    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(mockQuestionFindMany).not.toHaveBeenCalled();
  });

  it("rejects an unknown metric, invalid range, and invalid page", async () => {
    mockGetAdminSession.mockResolvedValue({ isAdmin: true });

    const invalidMetric = await GET(new Request(
      "http://localhost/api/admin/ai-stats/drilldown?metric=cost&range=30&page=1",
    ));
    const invalidRange = await GET(new Request(
      "http://localhost/api/admin/ai-stats/drilldown?metric=completed-answers&range=14&page=1",
    ));
    const invalidPage = await GET(new Request(
      "http://localhost/api/admin/ai-stats/drilldown?metric=completed-answers&range=30&page=0",
    ));

    expect(invalidMetric.status).toBe(400);
    expect(invalidRange.status).toBe(400);
    expect(invalidPage.status).toBe(400);
    expect(mockQuestionFindMany).not.toHaveBeenCalled();
  });

  it("paginates safe question rows and never returns commander identifiers", async () => {
    mockGetAdminSession.mockResolvedValue({ isAdmin: true });
    mockQuestionFindMany.mockResolvedValue(Array.from({ length: 30 }, (_, index) => ({
      id: `question-${index}`,
      commanderId: `private-commander-${index}`,
      email: `private-${index}@example.com`,
      scopelyId: `private-scopely-${index}`,
      question: `Question ${index} ${"x".repeat(400)}`,
      category: "roster",
      confidenceScore: 80,
      answeredSuccessfully: true,
      knowledgeSourcesUsed: [{ title: "Safe source" }],
      createdAt: new Date(`2026-08-${String(31 - (index % 6)).padStart(2, "0")}T12:00:00.000Z`),
    })));

    const response = await GET(new Request(
      "http://localhost/api/admin/ai-stats/drilldown?metric=completed-answers&range=7&page=2",
    ));
    const body = await response.json();
    const serialized = JSON.stringify(body);

    expect(response.status).toBe(200);
    expect(body.filters).toEqual({ category: null });
    expect(body.snapshot).toEqual({ value: 30, unit: "count", sampleSize: 30 });
    expect(body.pagination).toEqual({ page: 2, pageSize: 25, total: 30, totalPages: 2 });
    expect(body.items).toHaveLength(5);
    expect(body.items[0].id).toBe("question-25");
    expect(body.items[0].question.length).toBeLessThanOrEqual(240);
    expect(body.items[0]).toMatchObject({
      category: "roster",
      confidenceScore: 80,
      answeredSuccessfully: true,
      knowledgeSourcesCount: 1,
    });
    expect(serialized).not.toContain("private-commander");
    expect(serialized).not.toContain("private-scopely");
    expect(serialized).not.toContain("@example.com");
    expect(body.items[0]).not.toHaveProperty("commanderId");
    expect(body.items[0]).not.toHaveProperty("email");
    expect(body.items[0]).not.toHaveProperty("scopelyId");
  });

  it("trims an optional category and applies it exactly to question drilldowns", async () => {
    mockGetAdminSession.mockResolvedValue({ isAdmin: true });
    mockQuestionFindMany.mockResolvedValue([{
      id: "general-question",
      commanderId: "private-commander",
      question: "A general question",
      category: "general",
      confidenceScore: 55,
      answeredSuccessfully: false,
      knowledgeSourcesUsed: [],
      createdAt: new Date("2026-08-31T10:00:00.000Z"),
    }]);

    const response = await GET(new Request(
      "http://localhost/api/admin/ai-stats/drilldown?metric=classified-pass&range=7&page=1&category=%20general%20",
    ));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.filters).toEqual({ category: "general" });
    expect(mockQuestionFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        createdAt: {
          gte: new Date("2026-08-25T00:00:00.000Z"),
          lt: new Date("2026-09-01T00:00:00.000Z"),
        },
        category: "general",
      },
    }));
    expect(JSON.stringify(body)).not.toContain("private-commander");
  });

  it.each([
    ["an empty category", ""],
    ["a whitespace-only category", "%20%20%20"],
    ["a category over 80 characters", "x".repeat(81)],
    ["a category with control characters", "general%00roster"],
  ])("rejects %s", async (_label, categoryValue) => {
    mockGetAdminSession.mockResolvedValue({ isAdmin: true });

    const response = await GET(new Request(
      `http://localhost/api/admin/ai-stats/drilldown?metric=completed-answers&range=30&page=1&category=${categoryValue}`,
    ));

    expect(response.status).toBe(400);
    expect(mockQuestionFindMany).not.toHaveBeenCalled();
  });

  it("rejects category filters for metrics that are not question-based", async () => {
    mockGetAdminSession.mockResolvedValue({ isAdmin: true });

    const response = await GET(new Request(
      "http://localhost/api/admin/ai-stats/drilldown?metric=satisfaction&range=30&page=1&category=general",
    ));

    expect(response.status).toBe(400);
    expect(mockMessageFindMany).not.toHaveBeenCalled();
  });

  it("shows failed rows for classified pass and uses null with no denominator", async () => {
    mockGetAdminSession.mockResolvedValue({ isAdmin: true });
    mockQuestionFindMany.mockResolvedValueOnce([
      {
        id: "passed",
        commanderId: "one",
        question: "Passed question",
        category: "general",
        confidenceScore: 90,
        answeredSuccessfully: true,
        knowledgeSourcesUsed: [],
        createdAt: new Date("2026-08-31T10:00:00.000Z"),
      },
      {
        id: "failed",
        commanderId: "two",
        question: "Failed question",
        category: "general",
        confidenceScore: 40,
        answeredSuccessfully: false,
        knowledgeSourcesUsed: [],
        createdAt: new Date("2026-08-31T09:00:00.000Z"),
      },
    ]);

    const failedResponse = await GET(new Request(
      "http://localhost/api/admin/ai-stats/drilldown?metric=classified-pass&range=7&page=1",
    ));
    const failedBody = await failedResponse.json();
    expect(failedBody.snapshot).toEqual({ value: 50, unit: "percent", sampleSize: 2 });
    expect(failedBody.items.map((item: { id: string }) => item.id)).toEqual(["failed"]);

    mockQuestionFindMany.mockResolvedValueOnce([]);
    const emptyResponse = await GET(new Request(
      "http://localhost/api/admin/ai-stats/drilldown?metric=grounded&range=7&page=1",
    ));
    const emptyBody = await emptyResponse.json();
    expect(emptyBody.snapshot.value).toBeNull();
    expect(emptyBody.snapshot.sampleSize).toBe(0);
  });

  it("orders negative satisfaction ratings first and truncates answer content", async () => {
    mockGetAdminSession.mockResolvedValue({ isAdmin: true });
    mockMessageFindMany.mockResolvedValue([
      {
        id: "positive-newer",
        content: "p".repeat(500),
        feedback: "positive",
        modelUsed: "gpt-test",
        createdAt: new Date("2026-08-31T11:00:00.000Z"),
      },
      {
        id: "negative-older",
        content: "Needs work",
        feedback: "negative",
        feedbackComment: "The recommendation ignored my roster.",
        modelUsed: "gpt-test",
        createdAt: new Date("2026-08-30T11:00:00.000Z"),
      },
      {
        id: "unrated",
        content: "No rating",
        feedback: null,
        modelUsed: "gpt-test",
        createdAt: new Date("2026-08-31T10:00:00.000Z"),
      },
    ]);

    const response = await GET(new Request(
      "http://localhost/api/admin/ai-stats/drilldown?metric=satisfaction&range=7&page=1",
    ));
    const body = await response.json();

    expect(body.snapshot).toEqual({ value: 50, unit: "percent", sampleSize: 2 });
    expect(body.items.map((item: { id: string }) => item.id)).toEqual([
      "negative-older",
      "positive-newer",
    ]);
    expect(body.items[1].content.length).toBeLessThanOrEqual(320);
    expect(body.items[0].feedbackComment).toBe("The recommendation ignored my roster.");
  });

  it("shows the unrated denominator when drilling into rating coverage", async () => {
    mockGetAdminSession.mockResolvedValue({ isAdmin: true });
    mockMessageFindMany.mockResolvedValue([
      {
        id: "rated",
        content: "Rated answer",
        feedback: "positive",
        feedbackComment: null,
        modelUsed: "gpt-test",
        createdAt: new Date("2026-08-31T11:00:00.000Z"),
      },
      {
        id: "unrated",
        content: "Unrated answer",
        feedback: null,
        feedbackComment: null,
        modelUsed: "gpt-test",
        createdAt: new Date("2026-08-31T10:00:00.000Z"),
      },
    ]);

    const response = await GET(new Request(
      "http://localhost/api/admin/ai-stats/drilldown?metric=rating-coverage&range=7&page=1",
    ));
    const body = await response.json();

    expect(body.snapshot).toEqual({ value: 50, unit: "percent", sampleSize: 2 });
    expect(body.pagination.total).toBe(2);
    expect(body.items.map((item: { id: string }) => item.id)).toEqual(["unrated", "rated"]);
  });
});
