import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  caseFindUnique: vi.fn(),
  caseUpdate: vi.fn(),
  responseUpsert: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    cancellationFeedbackCase: {
      findUnique: (...args: unknown[]) => mocks.caseFindUnique(...args),
      update: (...args: unknown[]) => mocks.caseUpdate(...args),
    },
    cancellationFeedbackResponse: {
      upsert: (...args: unknown[]) => mocks.responseUpsert(...args),
    },
    $transaction: (...args: unknown[]) => mocks.transaction(...args),
  },
}));

import { createCancellationFeedbackToken } from "@/lib/cancellation-feedback";
import { POST } from "./route";

describe("POST /api/feedback/cancellation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("EMAIL_FEEDBACK_SECRET", "test-feedback-secret-with-enough-entropy");
    mocks.caseFindUnique.mockResolvedValue({
      id: "case-1",
      commanderId: "commander-1",
      firstRespondedAt: null,
      primaryReason: null,
    });
    mocks.responseUpsert.mockResolvedValue({ id: "response-1" });
    mocks.caseUpdate.mockResolvedValue({});
    mocks.transaction.mockResolvedValue([]);
  });

  it("rejects unsigned feedback without querying a case", async () => {
    const response = await POST(new Request("https://example.test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: "not-signed", reason: "needs_changed" }),
    }));
    expect(response.status).toBe(400);
    expect(mocks.caseFindUnique).not.toHaveBeenCalled();
  });

  it("upserts one form response and places the case in the new queue", async () => {
    const token = createCancellationFeedbackToken({
      commanderId: "commander-1",
      caseId: "case-1",
      reason: "missing_something",
    });
    const response = await POST(new Request("https://example.test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token,
        reason: "missing_something",
        comment: "I needed alliance reporting.",
      }),
    }));

    expect(response.status).toBe(200);
    expect(mocks.responseUpsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { dedupeKey: "form:case-1" },
      create: expect.objectContaining({
        source: "form",
        reason: "missing_something",
        body: "I needed alliance reporting.",
      }),
    }));
    expect(mocks.caseUpdate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ reviewStatus: "new", primaryReason: "missing_something" }),
    }));
  });
});
