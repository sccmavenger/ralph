import { describe, it, expect, vi } from "vitest";
import {
  runChurnPrevention,
  calculateRiskScore,
  ChurnPreventionDeps,
  PremiumCommander,
  buildReEngageEmailHtml,
  buildRetentionEmailHtml,
  buildDunningEmailHtml,
  buildWinBackEmailHtml,
} from "../src/functions/churnPrevention.js";
import { InvocationContext } from "@azure/functions";

function mockContext(): InvocationContext {
  return { log: vi.fn(), warn: vi.fn(), error: vi.fn() } as unknown as InvocationContext;
}

function makeCommander(overrides: Partial<PremiumCommander> = {}): PremiumCommander {
  return {
    id: "cmd-1",
    email: "test@example.com",
    displayName: "TestUser",
    lastLoginAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), // 2 days ago
    stripeCurrentPeriodEnd: new Date(Date.now() + 20 * 24 * 60 * 60 * 1000), // 20 days from now
    disabled: false,
    recentUsageCount: 10,
    priorUsageCount: 10,
    recentLoginDays: 5,
    priorLoginDays: 5,
    paymentFailures: 0,
    topFeature: "/advisor",
    ...overrides,
  };
}

function makeDeps(overrides: Partial<ChurnPreventionDeps> = {}): ChurnPreventionDeps {
  return {
    fetchPremiumCommanders: vi.fn().mockResolvedValue([]),
    getLastIntervention: vi.fn().mockResolvedValue(null),
    sendEmail: vi.fn().mockResolvedValue(undefined),
    createNotification: vi.fn().mockResolvedValue(undefined),
    logIntervention: vi.fn().mockResolvedValue(undefined),
    fetchScheduledWinBacks: vi.fn().mockResolvedValue([]),
    markDelivered: vi.fn().mockResolvedValue(undefined),
    isFeatureEnabled: vi.fn().mockResolvedValue(true),
    ...overrides,
  };
}

