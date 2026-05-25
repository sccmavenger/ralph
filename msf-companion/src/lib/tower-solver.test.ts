import { describe, it, expect } from "vitest";
import {
  solveTowerAllocation,
  RoomForSolver,
  SAFETY_MARGIN_DEFAULT,
  getConfidence,
  CONFIDENCE_THRESHOLDS,
  getConfidenceFromComposite,
  COMPOSITE_CONFIDENCE_THRESHOLDS,
} from "./tower-solver";
import { Character } from "./tower-readiness";

function makeChar(id: string, overrides: Partial<Character> = {}): Character {
  return {
    id,
    name: `Hero ${id}`,
    traits: ["Mutant"],
    gearTier: 17,
    stars: 7,
    level: 95,
    power: 150000,
    ...overrides,
  };
}

function makeRoom(id: string, overrides: Partial<RoomForSolver["requirements"]> = {}): RoomForSolver {
  return {
    id,
    name: `Room ${id}`,
    requirements: {
      traits: ["Mutant"],
      minGearTier: 16,
      minStars: 5,
      minLevel: 85,
      ...overrides,
    },
  };
}

describe("solveTowerAllocation", () => {
  it("does not double-assign characters across rooms", () => {
    const roster = Array.from({ length: 10 }, (_, i) =>
      makeChar(`c${i}`, { power: 100000 + i * 10000 })
    );
    const rooms = [makeRoom("r1"), makeRoom("r2")];

    const result = solveTowerAllocation(rooms, roster, []);

    const room1Chars = result.assignments.get("r1")!.characters.map((c) => c.id);
    const room2Chars = result.assignments.get("r2")!.characters.map((c) => c.id);

    // No overlap
    const overlap = room1Chars.filter((id) => room2Chars.includes(id));
    expect(overlap).toHaveLength(0);
  });

  it("respects trait requirements", () => {
    const roster = [
      ...Array.from({ length: 5 }, (_, i) =>
        makeChar(`mut${i}`, { traits: ["Mutant"], power: 100000 })
      ),
      ...Array.from({ length: 5 }, (_, i) =>
        makeChar(`bio${i}`, { traits: ["Bio"], power: 100000 })
      ),
    ];

    const rooms = [
      makeRoom("r1", { traits: ["Mutant"] }),
      makeRoom("r2", { traits: ["Bio"] }),
    ];

    const result = solveTowerAllocation(rooms, roster, []);

    const r1Chars = result.assignments.get("r1")!.characters;
    const r2Chars = result.assignments.get("r2")!.characters;

    expect(r1Chars.every((c) => c.traits.includes("Mutant"))).toBe(true);
    expect(r2Chars.every((c) => c.traits.includes("Bio"))).toBe(true);
  });

  it("assigns weaker teams to easier rooms", () => {
    // 10 characters with varying power
    const roster = Array.from({ length: 10 }, (_, i) =>
      makeChar(`c${i}`, { power: 100000 + i * 20000 })
    );

    // Easy room (low requirements) and hard room (high requirements)
    const rooms: RoomForSolver[] = [
      { id: "easy", name: "Easy Room", requirements: { traits: ["Mutant"], minGearTier: 14, minStars: 3, minLevel: 70 } },
      { id: "hard", name: "Hard Room", requirements: { traits: ["Mutant"], minGearTier: 17, minStars: 7, minLevel: 95 } },
    ];

    const result = solveTowerAllocation(rooms, roster, []);

    // Hard room should be assigned first (our algo processes hardest first)
    // and then easy room gets remaining characters
    expect(result.assignments.has("hard")).toBe(true);
    expect(result.assignments.has("easy")).toBe(true);
  });

  it("handles no-solution gracefully", () => {
    const roster = [
      makeChar("c1", { traits: ["Bio"], gearTier: 10 }),
      makeChar("c2", { traits: ["Bio"], gearTier: 10 }),
    ];

    const rooms = [makeRoom("r1", { traits: ["Mutant"], minGearTier: 17 })];

    const result = solveTowerAllocation(rooms, roster, []);

    expect(result.assignments.size).toBe(0);
    expect(result.unassignableRooms).toContain("r1");
  });

  it("excludes cleared rooms from assignment", () => {
    const roster = Array.from({ length: 5 }, (_, i) =>
      makeChar(`c${i}`, { power: 100000 })
    );

    const rooms = [makeRoom("r1"), makeRoom("r2")];
    const clearedRooms = ["r1"];

    const result = solveTowerAllocation(rooms, roster, [], clearedRooms);

    expect(result.assignments.has("r1")).toBe(false);
    expect(result.assignments.has("r2")).toBe(true);
  });

  it("assigns all characters in a team (5 per room)", () => {
    const roster = Array.from({ length: 5 }, (_, i) =>
      makeChar(`c${i}`, { power: 100000 })
    );

    const rooms = [makeRoom("r1")];
    const result = solveTowerAllocation(rooms, roster, []);

    expect(result.assignments.get("r1")!.characters).toHaveLength(5);
  });

  it("returns confidence and reason for each assignment", () => {
    const roster = Array.from({ length: 5 }, (_, i) =>
      makeChar(`c${i}`, { power: 200000 })
    );

    const rooms = [makeRoom("r1")];
    const result = solveTowerAllocation(rooms, roster, []);

    const assignment = result.assignments.get("r1")!;
    expect(["strong", "shouldWork", "risky"]).toContain(assignment.confidence);
    expect(assignment.reason.length).toBeGreaterThan(0);
    expect(assignment.power).toBe(1000000); // 5 * 200000
  });
});

