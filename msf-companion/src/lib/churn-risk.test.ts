import { describe, expect, it } from "vitest";
import { calculateChurnRisk } from "./churn-risk";

const now = new Date("2026-08-22T12:00:00.000Z");

describe("calculateChurnRisk", () => {
  it("returns zero for a recently active, stable commander", () => {
    expect(calculateChurnRisk({
      lastLoginAt: new Date("2026-08-22T08:00:00.000Z"),
      stripeCurrentPeriodEnd: new Date("2026-09-22T00:00:00.000Z"),
      recentUsageCount: 10,
      priorUsageCount: 10,
      recentLoginDays: 5,
      priorLoginDays: 5,
      paymentFailures: 0,
    }, now)).toBe(0);
  });

  it("caps a severely at-risk commander at 100", () => {
    expect(calculateChurnRisk({
      lastLoginAt: null,
      stripeCurrentPeriodEnd: new Date("2026-08-20T00:00:00.000Z"),
      recentUsageCount: 0,
      priorUsageCount: 20,
      recentLoginDays: 0,
      priorLoginDays: 7,
      paymentFailures: 2,
    }, now)).toBe(100);
  });
});