describe("churnPrevention", () => {
  describe("calculateRiskScore", () => {
    it("returns 0 for healthy engaged user", () => {
      const score = calculateRiskScore(makeCommander());
      expect(score).toBe(0);
    });

    it("scores 30 for 7+ days since last login", () => {
      const score = calculateRiskScore(makeCommander({
        lastLoginAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000),
      }));
      expect(score).toBeGreaterThanOrEqual(30);
    });

    it("scores high for multiple risk signals", () => {
      const score = calculateRiskScore(makeCommander({
        lastLoginAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
        recentLoginDays: 0,
        priorLoginDays: 5,
        recentUsageCount: 1,
        priorUsageCount: 20,
        stripeCurrentPeriodEnd: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
        paymentFailures: 2,
      }));
      expect(score).toBeGreaterThanOrEqual(70);
    });

    it("caps score at 100", () => {
      const score = calculateRiskScore(makeCommander({
        lastLoginAt: null, // 30 pts
        recentLoginDays: 0,
        priorLoginDays: 7, // 20 pts
        recentUsageCount: 0,
        priorUsageCount: 50, // 20 pts
        stripeCurrentPeriodEnd: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000), // 20 pts
        paymentFailures: 3, // 10 pts = 100 total
      }));
      expect(score).toBe(100);
    });

    it("scores 20 for expiring within 7 days", () => {
      const score = calculateRiskScore(makeCommander({
        stripeCurrentPeriodEnd: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
      }));
      expect(score).toBe(20);
    });
  });

  describe("runChurnPrevention", () => {
    it("skips when feature flag is disabled", async () => {
      const deps = makeDeps({ isFeatureEnabled: vi.fn().mockResolvedValue(false) });
      const result = await runChurnPrevention(deps, mockContext());
      expect(result.scanned).toBe(0);
      expect(deps.fetchPremiumCommanders).not.toHaveBeenCalled();
    });

    it("sends nudge for medium-risk commanders (score 30-49)", async () => {
      const commander = makeCommander({
        lastLoginAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000), // 4 days = 10 pts
        recentUsageCount: 3,
        priorUsageCount: 12, // 75% drop = 20 pts → total 30
      });
      const deps = makeDeps({
        fetchPremiumCommanders: vi.fn().mockResolvedValue([commander]),
      });

      const result = await runChurnPrevention(deps, mockContext());
      expect(result.nudged).toBe(1);
      expect(deps.createNotification).toHaveBeenCalledWith(
        "cmd-1",
        expect.any(String),
        expect.any(String),
        expect.any(String),
      );
      // Nudge is notification only — no email
      expect(deps.sendEmail).not.toHaveBeenCalled();
    });

    it("sends re-engage email for high-risk commanders (score 50-69)", async () => {
      const commander = makeCommander({
        lastLoginAt: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000), // 20 pts
        recentLoginDays: 1,
        priorLoginDays: 5, // 80% drop = 20 pts
        recentUsageCount: 4,
        priorUsageCount: 10, // 60% drop = 10 pts → total 50
      });
      const deps = makeDeps({
        fetchPremiumCommanders: vi.fn().mockResolvedValue([commander]),
      });

      const result = await runChurnPrevention(deps, mockContext());
      expect(result.reEngaged).toBe(1);
      expect(deps.sendEmail).toHaveBeenCalledWith(
        "test@example.com",
        expect.stringContaining("roster has updates"),
        expect.any(String),
      );
      expect(deps.createNotification).toHaveBeenCalled();
    });

    it("sends retention email for critical-risk commanders (score 70+)", async () => {
      const commander = makeCommander({
        lastLoginAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000), // 30 pts
        recentLoginDays: 0,
        priorLoginDays: 5, // 20 pts
        recentUsageCount: 1,
        priorUsageCount: 20, // 20 pts → total 70
      });
      const deps = makeDeps({
        fetchPremiumCommanders: vi.fn().mockResolvedValue([commander]),
      });

      const result = await runChurnPrevention(deps, mockContext());
      expect(result.retained).toBe(1);
      expect(deps.sendEmail).toHaveBeenCalledWith(
        "test@example.com",
        "We've saved your progress, Commander",
        expect.any(String),
      );
    });

    it("respects cooldown — skips if last intervention is recent", async () => {
      const commander = makeCommander({
        lastLoginAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
        recentLoginDays: 0,
        priorLoginDays: 5,
        recentUsageCount: 1,
        priorUsageCount: 20,
      });
      const deps = makeDeps({
        fetchPremiumCommanders: vi.fn().mockResolvedValue([commander]),
        getLastIntervention: vi.fn().mockResolvedValue({
          sentAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000), // 5 days ago (within 30-day cooldown)
        }),
      });

      const result = await runChurnPrevention(deps, mockContext());
      expect(result.skipped).toBe(1);
      expect(result.retained).toBe(0);
      expect(deps.sendEmail).not.toHaveBeenCalled();
    });

    it("skips disabled commanders", async () => {
      const commander = makeCommander({ disabled: true });
      const deps = makeDeps({
        fetchPremiumCommanders: vi.fn().mockResolvedValue([commander]),
      });

      const result = await runChurnPrevention(deps, mockContext());
      expect(result.skipped).toBe(1);
      expect(deps.sendEmail).not.toHaveBeenCalled();
    });

    it("processes scheduled win-back emails", async () => {
      const deps = makeDeps({
        fetchScheduledWinBacks: vi.fn().mockResolvedValue([
          { id: "int-1", commanderId: "cmd-1", email: "test@example.com", displayName: "WinBackUser" },
        ]),
      });

      const result = await runChurnPrevention(deps, mockContext());
      expect(result.winBacks).toBe(1);
      expect(deps.sendEmail).toHaveBeenCalledWith(
        "test@example.com",
        expect.stringContaining("intel is still here"),
        expect.any(String),
      );
      expect(deps.markDelivered).toHaveBeenCalledWith("int-1");
    });

    it("handles errors gracefully per commander", async () => {
      const commander = makeCommander({
        lastLoginAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
        recentLoginDays: 0,
        priorLoginDays: 5,
        recentUsageCount: 1,
        priorUsageCount: 20,
      });
      const deps = makeDeps({
        fetchPremiumCommanders: vi.fn().mockResolvedValue([commander]),
        sendEmail: vi.fn().mockRejectedValue(new Error("Resend down")),
      });

      const result = await runChurnPrevention(deps, mockContext());
      expect(result.skipped).toBe(1);
      expect(result.retained).toBe(0);
    });
  });

  describe("email templates", () => {
    it("buildReEngageEmailHtml contains personalized content", () => {
      const html = buildReEngageEmailHtml("Commander42", "/advisor");
      expect(html).toContain("Commander42");
      expect(html).toContain("updates for you");
      expect(html).toContain("Check Your Dashboard");
    });

    it("buildRetentionEmailHtml contains value reminder", () => {
      const html = buildRetentionEmailHtml("TestUser");
      expect(html).toContain("TestUser");
      expect(html).toContain("saved your progress");
      expect(html).toContain("Dark Dimension planner");
    });

    it("buildDunningEmailHtml contains payment CTA", () => {
      const html = buildDunningEmailHtml("PayUser");
      expect(html).toContain("PayUser");
      expect(html).toContain("Update Payment Method");
      expect(html).toContain("couldn't be processed");
    });

    it("buildWinBackEmailHtml contains resubscribe CTA", () => {
      const html = buildWinBackEmailHtml("GoneUser");
      expect(html).toContain("GoneUser");
      expect(html).toContain("Resubscribe to Premium");
      expect(html).toContain("intel is still here");
    });
  });
});