describe("solveTowerAllocation - margin-aware (US-003)", () => {
  it("exports SAFETY_MARGIN_DEFAULT = 1.10", () => {
    expect(SAFETY_MARGIN_DEFAULT).toBe(1.1);
  });

  it("with a comfortable margin, picks a mid-power team rather than the weakest", () => {
    // Roster: 10 chars from 100k..550k power (50k step)
    const roster = Array.from({ length: 10 }, (_, i) =>
      makeChar(`c${i}`, { power: 100000 + i * 50000 })
    );
    const rooms = [makeRoom("r1")];
    // Opponent power 500k * 1.10 = 550k target.
    // Weakest 5 sum = 100+150+200+250+300 = 1,000k (already > 550k) — so the
    // ascending prefix is selected (not the weakest single char). To make the
    // test meaningful, raise opponent power so the weakest-5 prefix is just
    // below the strongest available, forcing the solver to swap up.
    // Weakest 5 sum = 1,000k; opponent 950k * 1.10 = 1,045k → solver must swap.
    const opponentPowers = new Map<string, number>([["r1", 950000]]);

    const result = solveTowerAllocation(rooms, roster, [], undefined, { opponentPowers });
    const assn = result.assignments.get("r1")!;
    expect(assn.marginFallback).toBeFalsy();
    expect(assn.power).toBeGreaterThanOrEqual(950000 * 1.1);
    // The team is NOT the strongest 5 (550+500+450+400+350 = 2,250k); solver
    // should pick the smallest viable subset.
    const strongest5Sum = 550000 + 500000 + 450000 + 400000 + 350000;
    expect(assn.power).toBeLessThan(strongest5Sum);
    // And it's NOT the weakest 5 either (1,000k below target).
    expect(assn.power).toBeGreaterThan(1000000);
  });

  it("falls back to strongest team and tags marginFallback when no subset meets margin", () => {
    const roster = Array.from({ length: 5 }, (_, i) =>
      makeChar(`c${i}`, { power: 100000 + i * 10000 })
    );
    const rooms = [makeRoom("r1")];
    // Roster total = 100+110+120+130+140 = 600k. Opponent 1M * 1.10 = 1.1M — unmeetable.
    const opponentPowers = new Map<string, number>([["r1", 1000000]]);

    const result = solveTowerAllocation(rooms, roster, [], undefined, { opponentPowers });
    const assn = result.assignments.get("r1")!;
    expect(assn.marginFallback).toBe(true);
    // Strongest 5 = the whole roster
    expect(assn.power).toBe(600000);
    expect(assn.reason).toMatch(/safety margin/i);
  });

  it("processes rooms in descending opponent-power order, reserving strong characters for the hardest cell", () => {
    // 10 chars, 100k..1000k
    const roster = Array.from({ length: 10 }, (_, i) =>
      makeChar(`c${i}`, { power: 100000 + i * 100000 })
    );
    const rooms = [
      makeRoom("easy"),
      makeRoom("hard"),
    ];
    // Easy target = 1.8M * 1.10 = 1.98M; smallest viable subset for easy from
    // the full roster is c1..c5 (2.0M).
    // Hard target = 3.6M * 1.10 = 3.96M; the only viable subset is c5..c9
    // (4.0M). If hard is processed FIRST (correct), it claims c5..c9 incl.
    // c9 and easy gets the remainder. If easy is processed first, easy
    // would consume c1..c5 and hard can no longer meet 3.96M → marginFallback.
    const opponentPowers = new Map<string, number>([
      ["easy", 1800000],
      ["hard", 3600000],
    ]);

    const result = solveTowerAllocation(rooms, roster, [], undefined, { opponentPowers });
    const hardAssn = result.assignments.get("hard")!;
    const easyAssn = result.assignments.get("easy")!;
    const hardChars = hardAssn.characters.map((c) => c.id);
    const easyChars = easyAssn.characters.map((c) => c.id);

    // Strongest character (c9 = 1,000,000) must go to the hard room, not easy.
    expect(hardChars).toContain("c9");
    expect(easyChars).not.toContain("c9");
    expect(hardAssn.marginFallback).toBeFalsy();
    expect(hardAssn.power).toBeGreaterThanOrEqual(3960000);
  });
});

