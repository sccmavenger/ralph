import { describe, it, expect } from "vitest";
import { buildCostBill, type BillChar } from "./cost-bill";
import {
  computeCostBundle,
  type CostBook,
  type CostBundle,
} from "./cost-bundle";
import { selectUnlockTeams, type RosterEntry } from "./unlock-teams";
import type { NormalizedEvent, NormalizedEncounter } from "./planner-events";
import type { ApiBalances } from "./affordability";

/**
 * A deterministic cost book: gear pieces + gold-per-tier + star-gold curves.
 * (No ability/level deltas — the bill prices gear + stars only, matching the
 * gaps data.) Star shards carry no shardItemId here, so they contribute gold
 * only, never materials — keeping the material totals easy to verify.
 */
const BOOK: CostBook = {
  gearTiers: {
    "2": { slots: [{ piece: "GEAR_A" }, { piece: "GEAR_B" }] },
    "3": { slots: [{ piece: "GEAR_C" }] },
  },
  gearGoldPerTier: { "2": 1000, "3": 2000 },
  abilityUpgradeCosts: {},
  characterLevelTotalXp: [],
  yellowStarTotalShards: { "0": 0, "1": 10, "2": 25 },
  yellowStarTotalGold: { "0": 0, "1": 5000, "2": 12000 },
};

/** Owned char: gear 1→3, stars 0→2. gold = 3000(gear) + 12000(star) = 15000. */
const CHAR_A: BillChar = {
  id: "A",
  owned: true,
  currentGear: 1,
  requiredGear: 3,
  currentStars: 0,
  requiredStars: 2,
};

/** Unowned char: priced from base to gear 2 / star 1. gold = 1000 + 5000. */
const CHAR_B: BillChar = {
  id: "B",
  owned: false,
  currentGear: 0,
  requiredGear: 2,
  currentStars: 0,
  requiredStars: 1,
};

/** Reference per-character bundle via the US-005 engine directly. */
function refBundle(c: BillChar): CostBundle {
  const NEUTRAL = { basic: 1, special: 1, ultimate: 1, passive: 1 };
  return computeCostBundle(BOOK, {
    current: c.owned
      ? { gearTier: c.currentGear, level: 1, stars: c.currentStars, abilities: NEUTRAL }
      : null,
    target: { gearTier: c.requiredGear, level: 1, stars: c.requiredStars, abilities: NEUTRAL },
  });
}

const FULL_API: ApiBalances = {
  abilityMats: { GEAR_A: 100, GEAR_B: 100, GEAR_C: 100 },
  trainingXp: 1_000_000,
};

