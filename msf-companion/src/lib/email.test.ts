import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  commanderFindUnique: vi.fn(),
  deliveryUpsert: vi.fn(),
  deliveryUpdate: vi.fn(),
  resendSend: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    commander: { findUnique: (...args: unknown[]) => mocks.commanderFindUnique(...args) },
    emailDelivery: {
      upsert: (...args: unknown[]) => mocks.deliveryUpsert(...args),
      update: (...args: unknown[]) => mocks.deliveryUpdate(...args),
    },
  },
}));

vi.mock("resend", () => ({
  Resend: class {
    emails = { send: (...args: unknown[]) => mocks.resendSend(...args) };
  },
}));

import { sendTrackedEmail } from "./email";

const base = {
  commanderId: "commander-1",
  to: "commander@example.com",
  subject: "Weekly update",
  html: "<html><body><p>Hello</p></body></html>",
  messageType: "weekly_digest" as const,
  idempotencyKey: "weekly:1:commander-1",
  preference: "weeklyDigest" as const,
};

describe("sendTrackedEmail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubEnv("EMAIL_UNSUBSCRIBE_SECRET", "test-secret-with-enough-entropy");
    mocks.commanderFindUnique.mockResolvedValue({
      emailWeeklyDigest: true,
      emailNewCharacters: true,
      emailAnnouncements: true,
      emailReengagement: true,
    });
    mocks.deliveryUpsert.mockResolvedValue({
      id: "delivery-1",
      status: "pending",
      providerMessageId: null,
    });
    mocks.deliveryUpdate.mockResolvedValue({});
    mocks.resendSend.mockResolvedValue({ data: { id: "resend-1" }, error: null });
  });

  it("suppresses a disabled category before calling Resend", async () => {
    mocks.commanderFindUnique.mockResolvedValue({
      emailWeeklyDigest: false,
      emailNewCharacters: true,
      emailAnnouncements: true,
      emailReengagement: true,
    });
    const result = await sendTrackedEmail(base);
    expect(result.status).toBe("suppressed");
    expect(mocks.resendSend).not.toHaveBeenCalled();
    expect(mocks.deliveryUpsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({ status: "suppressed" }),
    }));
  });

  it("sends with provider idempotency, text fallback, and one-click headers", async () => {
    const result = await sendTrackedEmail(base);
    expect(result).toEqual({ status: "sent", providerMessageId: "resend-1" });
    expect(mocks.resendSend).toHaveBeenCalledWith(
      expect.objectContaining({
        from: "MSF Companion <info@themsftoolkit.com>",
        text: expect.stringContaining("Hello"),
        html: expect.stringContaining("Manage weekly digest"),
        headers: expect.objectContaining({
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        }),
      }),
      expect.objectContaining({ idempotencyKey: expect.any(String) })
    );
    expect(mocks.deliveryUpdate).toHaveBeenLastCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: "sent", providerMessageId: "resend-1" }),
    }));
  });

  it("does not send an already completed delivery again", async () => {
    mocks.deliveryUpsert.mockResolvedValue({
      id: "delivery-1",
      status: "delivered",
      providerMessageId: "resend-1",
    });
    await expect(sendTrackedEmail(base)).resolves.toEqual({
      status: "duplicate",
      providerMessageId: "resend-1",
    });
    expect(mocks.resendSend).not.toHaveBeenCalled();
  });

  it("records a provider failure and throws so the trigger can retry", async () => {
    mocks.resendSend.mockResolvedValue({ data: null, error: { message: "provider unavailable" } });
    await expect(sendTrackedEmail(base)).rejects.toThrow("provider unavailable");
    expect(mocks.deliveryUpdate).toHaveBeenLastCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: "failed", lastError: "provider unavailable" }),
    }));
  });
});