describe("getConfidence — honest margin scale (US-004)", () => {
  it("returns 'strong' when ratio >= 1.30", () => {
    expect(getConfidence(1300, 1000)).toBe("strong");
    expect(getConfidence(2000, 1000)).toBe("strong");
  });

  it("returns 'shouldWork' when 1.10 <= ratio < 1.30", () => {
    expect(getConfidence(1100, 1000)).toBe("shouldWork");
    expect(getConfidence(1200, 1000)).toBe("shouldWork");
    // Just under the strong boundary stays in shouldWork.
    expect(getConfidence(1299, 1000)).toBe("shouldWork");
  });

  it("returns 'risky' when 0.95 <= ratio < 1.10", () => {
    expect(getConfidence(950, 1000)).toBe("risky");
    expect(getConfidence(1000, 1000)).toBe("risky");
    // Just under the shouldWork boundary stays in risky.
    expect(getConfidence(1099, 1000)).toBe("risky");
  });

  it("returns 'likelyLoss' when ratio < 0.95", () => {
    expect(getConfidence(949, 1000)).toBe("likelyLoss");
    expect(getConfidence(500, 1000)).toBe("likelyLoss");
    expect(getConfidence(1, 1000)).toBe("likelyLoss");
  });

  it("boundary 1.30 is 'strong' (inclusive)", () => {
    expect(getConfidence(1300, 1000)).toBe("strong");
  });

  it("boundary 1.10 is 'shouldWork' (inclusive)", () => {
    expect(getConfidence(1100, 1000)).toBe("shouldWork");
  });

  it("boundary 0.95 is 'risky' (inclusive)", () => {
    expect(getConfidence(950, 1000)).toBe("risky");
  });

  it("deprecated single-arg overload assumes opponentPower = teamPower / 1.10 and returns 'shouldWork'", () => {
    // Ratio is exactly SAFETY_MARGIN_DEFAULT (1.10) → shouldWork (inclusive).
    expect(getConfidence(1100)).toBe("shouldWork");
    expect(getConfidence(500000)).toBe("shouldWork");
  });

  it("exposes CONFIDENCE_THRESHOLDS constants matching the PRD spec", () => {
    expect(CONFIDENCE_THRESHOLDS.strong).toBe(1.3);
    expect(CONFIDENCE_THRESHOLDS.shouldWork).toBe(1.1);
    expect(CONFIDENCE_THRESHOLDS.risky).toBe(0.95);
  });
});

describe("solveTowerAllocation — marginPct and likelyLoss in result (US-004)", () => {
  it("includes a rounded marginPct on every assignment (opponent-aware path)", () => {
    const roster = Array.from({ length: 5 }, (_, i) =>
      makeChar(`c${i}`, { power: 200000 })
    );
    const rooms = [makeRoom("r1")];
    // Team power = 1,000,000; opponent 800,000 → margin = 25%.
    const opponentPowers = new Map<string, number>([["r1", 800000]]);

    const result = solveTowerAllocation(rooms, roster, [], undefined, { opponentPowers });
    const assn = result.assignments.get("r1")!;
    expect(assn.marginPct).toBe(25);
    expect(assn.reason).toMatch(/25%/);
    expect(assn.reason).toMatch(/stronger than the opponent/i);
  });

  it("marginFallback assignments are tagged 'likelyLoss' when team is far below opponent", () => {
    const roster = Array.from({ length: 5 }, (_, i) =>
      makeChar(`c${i}`, { power: 100000 })
    );
    const rooms = [makeRoom("r1")];
    // Team power 500k vs opponent 1M → ratio 0.50 → likelyLoss.
    const opponentPowers = new Map<string, number>([["r1", 1000000]]);

    const result = solveTowerAllocation(rooms, roster, [], undefined, { opponentPowers });
    const assn = result.assignments.get("r1")!;
    expect(assn.marginFallback).toBe(true);
    expect(assn.confidence).toBe("likelyLoss");
    expect(assn.marginPct).toBe(-50);
  });

  it("legacy path (no opponent power) sets marginPct ≈ 10 via deprecated overload", () => {
    const roster = Array.from({ length: 5 }, (_, i) =>
      makeChar(`c${i}`, { power: 200000 })
    );
    const rooms = [makeRoom("r1")];

    const result = solveTowerAllocation(rooms, roster, []);
    const assn = result.assignments.get("r1")!;
    expect(assn.marginPct).toBe(10);
    expect(assn.confidence).toBe("shouldWork");
  });
});

