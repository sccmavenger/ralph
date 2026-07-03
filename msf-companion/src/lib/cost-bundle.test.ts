import { describe, it, expect } from "vitest";
import {
  computeCostBundle,
  CostBook,
  CharacterState,
  UNOWNED_BASE_STATE,
  GOLD_ITEM_ID,
  CORE_ITEM_ID,
} from "./cost-bundle";

/**
 * US-005 cost bundle engine tests (TC-005.1 .. TC-005.6).
 *
 * The fixture below mirrors the live `/game/v1/upgradeData` shapes proven by
 * `scripts/probe-upgrade-costs.ts`. XP values are the REAL cumulative values
 * from the game (characterLevelTotalXp): lvl 50 = 94,090, lvl 70 = 581,690.
 */

// characterLevelTotalXp is index=level; fill the levels we assert on.
function makeXpCurve(): number[] {
  const xp: number[] = [];
  xp[1] = 0;
  xp[50] = 94_090; // real
  xp[60] = 219_390; // real
  xp[70] = 581_690; // real
  xp[75] = 896_690; // real
  return xp;
}

const FIXTURE: CostBook = {
  // G13 -> G15 applies tiers 14 and 15.
  gearTiers: {
    "14": { slots: [{ piece: "GEAR_A" }, { piece: "GEAR_B" }] },
    "15": { slots: [{ piece: "GEAR_B" }, { piece: "GEAR_C" }, { piece: "GEAR_C" }] },
  },
  gearGoldPerTier: { "14": 50_000, "15": 75_000 },
  abilityUpgradeCosts: {
    basic: {
      "2": [
        { item: "ABILITY_MAT_T1", quantity: 15 },
        { item: GOLD_ITEM_ID, quantity: 1_000 },
      ],
      "3": [
        { item: "ABILITY_MAT_T1", quantity: 20 },
        { item: GOLD_ITEM_ID, quantity: 2_000 },
      ],
    },
    special: {},
    ultimate: {},
    passive: {},
  },
  characterLevelTotalXp: makeXpCurve(),
  yellowStarTotalShards: {
    "0": 0,
    "1": 15,
    "2": 45,
    "3": 100,
    "4": 180,
    "5": 310,
    "6": 510,
    "7": 810,
  },
  yellowStarTotalGold: {
    "0": 0,
    "5": 100_000,
    "6": 300_000,
    "7": 600_000,
  },
};

function state(overrides: Partial<CharacterState> = {}): CharacterState {
  return {
    gearTier: 13,
    level: 70,
    stars: 5,
    abilities: { basic: 1, special: 1, ultimate: 1, passive: 1 },
    ...overrides,
  };
}

