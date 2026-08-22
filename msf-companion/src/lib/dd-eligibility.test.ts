import { describe, expect, it } from "vitest";
import {
  filterEligible,
  getActiveIso8Level,
  getRequirementTarget,
  type RosterCharacter,
} from "@/lib/dd-eligibility";
import type { NodeRequirements } from "@/lib/dd-service";

function character(
  id: string,
  traits: string[],
  overrides: Partial<RosterCharacter> = {},
): RosterCharacter {
  return {
    id,
    level: 95,
    gearTier: 19,
    activeYellow: 7,
    activeRed: 5,
    info: { traits },
    ...overrides,
  };
}

describe("DD eligibility", () => {
  it("treats anyCharacters as an allow-list", () => {
    const result = filterEligible(
      [character("required", []), character("other", [])],
      { anyCharacterFilters: [{ anyCharacters: ["required"] }] },
    );

    expect(result.eligible.map((char) => char.id)).toEqual(["required"]);
  });

  it("requires every field inside one CharacterFilter", () => {
    const result = filterEligible(
      [
        character("required", ["City"]),
        character("required-wrong-trait", ["Global"]),
        character("other-city", ["City"]),
      ],
      {
        anyCharacterFilters: [
          { allTraits: ["City"], anyCharacters: ["required"] },
        ],
      },
    );

    expect(result.eligible.map((char) => char.id)).toEqual(["required"]);
  });

  it("reads the active ISO-8 class level from the class-named field", () => {
    const correct = character("correct", ["Global"], {
      iso8: { active: "striker", striker: 4, healer: 5 },
    });
    const wrongClass = character("wrong-class", ["Global"], {
      iso8: { active: "healer", striker: 5, healer: 5 },
    });
    const lowLevel = character("low-level", ["Global"], {
      iso8: { active: "striker", striker: 2 },
    });
    const requirements: NodeRequirements = {
      anyCharacterFilters: [
        { allTraits: ["Global"], iso8Class: "striker", iso8ClassLevel: 3 },
      ],
    };

    const result = filterEligible(
      [correct, wrongClass, lowLevel],
      requirements,
    );

    expect(result.compliant.map((char) => char.id)).toEqual(["correct"]);
    expect(getActiveIso8Level(correct.iso8)).toBe(4);
  });

  it("uses the easiest matching OR filter for an investment target", () => {
    const char = character("cosmic", ["Cosmic"], {
      level: 80,
      gearTier: 15,
    });
    const requirements: NodeRequirements = {
      anyCharacterFilters: [
        { allTraits: ["Cosmic"], level: 90, gearTier: 18 },
        { allTraits: ["Cosmic"], level: 85, gearTier: 16 },
      ],
    };

    expect(getRequirementTarget(char, requirements)).toMatchObject({
      level: 85,
      gearTier: 16,
    });
  });
});