describe("solveTowerAllocation — composite re-ranking (US-006)", () => {
  it("prefers a counter-relevant team over an equal-power team without counters", () => {
    // 10 eligible characters, all the same power so no team wins on power
    // alone. Opponent has heal+revive (very dangerous if uncountered).
    const roster = Array.from({ length: 10 }, (_, i) =>
      makeChar(`c${i}`, { power: 250_000, traits: ["Mutant"] })
    );
    const opponentPowers = new Map<string, number>([["r1", 1_000_000]]);
    const opponentTags = new Map<string, string[]>([
      ["r1", ["heal", "revive"]],
    ]);
    // Only c0..c4 have counters; c5..c9 have nothing useful.
    const characterTags: Record<string, string[]> = {
      c0: ["heal_block"],
      c1: ["revive_block"],
      c2: ["heal"],
      c3: ["taunt"],
      c4: ["ability_block"],
      c5: [],
      c6: [],
      c7: [],
      c8: [],
      c9: [],
    };

    const result = solveTowerAllocation(
      [makeRoom("r1")],
      roster,
      [],
      undefined,
      { opponentPowers, opponentTags, characterTags },
    );
    const assn = result.assignments.get("r1")!;
    const chosenIds = assn.characters.map((c) => c.id).sort();
    // The composite-winning team is the counter-loaded c0..c4.
    expect(chosenIds).toEqual(["c0", "c1", "c2", "c3", "c4"]);
    expect(assn.compositeScore).toBeDefined();
    expect(assn.compositeScore!.counter).toBeGreaterThan(0);
    expect(assn.compositeScore!.total).toBeGreaterThan(0);
  });

  it("does NOT activate composite re-ranking when characterTags is omitted (back-compat)", () => {
    // Same roster as above; without tags the solver falls back to the
    // smallest-viable-subset behavior from US-003.
    const roster = Array.from({ length: 10 }, (_, i) =>
      makeChar(`c${i}`, { power: 100_000 + i * 50_000 })
    );
    const opponentPowers = new Map<string, number>([["r1", 950_000]]);
    const result = solveTowerAllocation(
      [makeRoom("r1")],
      roster,
      [],
      undefined,
      { opponentPowers },
    );
    const assn = result.assignments.get("r1")!;
    expect(assn.compositeScore).toBeUndefined();
    // Same expectation as the US-003 mid-power test — strictly less than the
    // strongest 5 (2,250k) and strictly greater than the weakest 5 (1,000k).
    expect(assn.power).toBeLessThan(2_250_000);
    expect(assn.power).toBeGreaterThan(1_000_000);
  });

  it("preserves the safety-margin gate — composite only re-ranks teams that pass the gate", () => {
    // Weak roster against a strong opponent: no subset passes the margin
    // gate, so the solver falls back to strongest team and DOES NOT attempt
    // composite re-ranking (compositeScore stays undefined).
    const roster = Array.from({ length: 5 }, (_, i) =>
      makeChar(`c${i}`, { power: 100_000 })
    );
    const opponentPowers = new Map<string, number>([["r1", 1_000_000]]);
    const opponentTags = new Map<string, string[]>([["r1", ["heal"]]]);
    const characterTags: Record<string, string[]> = {
      c0: ["heal_block"],
      c1: [],
      c2: [],
      c3: [],
      c4: [],
    };
    const result = solveTowerAllocation(
      [makeRoom("r1")],
      roster,
      [],
      undefined,
      { opponentPowers, opponentTags, characterTags },
    );
    const assn = result.assignments.get("r1")!;
    expect(assn.marginFallback).toBe(true);
    expect(assn.compositeScore).toBeUndefined();
  });
});