describe("computeCostBundle", () => {
  it("TC-005.1 — known G13->G15 gear delta yields exact mat + gold quantities", () => {
    const bundle = computeCostBundle(FIXTURE, {
      current: state({ gearTier: 13 }),
      target: state({ gearTier: 15 }),
    });

    // Gear pieces: tier14 = A,B ; tier15 = B,C,C  => A:1 B:2 C:2
    expect(bundle.abilityMats).toEqual({
      GEAR_A: 1,
      GEAR_B: 2,
      GEAR_C: 2,
    });
    // Gold from gearGoldPerTier: 50,000 + 75,000
    expect(bundle.gold).toBe(125_000);
    // No level/star/ability delta here.
    expect(bundle.trainingXp).toBe(0);
    expect(bundle.cores).toBe(0);
  });

  it("TC-005.2 — already at (or above) target yields a zero bundle", () => {
    const same = state();
    const bundle = computeCostBundle(FIXTURE, { current: same, target: same });
    expect(bundle).toEqual({ gold: 0, cores: 0, abilityMats: {}, trainingXp: 0 });

    // Target strictly below current on every axis is also zero.
    const below = computeCostBundle(FIXTURE, {
      current: state({ gearTier: 15, level: 75, stars: 7 }),
      target: state({ gearTier: 13, level: 70, stars: 5 }),
    });
    expect(below).toEqual({ gold: 0, cores: 0, abilityMats: {}, trainingXp: 0 });
  });

  it("TC-005.3 — unowned character costs strictly more than an owned same-target character", () => {
    const target = state({ gearTier: 15, level: 75, stars: 7, abilities: { basic: 3, special: 1, ultimate: 1, passive: 1 } });

    const unowned = computeCostBundle(FIXTURE, { current: null, target, shardItemId: "SHARD_X" });
    const owned = computeCostBundle(FIXTURE, {
      current: state({ gearTier: 14, level: 70, stars: 6, abilities: { basic: 2, special: 1, ultimate: 1, passive: 1 } }),
      target,
      shardItemId: "SHARD_X",
    });

    // Unowned is priced from the base state (gear 1 / level 1 / 0 stars).
    expect(unowned.gold).toBeGreaterThan(owned.gold);
    expect(unowned.trainingXp).toBeGreaterThan(owned.trainingXp);
    const unownedShards = unowned.abilityMats.SHARD_X ?? 0;
    const ownedShards = owned.abilityMats.SHARD_X ?? 0;
    expect(unownedShards).toBeGreaterThan(ownedShards);
    // Unowned base equals passing UNOWNED_BASE_STATE explicitly.
    const explicit = computeCostBundle(FIXTURE, { current: UNOWNED_BASE_STATE, target, shardItemId: "SHARD_X" });
    expect(unowned).toEqual(explicit);
  });

  it("TC-005.4 — training XP equals the summed per-level curve delta; 0 with no level delta", () => {
    const bundle = computeCostBundle(FIXTURE, {
      current: state({ level: 50 }),
      target: state({ level: 70 }),
    });
    // 581,690 - 94,090
    expect(bundle.trainingXp).toBe(487_600);

    const noDelta = computeCostBundle(FIXTURE, {
      current: state({ level: 70 }),
      target: state({ level: 70 }),
    });
    expect(noDelta.trainingXp).toBe(0);
  });

  it("TC-005.5 — gold is sourced from the cost book (ability SC lines + star gold curve)", () => {
    const bundle = computeCostBundle(FIXTURE, {
      current: state({ gearTier: 13, stars: 5, abilities: { basic: 1, special: 1, ultimate: 1, passive: 1 } }),
      target: state({ gearTier: 13, stars: 7, abilities: { basic: 3, special: 1, ultimate: 1, passive: 1 } }),
    });
    // Ability gold: level2 (1000) + level3 (2000) = 3000
    // Star gold: 5*=100,000 -> 7*=600,000 => 500,000
    expect(bundle.gold).toBe(503_000);
    // Ability mats accumulate too (not currency).
    expect(bundle.abilityMats.ABILITY_MAT_T1).toBe(35);
  });

  it("routes Power Cores (PC) to cores, not abilityMats", () => {
    const book: CostBook = {
      ...FIXTURE,
      abilityUpgradeCosts: {
        basic: { "2": [{ item: CORE_ITEM_ID, quantity: 5 }] },
        special: {},
        ultimate: {},
        passive: {},
      },
    };
    const bundle = computeCostBundle(book, {
      current: state({ abilities: { basic: 1, special: 1, ultimate: 1, passive: 1 } }),
      target: state({ abilities: { basic: 2, special: 1, ultimate: 1, passive: 1 } }),
    });
    expect(bundle.cores).toBe(5);
    expect(bundle.abilityMats[CORE_ITEM_ID]).toBeUndefined();
  });

  it("TC-005.6 — pure: identical inputs yield deep-equal output and inputs are not mutated", () => {
    const delta = {
      current: state({ gearTier: 13, level: 50, stars: 5 }),
      target: state({ gearTier: 15, level: 70, stars: 7, abilities: { basic: 3, special: 1, ultimate: 1, passive: 1 } }),
      shardItemId: "SHARD_X",
    };
    const bookSnapshot = structuredClone(FIXTURE);
    const deltaSnapshot = structuredClone(delta);

    const a = computeCostBundle(FIXTURE, delta);
    const b = computeCostBundle(FIXTURE, delta);

    expect(a).toEqual(b);
    // No mutation of the passed-in cost book or delta.
    expect(FIXTURE).toEqual(bookSnapshot);
    expect(delta).toEqual(deltaSnapshot);
  });
});
