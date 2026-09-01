import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAdminSession: vi.fn(),
  findUnique: vi.fn(),
  update: vi.fn(),
}));

vi.mock("@/lib/admin-session", () => ({
  getAdminSession: () => mocks.getAdminSession(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    aiActionItem: {
      findUnique: (...args: unknown[]) => mocks.findUnique(...args),
      update: (...args: unknown[]) => mocks.update(...args),
    },
  },
}));

import { PATCH } from "./route";

const completedAt = new Date("2026-08-30T12:00:00.000Z");
const createdAt = new Date("2026-08-29T12:00:00.000Z");
const updatedAt = new Date("2026-08-31T12:00:00.000Z");

function actionRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: "action-1",
    sourceType: "advisor_feedback",
    sourceId: "message-1",
    title: "Investigate negative feedback",
    description: "Commander reported an irrelevant answer.",
    priority: "high",
    status: "investigating",
    owner: "Dana",
    notes: null,
    actionUrl: "/admin/ai-dashboard?view=feedback",
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
  return new Request("http://localhost/api/admin/ai-actions/action-1", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function patch(body: unknown, id = "action-1") {
  return PATCH(request(body), { params: Promise.resolve({ id }) });
}

describe("PATCH /api/admin/ai-actions/[id]", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.getAdminSession.mockResolvedValue({ isAdmin: true });
    mocks.findUnique.mockResolvedValue({
      status: "investigating",
      completedAt: null,
    });
    mocks.update.mockResolvedValue(actionRecord());
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("requires an admin session before validating the request", async () => {
    mocks.getAdminSession.mockResolvedValue({ isAdmin: false });

    const response = await PATCH(
      new Request("http://localhost/api/admin/ai-actions/action-1", {
        method: "PATCH",
        body: "{",
      }),
      { params: Promise.resolve({ id: "action-1" }) },
    );

    expect(response.status).toBe(401);
    expect(mocks.findUnique).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it.each([
    ["an empty update", {}],
    ["an immutable source", { sourceId: "different-source" }],
    ["an unknown status", { status: "done" }],
    ["an unknown priority", { priority: "urgent" }],
    ["an unsafe URL", { actionUrl: "file:///etc/passwd" }],
    ["a non-numeric target", { targetValue: "85" }],
    ["an invalid review date", { reviewAt: "next Thursday" }],
    ["an oversized owner", { owner: "x".repeat(121) }],
  ])("rejects %s", async (_label, body) => {
    const response = await patch(body);

    expect(response.status).toBe(400);
    expect(mocks.findUnique).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("returns 400 for malformed JSON and invalid action ids", async () => {
    const malformed = await PATCH(
      new Request("http://localhost/api/admin/ai-actions/action-1", {
        method: "PATCH",
        body: "{",
      }),
      { params: Promise.resolve({ id: "action-1" }) },
    );
    const invalidId = await patch({ status: "planned" }, "   ");

    expect(malformed.status).toBe(400);
    await expect(malformed.json()).resolves.toEqual({
      error: "Invalid JSON body",
    });
    expect(invalidId.status).toBe(400);
    expect(mocks.findUnique).not.toHaveBeenCalled();
  });

  it("returns 404 without attempting an update when the action is missing", async () => {
    mocks.findUnique.mockResolvedValue(null);

    const response = await patch({ status: "planned" });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: "AI action not found",
    });
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("sets completedAt when an action enters completed status", async () => {
    vi.useFakeTimers();
    vi.setSystemTime("2026-08-31T15:30:00.000Z");
    const completionTime = new Date("2026-08-31T15:30:00.000Z");
    mocks.update.mockResolvedValue(
      actionRecord({ status: "completed", completedAt: completionTime }),
    );

    const response = await patch({
      status: "completed",
      notes: "Added a verified source and retested the answer.",
    });

    expect(response.status).toBe(200);
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "action-1" },
        data: {
          status: "completed",
          notes: "Added a verified source and retested the answer.",
          completedAt: completionTime,
        },
      }),
    );
    await expect(response.json()).resolves.toEqual({
      action: {
        ...actionRecord({ status: "completed" }),
        completedAt: completionTime.toISOString(),
        createdAt: createdAt.toISOString(),
        updatedAt: updatedAt.toISOString(),
      },
    });
  });

  it("preserves the original completion time for repeated completed updates", async () => {
    mocks.findUnique.mockResolvedValue({ status: "completed", completedAt });
    mocks.update.mockResolvedValue(
      actionRecord({ status: "completed", completedAt }),
    );

    const response = await patch({ status: "completed", owner: "Morgan" });

    expect(response.status).toBe(200);
    expect(mocks.update.mock.calls[0][0].data).toEqual({
      status: "completed",
      owner: "Morgan",
      completedAt,
    });
  });

  it("clears completedAt when a completed action is reopened", async () => {
    mocks.findUnique.mockResolvedValue({ status: "completed", completedAt });
    mocks.update.mockResolvedValue(
      actionRecord({ status: "investigating", completedAt: null, owner: null }),
    );

    const response = await patch({ status: "investigating", owner: "  " });

    expect(response.status).toBe(200);
    expect(mocks.update.mock.calls[0][0].data).toEqual({
      status: "investigating",
      owner: null,
      completedAt: null,
    });
  });

  it("does not touch completion state when status is omitted", async () => {
    mocks.findUnique.mockResolvedValue({ status: "completed", completedAt });
    mocks.update.mockResolvedValue(
      actionRecord({ status: "completed", completedAt, notes: "Follow-up" }),
    );

    const response = await patch({ notes: "Follow-up" });

    expect(response.status).toBe(200);
    expect(mocks.update.mock.calls[0][0].data).toEqual({ notes: "Follow-up" });
    expect(mocks.update.mock.calls[0][0].data).not.toHaveProperty("completedAt");
  });

  it("updates and serializes outcome tracking without changing workflow state", async () => {
    const reviewAt = new Date("2026-09-15T14:00:00.000Z");
    mocks.update.mockResolvedValue(
      actionRecord({
        successMeasure: "Rating coverage reaches ten percent",
        baselineValue: 0,
        targetValue: 10,
        resultValue: 4.5,
        metricUnit: "percent",
        reviewAt,
      }),
    );

    const response = await patch({
      successMeasure: " Rating coverage reaches ten percent ",
      baselineValue: 0,
      targetValue: 10,
      resultValue: 4.5,
      metricUnit: " percent ",
      reviewAt: "2026-09-15T09:00:00-05:00",
    });

    expect(response.status).toBe(200);
    expect(mocks.update.mock.calls[0][0].data).toEqual({
      successMeasure: "Rating coverage reaches ten percent",
      baselineValue: 0,
      targetValue: 10,
      resultValue: 4.5,
      metricUnit: "percent",
      reviewAt,
    });
    expect(mocks.update.mock.calls[0][0].data).not.toHaveProperty("completedAt");
    await expect(response.json()).resolves.toEqual({
      action: {
        ...actionRecord({
          successMeasure: "Rating coverage reaches ten percent",
          baselineValue: 0,
          targetValue: 10,
          resultValue: 4.5,
          metricUnit: "percent",
        }),
        reviewAt: reviewAt.toISOString(),
        createdAt: createdAt.toISOString(),
        updatedAt: updatedAt.toISOString(),
      },
    });
  });

  it("allows outcome fields and the review date to be cleared", async () => {
    mocks.update.mockResolvedValue(actionRecord());

    const response = await patch({
      successMeasure: null,
      baselineValue: null,
      targetValue: null,
      resultValue: null,
      metricUnit: " ",
      reviewAt: null,
    });

    expect(response.status).toBe(200);
    expect(mocks.update.mock.calls[0][0].data).toEqual({
      successMeasure: null,
      baselineValue: null,
      targetValue: null,
      resultValue: null,
      metricUnit: null,
      reviewAt: null,
    });
  });

  it("maps a write race to 404 and does not leak database details", async () => {
    mocks.update.mockRejectedValue({ code: "P2025", message: "row vanished" });

    const response = await patch({ status: "planned" });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: "AI action not found",
    });
  });
});