describe("getConfidenceFromComposite — composite confidence label (US-007)", () => {
  it("exposes COMPOSITE_CONFIDENCE_THRESHOLDS matching the PRD spec", () => {
    expect(COMPOSITE_CONFIDENCE_THRESHOLDS.strong).toBe(75);
    expect(COMPOSITE_CONFIDENCE_THRESHOLDS.shouldWork).toBe(55);
    expect(COMPOSITE_CONFIDENCE_THRESHOLDS.risky).toBe(35);
  });

  it("returns 'strong' when total >= 75", () => {
    expect(getConfidenceFromComposite(75)).toBe("strong");
    expect(getConfidenceFromComposite(100)).toBe("strong");
  });

  it("returns 'shouldWork' when 55 <= total < 75", () => {
    expect(getConfidenceFromComposite(55)).toBe("shouldWork");
    expect(getConfidenceFromComposite(74)).toBe("shouldWork");
  });

  it("returns 'risky' when 35 <= total < 55", () => {
    expect(getConfidenceFromComposite(35)).toBe("risky");
    expect(getConfidenceFromComposite(54)).toBe("risky");
  });

  it("returns 'likelyLoss' when total < 35", () => {
    expect(getConfidenceFromComposite(34)).toBe("likelyLoss");
    expect(getConfidenceFromComposite(0)).toBe("likelyLoss");
  });
});

describe("solveTowerAllocation — composite-derived confidence (US-007)", () => {
  it("when composite is computed, confidence label derives from composite total (not raw margin)", () => {
    // High raw-margin team (4x opponent power) BUT zero counter coverage,
    // zero faction synergy → composite total should fall below 75 and the
    // confidence should NOT be the margin-based "strong".
    // Power-margin score: ratio 4.0, extra 4.0 - 1.10 = 2.90, normalized
    // clipped to 1 → 100. Synergy 0 (Mutant not in FACTION_PASSIVES). Counter
    // 0 (no opp tags counter-mapped, see below). Role balance: all chars
    // tagged neither healer nor tank → all damage → only the damage bucket
    // activates → ~33. Total ≈ 100*0.45 + 0 + 0 + 33*0.10 = 48 → "risky".
    const roster = Array.from({ length: 5 }, (_, i) =>
      makeChar(`c${i}`, { power: 800_000 })
    );
    const opponentPowers = new Map<string, number>([["r1", 1_000_000]]);
    const opponentTags = new Map<string, string[]>([["r1", []]]);
    const characterTags: Record<string, string[]> = {
      c0: [],
      c1: [],
      c2: [],
      c3: [],
      c4: [],
    };
    const result = solveTowerAllocation(
      [makeRoom("r1")],
      roster,
      [],
      undefined,
      { opponentPowers, opponentTags, characterTags },
    );
    const assn = result.assignments.get("r1")!;
    // Raw margin is +300% (very strong by margin) but composite confidence
    // demotes it to risky because synergy/counter/balance contribute nothing.
    expect(assn.marginPct).toBeGreaterThanOrEqual(200);
    expect(assn.compositeScore).toBeDefined();
    expect(assn.confidence).toBe("risky");
    expect(assn.confidence).not.toBe("strong");
  });

  it("appends the composite-score breakdown numbers to the reason string", () => {
    const roster = Array.from({ length: 5 }, (_, i) =>
      makeChar(`c${i}`, { power: 800_000 })
    );
    const opponentPowers = new Map<string, number>([["r1", 1_000_000]]);
    const opponentTags = new Map<string, string[]>([["r1", []]]);
    const characterTags: Record<string, string[]> = {
      c0: [], c1: [], c2: [], c3: [], c4: [],
    };
    const result = solveTowerAllocation(
      [makeRoom("r1")],
      roster,
      [],
      undefined,
      { opponentPowers, opponentTags, characterTags },
    );
    const assn = result.assignments.get("r1")!;
    expect(assn.reason).toMatch(/Score \d+\/100/);
    expect(assn.reason).toMatch(/power \d+/);
    expect(assn.reason).toMatch(/synergy \d+/);
    expect(assn.reason).toMatch(/counter \d+/);
    expect(assn.reason).toMatch(/balance \d+/);
  });
});
