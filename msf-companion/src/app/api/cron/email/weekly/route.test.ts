import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findCommanders: vi.fn(),
  findSnapshots: vi.fn(),
  findNotifications: vi.fn(),
  countAdvisorQuestions: vi.fn(),
  getFreshOfficialUpdates: vi.fn(),
  sendTrackedEmail: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    commander: { findMany: mocks.findCommanders },
    rosterSnapshot: { findMany: mocks.findSnapshots },
    commanderNotification: { findMany: mocks.findNotifications },
    advisorMessage: { count: mocks.countAdvisorQuestions },
  },
}));
vi.mock("@/lib/cron-auth", () => ({ isAuthorizedCronRequest: () => true }));
vi.mock("@/lib/email-automation", () => ({
  emailAutomationMode: () => "test",
  emailTestRecipient: () => "commander@example.test",
}));
vi.mock("@/lib/email", () => ({ sendTrackedEmail: mocks.sendTrackedEmail }));
vi.mock("@/lib/weekly-digest", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/weekly-digest")>()),
  getFreshOfficialUpdates: mocks.getFreshOfficialUpdates,
}));

import { POST } from "./route";

describe("weekly email route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findCommanders.mockResolvedValue([
      { id: "commander-1", email: "commander@example.test", displayName: "Ironman2733" },
    ]);
    mocks.findSnapshots.mockResolvedValue([]);
    mocks.findNotifications.mockResolvedValue([]);
    mocks.countAdvisorQuestions.mockResolvedValue(0);
    mocks.getFreshOfficialUpdates.mockResolvedValue([]);
    mocks.sendTrackedEmail.mockResolvedValue({ status: "sent", providerMessageId: "email-1" });
  });

  it("does not send a shell containing only a verification notification", async () => {
    mocks.findNotifications.mockResolvedValue([
      {
        type: "test",
        title: "Email delivery verification",
        message: "This temporary alert verifies the weekly email delivery pipeline.",
      },
    ]);

    const response = await POST(new Request("https://example.test/api/cron/email/weekly", { method: "POST" }));
    await expect(response.json()).resolves.toMatchObject({ candidates: 1, sent: 0, skipped: 1 });
    expect(mocks.sendTrackedEmail).not.toHaveBeenCalled();
  });

  it("sends a substantive roster progress report", async () => {
    mocks.findSnapshots.mockResolvedValue([
      {
        createdAt: new Date(),
        snapshotData: [{ name: "Iron Man", power: 1_200_000, yellowStars: 7 }],
      },
    ]);
    mocks.countAdvisorQuestions.mockResolvedValue(2);

    const response = await POST(new Request("https://example.test/api/cron/email/weekly", { method: "POST" }));
    await expect(response.json()).resolves.toMatchObject({ candidates: 1, sent: 1, skipped: 0 });
    expect(mocks.sendTrackedEmail).toHaveBeenCalledOnce();
    const delivery = mocks.sendTrackedEmail.mock.calls[0][0];
    expect(delivery.subject).toBe("Your Weekly MSF Progress Report");
    expect(delivery.idempotencyKey).toContain("weekly-digest:v2:");
    expect(delivery.metadata).toMatchObject({ contentVersion: "v2" });
    expect(delivery.html).toContain("Your roster at a glance");
    expect(delivery.html).toContain("Advisor activity");
    expect(delivery.html).not.toContain("Email delivery verification");
  });
});
