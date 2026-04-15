import { describe, it, expect, vi } from "vitest";
import {
  sendWeeklyDigests,
  EmailDigestDeps,
  formatDigestEmail,
} from "../src/functions/weeklyEmailDigest";
import { InvocationContext } from "@azure/functions";

function createMockContext(): InvocationContext {
  return {
    log: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    trace: vi.fn(),
  } as unknown as InvocationContext;
}

describe("weeklyEmailDigest", () => {
  it("sends digest to eligible commanders", async () => {
    const sendEmail = vi.fn();
    const deps: EmailDigestDeps = {
      fetchEligibleCommanders: vi.fn().mockResolvedValue([
        { id: "cmd-1", email: "test@example.com", displayName: "Commander1" },
      ]),
      fetchWeeklyTips: vi.fn().mockResolvedValue([
        { content: "Build Eternals team", sourceCreatorName: "Creator1" },
      ]),
      fetchUnreadNotifications: vi.fn().mockResolvedValue([]),
      sendEmail,
    };

    const result = await sendWeeklyDigests(deps, createMockContext());
    expect(result.sent).toBe(1);
    expect(sendEmail).toHaveBeenCalledWith(
      "test@example.com",
      "Your Weekly MSF Companion Digest",
      expect.stringContaining("Commander1")
    );
  });

  it("does NOT send to commanders with no tips or notifications", async () => {
    const sendEmail = vi.fn();
    const deps: EmailDigestDeps = {
      fetchEligibleCommanders: vi.fn().mockResolvedValue([
        { id: "cmd-1", email: "test@example.com", displayName: "Cmd" },
      ]),
      fetchWeeklyTips: vi.fn().mockResolvedValue([]),
      fetchUnreadNotifications: vi.fn().mockResolvedValue([]),
      sendEmail,
    };

    const result = await sendWeeklyDigests(deps, createMockContext());
    expect(result.sent).toBe(0);
    expect(result.skipped).toBe(1);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("email HTML includes tips section", () => {
    const html = formatDigestEmail({
      displayName: "TestCommander",
      tips: [
        { content: "Farm Wolverine shards", sourceCreatorName: "MobileGamer" },
      ],
      notifications: [],
    });

    expect(html).toContain("Farm Wolverine shards");
    expect(html).toContain("MobileGamer");
    expect(html).toContain("Top Tips This Week");
  });

  it("email HTML includes unread alerts section", () => {
    const html = formatDigestEmail({
      displayName: "TestCommander",
      tips: [],
      notifications: [
        { type: "event_alert", title: "New Raid", message: "Start preparing!" },
      ],
    });

    expect(html).toContain("New Raid");
    expect(html).toContain("Unread Alerts");
    expect(html).toContain("📅");
  });

  it("email HTML contains CTA link to advisor", () => {
    const html = formatDigestEmail({
      displayName: "Test",
      tips: [{ content: "tip" }],
      notifications: [],
    });

    expect(html).toContain("Talk to your AI Advisor");
    expect(html).toContain("/advisor");
  });

  it("email HTML contains unsubscribe link", () => {
    const html = formatDigestEmail({
      displayName: "Test",
      tips: [{ content: "tip" }],
      notifications: [],
    });

    expect(html).toContain("Unsubscribe");
    expect(html).toContain("unsubscribe");
  });

  it("handles email send failure without crashing other digests", async () => {
    const sendEmail = vi.fn()
      .mockRejectedValueOnce(new Error("SMTP error"))
      .mockResolvedValueOnce(undefined);

    const deps: EmailDigestDeps = {
      fetchEligibleCommanders: vi.fn().mockResolvedValue([
        { id: "cmd-1", email: "fail@example.com", displayName: "Fail" },
        { id: "cmd-2", email: "pass@example.com", displayName: "Pass" },
      ]),
      fetchWeeklyTips: vi.fn().mockResolvedValue([{ content: "tip" }]),
      fetchUnreadNotifications: vi.fn().mockResolvedValue([]),
      sendEmail,
    };

    const result = await sendWeeklyDigests(deps, createMockContext());
    expect(result.sent).toBe(1);
    expect(result.skipped).toBe(1);
  });
});