describe("buildCostBill", () => {
  it("TC-009.1 renders exactly four rows: Gold, Cores, Ability Mats, Training XP", () => {
    const bill = buildCostBill([CHAR_A], BOOK, { gold: 999999, cores: 999999 }, FULL_API);
    expect(bill.rows.map((r) => r.key)).toEqual([
      "gold",
      "cores",
      "abilityMats",
      "trainingXp",
    ]);
    expect(bill.rows.map((r) => r.label)).toEqual([
      "Gold",
      "Cores",
      "Ability Mats",
      "Training XP",
    ]);
    for (const row of bill.rows) {
      expect(row).toHaveProperty("required");
      expect(row).toHaveProperty("have");
      expect(row).toHaveProperty("short");
      expect(row).toHaveProperty("status");
    }
  });

  it("TC-009.2 affordable verdict when wallet + API cover all costs", () => {
    const bill = buildCostBill(
      [CHAR_A, CHAR_B],
      BOOK,
      { gold: 1_000_000, cores: 0 },
      FULL_API,
    );
    expect(bill.affordable).toBe(true);
    expect(bill.verdict).toBe("affordable");
    expect(bill.verdictLabel).toBe("affordable now");
    // Every row shows a "have" state (no shortfall, and have is known).
    for (const row of bill.rows) {
      expect(row.status).toBe("ok");
      expect(row.short).toBe(0);
      expect(row.have).not.toBeNull();
    }
  });

  it("TC-009.3 short verdict shows 'short by 9M gold' with the gold row short", () => {
    // A gear step that costs 9,000,000 gold, wallet has none.
    const bigGoldBook: CostBook = {
      ...BOOK,
      gearGoldPerTier: { "2": 9_000_000 },
    };
    const char: BillChar = {
      id: "C",
      owned: true,
      currentGear: 1,
      requiredGear: 2,
      currentStars: 0,
      requiredStars: 0,
    };
    const bill = buildCostBill(
      [char],
      bigGoldBook,
      { gold: 0, cores: 0 },
      { abilityMats: { GEAR_A: 10, GEAR_B: 10 }, trainingXp: 0 },
    );
    expect(bill.affordable).toBe(false);
    expect(bill.verdict).toBe("short");
    expect(bill.verdictLabel).toBe("short by 9M gold");

    const gold = bill.rows.find((r) => r.key === "gold")!;
    expect(gold.required).toBe(9_000_000);
    expect(gold.have).toBe(0);
    expect(gold.short).toBe(9_000_000);
    expect(gold.status).toBe("short");

    // Other covered rows show "have" (mats covered).
    const mats = bill.rows.find((r) => r.key === "abilityMats")!;
    expect(mats.status).toBe("ok");
  });

  it("TC-009.4 aggregates across teams and dedupes a shared character (counted once)", () => {
    // A shared character blocks two teams; the totals must count it once.
    const shared: BillChar = {
      id: "SHARED",
      owned: true,
      currentGear: 1,
      requiredGear: 3,
      currentStars: 0,
      requiredStars: 2,
    };
    const single = buildCostBill([shared], BOOK, null, FULL_API);
    const doubled = buildCostBill([shared, shared], BOOK, null, FULL_API);
    expect(doubled.bundle).toEqual(single.bundle);
    // And end-to-end via US-008's selectUnlockTeams, which builds underGate.
    const roster: RosterEntry[] = [
      { id: "SHARED", name: "Shared", traits: ["X"], gearTier: 1, stars: 0 },
    ];
    const teamEnc = (chapter: number): NormalizedEncounter => ({
      chapter,
      tier: 1,
      minCharacters: 5,
      maxCharacters: null,
      missionCharacters: false,
      filters: [
        {
          traits: ["X"],
          specificCharacters: [],
          minGearTier: 3,
          minStars: 2,
          minLevel: null,
        },
      ],
    });
    const event: NormalizedEvent = {
      id: "EVT",
      name: "Unlock X",
      type: "episodic",
      startTime: "",
      endTime: "",
      requirements: {
        traits: ["X"],
        specificCharacters: [],
        minGearTier: 3,
        minStars: 2,
        minLevel: null,
      },
      encounters: [teamEnc(1), teamEnc(2)],
      prerequisites: [],
    };
    const view = selectUnlockTeams(event, roster);
    expect(view.teams).toHaveLength(2); // two blocking teams
    expect(view.underGate).toHaveLength(1); // shared char deduped
    const bill = buildCostBill(view.underGate, BOOK, null, FULL_API);
    expect(bill.bundle).toEqual(single.bundle); // counted exactly once
  });

  it("TC-009.5 no-wallet fallback: gold/cores unknown, mats+XP real, no false short", () => {
    const bill = buildCostBill([CHAR_A, CHAR_B], BOOK, null, FULL_API);
    const gold = bill.rows.find((r) => r.key === "gold")!;
    const cores = bill.rows.find((r) => r.key === "cores")!;
    const mats = bill.rows.find((r) => r.key === "abilityMats")!;
    const xp = bill.rows.find((r) => r.key === "trainingXp")!;

    expect(gold.status).toBe("unknown");
    expect(gold.have).toBeNull();
    expect(gold.short).toBe(0);
    // Cores cost is 0 here → it's "ok" (a zero-cost currency needs no wallet).
    expect(cores.status).toBe("ok");

    // Mats + XP still show real required/have values.
    expect(mats.have).not.toBeNull();
    expect(mats.required).toBeGreaterThan(0);
    expect(xp.have).toBe(FULL_API.trainingXp);

    // No false "short" verdict for gold/cores.
    expect(bill.verdict).toBe("wallet-needed");
    expect(bill.verdictLabel).toBe("Add wallet");
    expect(bill.affordable).toBe(true);
  });

  it("TC-009.6 table totals equal the summed per-character CostBundle (sum of parts)", () => {
    const chars = [CHAR_A, CHAR_B];
    const bill = buildCostBill(chars, BOOK, { gold: 0, cores: 0 }, {
      abilityMats: {},
      trainingXp: 0,
    });

    // Sum the reference per-character bundles from the US-005 engine.
    const expected = chars.reduce<CostBundle>(
      (acc, c) => {
        const b = refBundle(c);
        const abilityMats = { ...acc.abilityMats };
        for (const [id, q] of Object.entries(b.abilityMats)) {
          abilityMats[id] = (abilityMats[id] ?? 0) + q;
        }
        return {
          gold: acc.gold + b.gold,
          cores: acc.cores + b.cores,
          trainingXp: acc.trainingXp + b.trainingXp,
          abilityMats,
        };
      },
      { gold: 0, cores: 0, trainingXp: 0, abilityMats: {} },
    );

    expect(bill.bundle).toEqual(expected);

    // And each row total equals the aggregate bundle value.
    const goldRow = bill.rows.find((r) => r.key === "gold")!;
    const matsRow = bill.rows.find((r) => r.key === "abilityMats")!;
    const xpRow = bill.rows.find((r) => r.key === "trainingXp")!;
    const totalMats = Object.values(expected.abilityMats).reduce((a, b) => a + b, 0);
    expect(goldRow.required).toBe(expected.gold);
    expect(matsRow.required).toBe(totalMats);
    expect(xpRow.required).toBe(expected.trainingXp);
  });

  it("is pure: does not mutate its inputs", () => {
    const chars: BillChar[] = [{ ...CHAR_A }];
    const snapshot = JSON.stringify(chars);
    buildCostBill(chars, BOOK, { gold: 1, cores: 1 }, FULL_API);
    expect(JSON.stringify(chars)).toBe(snapshot);
  });
});
