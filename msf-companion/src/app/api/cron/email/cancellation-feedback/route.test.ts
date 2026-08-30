import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authorized: true,
  mode: "live" as "disabled" | "test" | "live",
  testRecipient: "test@example.com" as string | null,
  caseFindMany: vi.fn(),
  caseUpdate: vi.fn(),
  deliveryFindFirst: vi.fn(),
  retrieveSubscription: vi.fn(),
  sendTrackedEmail: vi.fn(),
}));

vi.mock("@/lib/cron-auth", () => ({
  isAuthorizedCronRequest: () => mocks.authorized,
}));
vi.mock("@/lib/email-automation", () => ({
  cancellationFeedbackEmailMode: () => mocks.mode,
  emailTestRecipient: () => mocks.testRecipient,
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    cancellationFeedbackCase: {
      findMany: (...args: unknown[]) => mocks.caseFindMany(...args),
      update: (...args: unknown[]) => mocks.caseUpdate(...args),
    },
    emailDelivery: {
      findFirst: (...args: unknown[]) => mocks.deliveryFindFirst(...args),
    },
  },
}));
vi.mock("@/lib/stripe", () => ({
  stripe: {
    subscriptions: {
      retrieve: (...args: unknown[]) => mocks.retrieveSubscription(...args),
    },
  },
}));
vi.mock("@/lib/email", () => ({
  hashEmailAddress: (email: string) => `hash:${email.toLowerCase()}`,
  sendTrackedEmail: (...args: unknown[]) => mocks.sendTrackedEmail(...args),
}));

import { POST } from "./route";

const feedbackCase = {
  id: "case-1",
  cancellationKey: "sub_1:1788091200",
  stripeSubscriptionId: "sub_1",
  cancellationRequestedAt: new Date("2026-08-29T12:00:00Z"),
  cancellationEffectiveAt: null,
  scheduledAt: new Date("2026-08-30T12:00:00Z"),
  commander: {
    id: "commander-1",
    email: "commander@example.com",
    displayName: "Test Commander",
    disabled: false,
    emailAnnouncements: true,
    emailConsentSource: "profile",
  },
};

describe("POST /api/cron/email/cancellation-feedback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("EMAIL_FEEDBACK_SECRET", "test-feedback-secret-with-enough-entropy");
    mocks.authorized = true;
    mocks.mode = "live";
    mocks.testRecipient = "test@example.com";
    mocks.caseFindMany.mockResolvedValue([feedbackCase]);
    mocks.caseUpdate.mockResolvedValue({});
    mocks.deliveryFindFirst.mockResolvedValue(null);
    mocks.retrieveSubscription.mockResolvedValue({
      status: "active",
      cancel_at_period_end: true,
      cancellation_details: { reason: "cancellation_requested" },
    });
    mocks.sendTrackedEmail.mockResolvedValue({ status: "sent", providerMessageId: "email-1" });
  });

  it("fails closed without touching the queue when disabled", async () => {
    mocks.mode = "disabled";
    const response = await POST(new Request("https://example.test", { method: "POST" }));
    expect(await response.json()).toMatchObject({ mode: "disabled", scanned: 0 });
    expect(mocks.caseFindMany).not.toHaveBeenCalled();
  });

  it("sends the approved invitation and marks the case sent", async () => {
    const response = await POST(new Request("https://example.test", { method: "POST" }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ sent: 1, failed: 0 });
    expect(mocks.sendTrackedEmail).toHaveBeenCalledWith(expect.objectContaining({
      commanderId: "commander-1",
      to: "commander@example.com",
      messageType: "cancellation_feedback",
      preference: "announcements",
      idempotencyKey: "cancellation-feedback:v1:sub_1:1788091200",
    }));
    expect(mocks.caseUpdate).toHaveBeenLastCalledWith(expect.objectContaining({
      data: expect.objectContaining({ outreachStatus: "sent" }),
    }));
  });

  it("cancels outreach when Stripe shows the subscription was reactivated", async () => {
    mocks.retrieveSubscription.mockResolvedValue({
      status: "active",
      cancel_at_period_end: false,
      cancellation_details: null,
    });
    const response = await POST(new Request("https://example.test", { method: "POST" }));
    expect(await response.json()).toMatchObject({ sent: 0, skipped: 1 });
    expect(mocks.sendTrackedEmail).not.toHaveBeenCalled();
    expect(mocks.caseUpdate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        outreachStatus: "canceled",
        suppressionReason: "cancellation_reversed",
      }),
    }));
  });
});
