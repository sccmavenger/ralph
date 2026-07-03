import { describe, it, expect } from "vitest";
import type { CostBook } from "./cost-bundle";
import { computeAffordability, type ApiBalances } from "./affordability";
import {
  computeEventCostBundle,
  formatCurrencyBadge,
  mergeBundles,
  summarizeEventAffordability,
  EMPTY_BUNDLE,
  type EventBlockingChar,
} from "./event-affordability";

/**
 * US-007 per-event affordability badge tests (TC-007.1 .. TC-007.3, plus the
 * cost-aggregation and purity of the shared engine the route consumes).
 *
 * The cost book below prices gold from the yellow-star gold curve (the generic
 * data the planner gaps deltas can be evaluated against). Gear-tier gold is
 * left out (matching what the planner exposes), so gold shortfalls here come
 * from star gates — exactly how the route feeds this module.
 */
const BOOK: CostBook = {
  gearTiers: {},
  abilityUpgradeCosts: {},
  characterLevelTotalXp: [],
  yellowStarTotalShards: { "0": 0, "5": 310, "6": 510, "7": 810 },
  // Reaching 7★ from 5★ costs 10M gold; from 6★ costs 6M.
  yellowStarTotalGold: { "0": 0, "5": 0, "6": 4_000_000, "7": 10_000_000 },
};

const NO_API: ApiBalances = { abilityMats: {}, trainingXp: 0 };

function blocking(overrides: Partial<EventBlockingChar> = {}): EventBlockingChar {
  return {
    currentGear: 13,
    requiredGear: 13,
    currentStars: 5,
    requiredStars: 7,
    meetsRequirements: false,
    owned: true,
    ...overrides,
  };
}

describe("computeEventCostBundle", () => {
  it("aggregates only blocking characters; ready ones cost nothing", () => {
    const chars = [
      blocking(), // 5★ -> 7★ = 10M gold
      blocking({ meetsRequirements: true }), // ready — excluded
    ];
    const bundle = computeEventCostBundle(chars, BOOK);
    expect(bundle.gold).toBe(10_000_000);
    expect(bundle.cores).toBe(0);
  });

  it("sums cost across multiple blocking characters", () => {
    const chars = [
      blocking({ currentStars: 5, requiredStars: 7 }), // 10M
      blocking({ currentStars: 6, requiredStars: 7 }), // 6M
    ];
    const bundle = computeEventCostBundle(chars, BOOK);
    expect(bundle.gold).toBe(16_000_000);
  });

  it("returns an empty bundle when nothing is blocking", () => {
    const bundle = computeEventCostBundle(
      [blocking({ meetsRequirements: true })],
      BOOK,
    );
    expect(bundle).toEqual({ ...EMPTY_BUNDLE, abilityMats: {} });
  });

  it("does not mutate its inputs (purity)", () => {
    const chars = [blocking()];
    const snapshot = structuredClone(chars);
    const bookSnapshot = structuredClone(BOOK);
    computeEventCostBundle(chars, BOOK);
    computeEventCostBundle(chars, BOOK);
    expect(chars).toEqual(snapshot);
    expect(BOOK).toEqual(bookSnapshot);
  });
});

describe("mergeBundles", () => {
  it("adds currencies, XP and mats without mutating inputs", () => {
    const a = { gold: 1, cores: 2, trainingXp: 3, abilityMats: { X: 4 } };
    const b = { gold: 10, cores: 20, trainingXp: 30, abilityMats: { X: 5, Y: 1 } };
    expect(mergeBundles(a, b)).toEqual({
      gold: 11,
      cores: 22,
      trainingXp: 33,
      abilityMats: { X: 9, Y: 1 },
    });
    expect(a.abilityMats).toEqual({ X: 4 });
  });
});

describe("formatCurrencyBadge", () => {
  it("TC-007.1 — wallet covers the event -> green 'affordable now'", () => {
    const bundle = computeEventCostBundle([blocking()], BOOK); // 10M gold
    const result = computeAffordability(bundle, { gold: 20_000_000, cores: 0 }, NO_API);
    const badge = formatCurrencyBadge(result);
    expect(badge).toEqual({ tone: "affordable", label: "affordable now" });
  });

  it("TC-007.2 — short 9M gold -> 'short by 9M gold' with correct currency + amount", () => {
    const bundle = computeEventCostBundle([blocking()], BOOK); // 10M gold
    const result = computeAffordability(bundle, { gold: 1_000_000, cores: 0 }, NO_API);
    const badge = formatCurrencyBadge(result);
    expect(badge.tone).toBe("short");
    expect(badge.label).toBe("short by 9M gold");
  });

  it("TC-007.3 — no wallet -> invite, never a false verdict", () => {
    const bundle = computeEventCostBundle([blocking()], BOOK); // 10M gold cost
    const result = computeAffordability(bundle, null, NO_API);
    const badge = formatCurrencyBadge(result);
    expect(badge).toEqual({
      tone: "wallet-needed",
      label: "Add wallet to see affordability",
    });
    // Not a misleading affordable/short verdict.
    expect(badge.label).not.toContain("short by");
    expect(badge.label).not.toContain("affordable now");
  });

  it("a fully-ready event is 'affordable now' even with no wallet (zero cost)", () => {
    const result = computeAffordability(EMPTY_BUNDLE, null, NO_API);
    expect(formatCurrencyBadge(result)).toEqual({
      tone: "affordable",
      label: "affordable now",
    });
  });

  it("reports both currencies when short on gold and cores", () => {
    const result = computeAffordability(
      { gold: 5, cores: 3, trainingXp: 0, abilityMats: {} },
      { gold: 1, cores: 1 },
      NO_API,
    );
    const badge = formatCurrencyBadge(result);
    expect(badge.tone).toBe("short");
    expect(badge.label).toBe("short by 4 gold + 2 cores");
  });
});

describe("summarizeEventAffordability", () => {
  it("returns bundle + result + badge end to end", () => {
    const summary = summarizeEventAffordability(
      [blocking()],
      BOOK,
      { gold: 1_000_000, cores: 0 },
      NO_API,
    );
    expect(summary.bundle.gold).toBe(10_000_000);
    expect(summary.result.gold.short).toBe(9_000_000);
    expect(summary.badge.label).toBe("short by 9M gold");
  });
});
