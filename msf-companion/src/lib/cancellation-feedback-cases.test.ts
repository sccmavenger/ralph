import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  upsert: vi.fn(),
  updateMany: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    cancellationFeedbackCase: {
      upsert: (...args: unknown[]) => mocks.upsert(...args),
      updateMany: (...args: unknown[]) => mocks.updateMany(...args),
    },
    $transaction: (...args: unknown[]) => mocks.transaction(...args),
  },
}));

import {
  cancellationKeyForSubscription,
  isVoluntaryCancellation,
  markCancellationFeedbackReactivated,
  queueCancellationFeedbackCase,
} from "./cancellation-feedback-cases";

function subscription(overrides: Record<string, unknown> = {}) {
  return {
    id: "sub_123",
    canceled_at: 1_788_091_200,
    cancel_at: 1_790_683_200,
    start_date: 1_780_000_000,
    ended_at: null,
    status: "active",
    cancel_at_period_end: true,
    cancellation_details: { reason: "cancellation_requested" },
    items: { data: [{ current_period_end: 1_790_683_200 }] },
    ...overrides,
  } as never;
}

describe("cancellation feedback cases", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.upsert.mockResolvedValue({ id: "case-1" });
    mocks.updateMany.mockResolvedValue({ count: 1 });
    mocks.transaction.mockResolvedValue([{ count: 1 }, { count: 0 }]);
  });

  it("uses Stripe's cancellation request timestamp as the cycle key", () => {
    expect(cancellationKeyForSubscription(subscription())).toBe(
      "sub_123:1788091200"
    );
  });

  it("queues feedback 24 hours after a voluntary request", async () => {
    await queueCancellationFeedbackCase({
      commanderId: "commander-1",
      subscription: subscription(),
      now: new Date("2026-08-30T12:00:00Z"),
    });

    expect(mocks.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { cancellationKey: "sub_123:1788091200" },
      create: expect.objectContaining({
        commanderId: "commander-1",
        cancellationRequestedAt: new Date("2026-08-30T12:00:00.000Z"),
        scheduledAt: new Date("2026-08-31T12:00:00.000Z"),
      }),
    }));
  });

  it("recognizes only Stripe's customer-requested cancellation reason", () => {
    expect(isVoluntaryCancellation(subscription())).toBe(true);
    expect(isVoluntaryCancellation(subscription({
      cancellation_details: { reason: "payment_failed" },
    }))).toBe(false);
  });

  it("cancels pending outreach when the subscription is reactivated", async () => {
    await expect(markCancellationFeedbackReactivated({
      commanderId: "commander-1",
      stripeSubscriptionId: "sub_123",
      at: new Date("2026-08-30T13:00:00Z"),
    })).resolves.toBe(1);

    expect(mocks.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ outreachStatus: { in: ["queued", "failed"] } }),
      data: expect.objectContaining({ outreachStatus: "canceled" }),
    }));
  });
});
