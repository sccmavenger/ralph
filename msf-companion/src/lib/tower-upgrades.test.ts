import { describe, it, expect } from "vitest";
import { getUpgradeRecommendations } from "./tower-upgrades";
import { Character, RoomRequirements, RoomReadiness } from "./tower-readiness";

function makeChar(overrides: Partial<Character> = {}): Character {
  return {
    id: "char_1",
    name: "Jean Grey",
    traits: ["Mutant"],
    gearTier: 16,
    stars: 7,
    level: 95,
    power: 150000,
    ...overrides,
  };
}

function makeRoom(
  id: string,
  requirements: RoomRequirements,
  readiness: RoomReadiness
) {
  return { id, name: `Room ${id}`, requirements, readiness };
}

describe("getUpgradeRecommendations", () => {
  it("identifies gear gap for almost rooms", () => {
    const roster = [
      makeChar({ id: "c1", name: "Jean Grey", gearTier: 16, traits: ["Mutant"] }),
      makeChar({ id: "c2", name: "Wolverine", gearTier: 17, traits: ["Mutant"] }),
      makeChar({ id: "c3", name: "Cyclops", gearTier: 17, traits: ["Mutant"] }),
      makeChar({ id: "c4", name: "Storm", gearTier: 17, traits: ["Mutant"] }),
      makeChar({ id: "c5", name: "Rogue", gearTier: 17, traits: ["Mutant"] }),
    ];

    const rooms = [
      makeRoom(
        "r1",
        { traits: ["Mutant"], minGearTier: 17, minStars: 5, minLevel: 85 },
        { status: "almost", eligibleCount: 4, eligibleCharacters: roster.slice(1) }
      ),
    ];

    const result = getUpgradeRecommendations(rooms, roster);

    expect(result.length).toBeGreaterThan(0);
    const jeanRec = result.find((r) => r.characterName === "Jean Grey");
    expect(jeanRec).toBeDefined();
    expect(jeanRec!.upgradeType).toBe("gear");
    expect(jeanRec!.currentValue).toBe(16);
    expect(jeanRec!.targetValue).toBe(17);
    expect(jeanRec!.roomsUnlocked).toContain("Room r1");
  });

  it("returns results sorted by impact descending", () => {
    const roster = [
      makeChar({ id: "c1", name: "Hero A", gearTier: 15, traits: ["Mutant"] }),
      makeChar({ id: "c2", name: "Hero B", gearTier: 15, traits: ["Bio"] }),
    ];

    const rooms = [
      makeRoom(
        "r1",
        { traits: ["Mutant"], minGearTier: 16, minStars: 5, minLevel: 85 },
        { status: "almost", eligibleCount: 3, eligibleCharacters: [] }
      ),
      makeRoom(
        "r2",
        { traits: ["Mutant"], minGearTier: 16, minStars: 5, minLevel: 85 },
        { status: "almost", eligibleCount: 3, eligibleCharacters: [] }
      ),
    ];

    const result = getUpgradeRecommendations(rooms, roster);

    // Hero A appears in both rooms because they match Mutant trait
    const heroARec = result.find((r) => r.characterName === "Hero A");
    expect(heroARec).toBeDefined();
    expect(heroARec!.impact).toBe(2); // unlocks 2 rooms
    expect(result[0].impact).toBeGreaterThanOrEqual(result[result.length - 1].impact);
  });

  it("caps at maximum 5 recommendations", () => {
    const roster = Array.from({ length: 10 }, (_, i) =>
      makeChar({ id: `c${i}`, name: `Hero ${i}`, gearTier: 15, traits: ["Mutant"] })
    );

    const rooms = Array.from({ length: 10 }, (_, i) =>
      makeRoom(
        `r${i}`,
        { traits: ["Mutant"], minGearTier: 16, minStars: 5, minLevel: 85 },
        { status: "almost", eligibleCount: 3, eligibleCharacters: [] }
      )
    );

    const result = getUpgradeRecommendations(rooms, roster);
    expect(result.length).toBeLessThanOrEqual(5);
  });

  it("provides explanation for blocked rooms", () => {
    const roster = [
      makeChar({ id: "c1", name: "Wolverine", traits: ["Mutant"], gearTier: 14 }),
    ];

    const rooms = [
      makeRoom(
        "r1",
        { traits: ["Mutant"], minGearTier: 17, minStars: 7, minLevel: 95 },
        { status: "blocked", eligibleCount: 0, eligibleCharacters: [] }
      ),
    ];

    const result = getUpgradeRecommendations(rooms, roster);

    // Should have recommendations for the blocked room
    expect(result.length).toBeGreaterThan(0);
    expect(result[0].roomsUnlocked).toContain("Room r1");
  });

  it("returns empty array when all rooms are ready", () => {
    const roster = [makeChar()];
    const rooms = [
      makeRoom(
        "r1",
        { traits: ["Mutant"], minGearTier: 16, minStars: 5, minLevel: 85 },
        { status: "ready", eligibleCount: 5, eligibleCharacters: [] }
      ),
    ];

    const result = getUpgradeRecommendations(rooms, roster);
    expect(result).toHaveLength(0);
  });
});
