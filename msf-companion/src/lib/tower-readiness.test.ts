import { describe, it, expect } from "vitest";
import {
  calculateRoomReadiness,
  calculateOverallReadiness,
  Character,
  RoomRequirements,
} from "./tower-readiness";

function makeChar(overrides: Partial<Character> = {}): Character {
  return {
    id: "char_1",
    name: "Test Hero",
    traits: ["Mutant"],
    gearTier: 17,
    stars: 7,
    level: 95,
    power: 150000,
    ...overrides,
  };
}

describe("calculateRoomReadiness", () => {
  const baseRequirements: RoomRequirements = {
    traits: ["Mutant"],
    minGearTier: 16,
    minStars: 5,
    minLevel: 85,
  };

  it("returns 'ready' when 5+ characters meet all thresholds", () => {
    const roster = Array.from({ length: 6 }, (_, i) =>
      makeChar({ id: `char_${i}`, name: `Hero ${i}` })
    );

    const result = calculateRoomReadiness(roster, baseRequirements);
    expect(result.status).toBe("ready");
    expect(result.eligibleCount).toBe(6);
    expect(result.eligibleCharacters).toHaveLength(6);
  });

  it("returns 'almost' when 3-4 characters fully eligible", () => {
    const roster = [
      makeChar({ id: "c1", name: "H1" }),
      makeChar({ id: "c2", name: "H2" }),
      makeChar({ id: "c3", name: "H3" }),
      makeChar({ id: "c4", name: "H4", gearTier: 14 }), // below gear
      makeChar({ id: "c5", name: "H5", traits: ["Bio"] }), // wrong trait
    ];

    const result = calculateRoomReadiness(roster, baseRequirements);
    expect(result.status).toBe("almost");
    expect(result.eligibleCount).toBe(3);
  });

  it("returns 'almost' when 5 characters have traits but one is below one threshold", () => {
    // 4 fully eligible + 1 with right trait but gear is 1 below
    const roster = [
      makeChar({ id: "c1", name: "H1" }),
      makeChar({ id: "c2", name: "H2" }),
      makeChar({ id: "c3", name: "H3" }),
      makeChar({ id: "c4", name: "H4" }),
      makeChar({ id: "c5", name: "H5", gearTier: 15 }), // gear below by 1, trait matches
    ];

    const result = calculateRoomReadiness(roster, baseRequirements);
    // 4 fully eligible makes it "almost" (3-4 range) but actually 4 fully eligible + 1 almost = 5 combined
    // With 4 fully eligible, status should be "almost" since < 5 fully eligible
    expect(result.status).toBe("almost");
  });

  it("returns 'blocked' when fewer than 3 characters eligible", () => {
    const roster = [
      makeChar({ id: "c1", name: "H1" }),
      makeChar({ id: "c2", name: "H2", traits: ["Bio"] }), // wrong trait
      makeChar({ id: "c3", name: "H3", traits: ["Tech"] }), // wrong trait
      makeChar({ id: "c4", name: "H4", traits: ["Skill"] }), // wrong trait
    ];

    const result = calculateRoomReadiness(roster, baseRequirements);
    expect(result.status).toBe("blocked");
    expect(result.eligibleCount).toBe(1);
  });

  it("handles severely-blocked roster with no eligible characters", () => {
    const roster = [
      makeChar({ id: "c1", name: "H1", traits: ["Bio"], gearTier: 10, stars: 3, level: 50 }),
      makeChar({ id: "c2", name: "H2", traits: ["Tech"], gearTier: 11, stars: 4, level: 60 }),
    ];

    const result = calculateRoomReadiness(roster, baseRequirements);
    expect(result.status).toBe("blocked");
    expect(result.eligibleCount).toBe(0);
    expect(result.eligibleCharacters).toHaveLength(0);
  });

  it("handles edge case of exactly 5 with one below gear", () => {
    // Exactly 5 characters with right trait, but one has gear below threshold
    const roster = [
      makeChar({ id: "c1", name: "H1" }),
      makeChar({ id: "c2", name: "H2" }),
      makeChar({ id: "c3", name: "H3" }),
      makeChar({ id: "c4", name: "H4" }),
      makeChar({ id: "c5", name: "H5", gearTier: 15 }), // below gear threshold
    ];

    const result = calculateRoomReadiness(roster, baseRequirements);
    // 4 fully eligible, 1 almost = "almost" status
    expect(result.status).toBe("almost");
    expect(result.eligibleCount).toBe(4);
  });

  it("handles empty traits requirement (any character eligible)", () => {
    const noTraitReq: RoomRequirements = {
      traits: [],
      minGearTier: 16,
      minStars: 5,
      minLevel: 85,
    };

    const roster = Array.from({ length: 5 }, (_, i) =>
      makeChar({ id: `c${i}`, name: `H${i}`, traits: ["Bio"] })
    );

    const result = calculateRoomReadiness(roster, noTraitReq);
    expect(result.status).toBe("ready");
    expect(result.eligibleCount).toBe(5);
  });
});

describe("calculateOverallReadiness", () => {
  it("counts statuses correctly for all-ready roster", () => {
    const statuses = [
      { status: "ready" as const },
      { status: "ready" as const },
      { status: "ready" as const },
    ];

    const result = calculateOverallReadiness(statuses);
    expect(result.readyCount).toBe(3);
    expect(result.almostCount).toBe(0);
    expect(result.blockedCount).toBe(0);
    expect(result.totalRooms).toBe(3);
    expect(result.summary).toBe("You can likely clear 3 of 3 battles this tower");
  });

  it("counts mixed statuses correctly", () => {
    const statuses = [
      { status: "ready" as const },
      { status: "ready" as const },
      { status: "almost" as const },
      { status: "blocked" as const },
      { status: "blocked" as const },
    ];

    const result = calculateOverallReadiness(statuses);
    expect(result.readyCount).toBe(2);
    expect(result.almostCount).toBe(1);
    expect(result.blockedCount).toBe(2);
    expect(result.totalRooms).toBe(5);
    expect(result.summary).toBe("You can likely clear 3 of 5 battles this tower");
  });

  it("handles all-blocked roster", () => {
    const statuses = [
      { status: "blocked" as const },
      { status: "blocked" as const },
    ];

    const result = calculateOverallReadiness(statuses);
    expect(result.readyCount).toBe(0);
    expect(result.almostCount).toBe(0);
    expect(result.blockedCount).toBe(2);
    expect(result.summary).toBe("You can likely clear 0 of 2 battles this tower");
  });
});
