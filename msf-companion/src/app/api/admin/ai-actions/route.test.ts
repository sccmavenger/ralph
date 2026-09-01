import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAdminSession: vi.fn(),
  findUnique: vi.fn(),
  upsert: vi.fn(),
}));

vi.mock("@/lib/admin-session", () => ({
  getAdminSession: () => mocks.getAdminSession(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    aiActionItem: {
      findUnique: (...args: unknown[]) => mocks.findUnique(...args),
      upsert: (...args: unknown[]) => mocks.upsert(...args),
    },
  },
}));

import { POST } from "./route";

const createdAt = new Date("2026-08-30T10:00:00.000Z");
const updatedAt = new Date("2026-08-31T10:00:00.000Z");

function actionRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: "action-1",
    sourceType: "knowledge_gap",
    sourceId: "gap-1",
    title: "Review missing ISO-8 guidance",
    description: null,
    priority: "medium",
    status: "open",
    owner: null,
    notes: null,
    actionUrl: "/admin/ai-dashboard?view=gaps",
    successMeasure: null,
    baselineValue: null,
    targetValue: null,
    resultValue: null,
    metricUnit: null,
    reviewAt: null,
    completedAt: null,
    createdAt,
    updatedAt,
    ...overrides,
  };
}

function request(body: unknown) {
  return new Request("http://localhost/api/admin/ai-actions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/admin/ai-actions", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.getAdminSession.mockResolvedValue({ isAdmin: true });
    mocks.findUnique.mockResolvedValue(null);
    mocks.upsert.mockResolvedValue(actionRecord());
  });

  it("requires an admin session before reading or writing actions", async () => {
    mocks.getAdminSession.mockResolvedValue({ isAdmin: false });

    const response = await POST(
      new Request("http://localhost/api/admin/ai-actions", {
        method: "POST",
        body: "{",
      }),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
    expect(mocks.findUnique).not.toHaveBeenCalled();
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("rejects malformed and non-object JSON", async () => {
    const malformed = await POST(
      new Request("http://localhost/api/admin/ai-actions", {
        method: "POST",
        body: "{",
      }),
    );
    const arrayBody = await POST(request([]));

    expect(malformed.status).toBe(400);
    await expect(malformed.json()).resolves.toEqual({
      error: "Invalid JSON body",
    });
    expect(arrayBody.status).toBe(400);
    await expect(arrayBody.json()).resolves.toEqual({
      error: "Request body must be an object",
    });
    expect(mocks.findUnique).not.toHaveBeenCalled();
  });

  it.each([
    ["missing source type", { sourceType: undefined }],
    ["missing source id", { sourceId: undefined }],
    ["missing title", { title: undefined }],
    ["unknown source", { sourceType: "feedback" }],
    ["unknown priority", { priority: "urgent" }],
    ["unknown status", { status: "done" }],
    ["unsafe URL", { actionUrl: "javascript:alert(1)" }],
    ["protocol-relative URL", { actionUrl: "//example.test/actions/1" }],
    ["non-numeric baseline", { baselineValue: "90" }],
    ["invalid review date", { reviewAt: "not-a-date" }],
    ["oversized success measure", { successMeasure: "x".repeat(2_001) }],
    ["oversized metric unit", { metricUnit: "x".repeat(81) }],
    ["oversized title", { title: "x".repeat(241) }],
    ["unexpected property", { completedAt: "2026-08-31T00:00:00Z" }],
  ])("rejects %s", async (_label, override) => {
    const response = await POST(
      request({
        sourceType: "knowledge_gap",
        sourceId: "gap-1",
        title: "Review gap",
        ...override,
      }),
    );

    expect(response.status).toBe(400);
    expect(mocks.findUnique).not.toHaveBeenCalled();
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("normalizes input and creates an action with workflow defaults", async () => {
    const response = await POST(
      request({
        sourceType: "knowledge_gap",
        sourceId: "  gap-1  ",
        title: "  Review missing ISO-8 guidance  ",
        description: "   ",
        owner: "  Dana  ",
        actionUrl: "  /admin/ai-dashboard?view=gaps  ",
      }),
    );

    expect(response.status).toBe(201);
    expect(mocks.findUnique).toHaveBeenCalledWith({
      where: {
        sourceType_sourceId: {
          sourceType: "knowledge_gap",
          sourceId: "gap-1",
        },
      },
      select: { status: true, completedAt: true },
    });
    expect(mocks.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          sourceType_sourceId: {
            sourceType: "knowledge_gap",
            sourceId: "gap-1",
          },
        },
        create: {
          sourceType: "knowledge_gap",
          sourceId: "gap-1",
          title: "Review missing ISO-8 guidance",
          description: null,
          priority: "medium",
          status: "open",
          owner: "Dana",
          notes: null,
          actionUrl: "/admin/ai-dashboard?view=gaps",
          successMeasure: null,
          baselineValue: null,
          targetValue: null,
          resultValue: null,
          metricUnit: null,
          reviewAt: null,
          completedAt: null,
        },
        update: {
          title: "Review missing ISO-8 guidance",
          description: null,
          owner: "Dana",
          actionUrl: "/admin/ai-dashboard?view=gaps",
        },
      }),
    );
    await expect(response.json()).resolves.toEqual({
      action: {
        ...actionRecord(),
        createdAt: createdAt.toISOString(),
        updatedAt: updatedAt.toISOString(),
      },
    });
  });

  it("creates and serializes measurable outcome fields", async () => {
    const reviewAt = new Date("2026-09-30T15:00:00.000Z");
    mocks.upsert.mockResolvedValue(
      actionRecord({
        successMeasure: "Raise classified pass rate to target",
        baselineValue: 62.5,
        targetValue: 85,
        resultValue: 71.2,
        metricUnit: "percent",
        reviewAt,
      }),
    );

    const response = await POST(
      request({
        sourceType: "knowledge_gap",
        sourceId: "gap-1",
        title: "Review gap",
        successMeasure: "  Raise classified pass rate to target  ",
        baselineValue: 62.5,
        targetValue: 85,
        resultValue: 71.2,
        metricUnit: "  percent  ",
        reviewAt: "2026-09-30T10:00:00-05:00",
      }),
    );

    expect(response.status).toBe(201);
    expect(mocks.upsert.mock.calls[0][0].create).toEqual(
      expect.objectContaining({
        successMeasure: "Raise classified pass rate to target",
        baselineValue: 62.5,
        targetValue: 85,
        resultValue: 71.2,
        metricUnit: "percent",
        reviewAt,
      }),
    );
    await expect(response.json()).resolves.toEqual({
      action: {
        ...actionRecord({
          successMeasure: "Raise classified pass rate to target",
          baselineValue: 62.5,
          targetValue: 85,
          resultValue: 71.2,
          metricUnit: "percent",
        }),
        reviewAt: reviewAt.toISOString(),
        createdAt: createdAt.toISOString(),
        updatedAt: updatedAt.toISOString(),
      },
    });
  });

  it("upserts by source without resetting omitted workflow fields", async () => {
    mocks.findUnique.mockResolvedValue({
      status: "investigating",
      completedAt: null,
    });
    mocks.upsert.mockResolvedValue(
      actionRecord({
        title: "Updated title",
        priority: "high",
        status: "investigating",
      }),
    );

    const response = await POST(
      request({
        sourceType: "knowledge_gap",
        sourceId: "gap-1",
        title: "Updated title",
        priority: "high",
      }),
    );

    expect(response.status).toBe(200);
    const call = mocks.upsert.mock.calls[0][0];
    expect(call.update).toEqual({ title: "Updated title", priority: "high" });
    expect(call.update).not.toHaveProperty("status");
    expect(call.update).not.toHaveProperty("completedAt");
  });

  it("returns a generic error when persistence fails", async () => {
    mocks.findUnique.mockRejectedValue(new Error("database host and password"));

    const response = await POST(
      request({
        sourceType: "kpi_anomaly",
        sourceId: "negative-feedback-rate:2026-08-31",
        title: "Investigate negative feedback spike",
      }),
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Could not save AI action",
    });
  });
});
