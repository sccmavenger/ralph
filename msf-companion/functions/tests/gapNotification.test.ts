import { describe, it, expect, vi } from "vitest";
import {
  sendGapNotifications,
  NotificationDeps,
  GapReport,
  formatDiscordEmbed,
  formatEmailHtml,
} from "../src/functions/gapNotification";
import { InvocationContext } from "@azure/functions";

function createMockContext(): InvocationContext {
  return {
    log: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    trace: vi.fn(),
  } as unknown as InvocationContext;
}

const sampleReport: GapReport = {
  high: [
    { question: "DD7 node 10 best team?", frequency: 15, gapType: "source_gap" },
  ],
  medium: [
    { question: "Best Crucible defense?", frequency: 5, gapType: "coverage_gap" },
  ],
  autoResolved: [
    { question: "Apocalypse requirements", gapType: "coverage_gap" },
  ],
  featureRequests: [
    { question: "Auto-equip gear feature", frequency: 3 },
  ],
};

describe("gapNotification", () => {
  it("sends no notification when there are zero gaps", async () => {
    const deps: NotificationDeps = {
      fetchGapReport: vi.fn().mockResolvedValue({
        high: [],
        medium: [],
        autoResolved: [],
        featureRequests: [],
      }),
      sendDiscordWebhook: vi.fn(),
      sendEmailDigest: vi.fn(),
    };

    const result = await sendGapNotifications(deps, createMockContext());
    expect(result.sent).toBe(false);
    expect(deps.sendDiscordWebhook).not.toHaveBeenCalled();
    expect(deps.sendEmailDigest).not.toHaveBeenCalled();
  });

  it("sends Discord and email when gaps exist", async () => {
    const deps: NotificationDeps = {
      fetchGapReport: vi.fn().mockResolvedValue(sampleReport),
      sendDiscordWebhook: vi.fn(),
      sendEmailDigest: vi.fn(),
    };

    const result = await sendGapNotifications(deps, createMockContext());
    expect(result.sent).toBe(true);
    expect(deps.sendDiscordWebhook).toHaveBeenCalledWith(sampleReport);
    expect(deps.sendEmailDigest).toHaveBeenCalledWith(sampleReport);
  });

  it("Discord embed has correct color-coded priorities", () => {
    const embed = formatDiscordEmbed(sampleReport) as { embeds: Array<{ title: string; color: number }> };
    expect(embed.embeds).toHaveLength(4);
    expect(embed.embeds[0].title).toContain("HIGH PRIORITY");
    expect(embed.embeds[0].color).toBe(0xff0000);
    expect(embed.embeds[1].title).toContain("MEDIUM");
    expect(embed.embeds[1].color).toBe(0xffaa00);
    expect(embed.embeds[2].title).toContain("Auto-Resolved");
    expect(embed.embeds[2].color).toBe(0x00ff00);
  });

  it("HIGH PRIORITY includes only gaps with frequency >= 10", () => {
    const report: GapReport = {
      high: [{ question: "High freq question", frequency: 15, gapType: "source_gap" }],
      medium: [{ question: "Medium freq", frequency: 5, gapType: "coverage_gap" }],
      autoResolved: [],
      featureRequests: [],
    };

    const embed = formatDiscordEmbed(report) as { embeds: Array<{ title: string; fields: Array<{ name: string }> }> };
    const highSection = embed.embeds.find((e) => e.title.includes("HIGH"));
    expect(highSection?.fields).toHaveLength(1);
    expect(highSection?.fields[0].name).toBe("High freq question");
  });

  it("email HTML includes correct sections", () => {
    const html = formatEmailHtml(sampleReport);
    expect(html).toContain("HIGH PRIORITY");
    expect(html).toContain("MEDIUM");
    expect(html).toContain("Auto-Resolved");
    expect(html).toContain("Feature Gap Requests");
    expect(html).toContain("DD7 node 10 best team?");
    expect(html).toContain("×15");
  });

  it("handles Discord webhook failure without crashing", async () => {
    const deps: NotificationDeps = {
      fetchGapReport: vi.fn().mockResolvedValue(sampleReport),
      sendDiscordWebhook: vi.fn().mockRejectedValue(new Error("timeout")),
      sendEmailDigest: vi.fn(),
    };

    // Should not throw
    await expect(
      sendGapNotifications(deps, createMockContext())
    ).rejects.toThrow("timeout");
  });
});
