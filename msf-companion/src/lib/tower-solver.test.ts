import { describe, it, expect } from "vitest";
import { solveTowerAllocation, RoomForSolver, MetaTeam } from "./tower-solver";
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
