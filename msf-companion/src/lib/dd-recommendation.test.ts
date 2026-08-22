import { describe, expect, it } from "vitest";
import { generateRecommendation } from "@/lib/dd-recommendation";
import type { RosterCharacter } from "@/lib/dd-eligibility";

function character(
  id: string,
  power: number,
  traits: string[] = ["City", "Brawler"],
): RosterCharacter {
  return {
    id,
    power,
    gearTier: 19,
    level: 100,
    activeYellow: 7,
    activeRed: 5,
    info: { name: id, traits },
  };
}

describe("DD recommendations", () => {
  it("reserves a team slot for every compliant required character", () => {
    const roster = [
      character("highest", 1_000_000),
      character("second", 900_000),
      character("third", 800_000),
      character("required", 100_000),
    ];

    const result = generateRecommendation(
      roster,
      undefined,
      3,
      [{ allTraits: ["City"] }],
      ["required"],
    );

    expect(result.primaryTeam.map((member) => member.character.id)).toEqual([
      "required",
      "highest",
      "second",
    ]);
  });

  it("post-validates anyCharacters as part of the full filter", () => {
    const result = generateRecommendation(
      [character("allowed", 500_000), character("not-allowed", 900_000)],
      undefined,
      5,
      [{ allTraits: ["City"], anyCharacters: ["allowed"] }],
    );

    expect(result.primaryTeam.map((member) => member.character.id)).toEqual([
      "allowed",
    ]);
  });

  it("does not treat shared enemy traits as counter evidence", () => {
    const result = generateRecommendation(
      [
        character("z-shares-enemy-trait", 500_000, ["City", "Brawler"]),
        character("a-no-enemy-overlap", 500_000, ["Global", "Brawler"]),
      ],
      {
        left: {
          waves: [
            {
              units: [
                {
                  id: "enemy",
                  level: 100,
                  gearTier: 19,
                  info: { name: "Enemy", traits: ["City", "Brawler"] },
                },
              ],
            },
          ],
        },
      },
      1,
    );

    expect(result.primaryTeam[0].character.id).toBe("a-no-enemy-overlap");
    expect(result.primaryTeam[0].reasoning).not.toContain("trait overlap");
  });

  it("labels the score as roster readiness and keeps it within bounds", () => {
    const result = generateRecommendation(
      [character("ready", 750_000, ["City", "Support"])],
      undefined,
      5,
    );

    expect(result.rosterReadiness).toBeGreaterThanOrEqual(0);
    expect(result.rosterReadiness).toBeLessThanOrEqual(100);
    expect(result).not.toHaveProperty("confidence");
  });

  it("can prioritize current usage breadth for cross-mode value", () => {
    const result = generateRecommendation(
      [
        character("raw-power", 1_000_000, ["City", "Blaster"]),
        character("broad-value", 100_000, ["City", "Support"]),
      ],
      undefined,
      1,
      undefined,
      [],
      "cross-mode-value",
      {
        "broad-value": {
          modes: ["raids", "arena", "war", "crucible", "tower", "blitz"],
          totalAppearances: 10_000,
        },
      },
    );

    expect(result.primaryTeam[0].character.id).toBe("broad-value");
    expect(result.primaryTeam[0].reasoning).toContain(
      "usage is not a win guarantee",
    );
  });

  it("explains that lowest-investment candidates already meet entry requirements", () => {
    const result = generateRecommendation(
      [character("ready", 500_000)],
      undefined,
      1,
      undefined,
      [],
      "lowest-investment",
    );

    expect(result.primaryTeam[0].reasoning).toBe(
      "Already meets every node entry requirement",
    );
  });
});
