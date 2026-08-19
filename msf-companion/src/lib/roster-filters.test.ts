import { describe, expect, it } from "vitest";
import {
  applyFilters,
  countActiveFilters,
  DEFAULT_FILTERS,
  type RosterCharacter,
} from "./roster-filters";

const characters: RosterCharacter[] = [
  {
    id: "bio-blaster",
    traits: ["Bio", "Hero", "Cosmic", "Blaster", "Avengers"],
    playable: true,
    power: 100_000,
    yellowStars: 7,
    redStars: 8,
    gearTier: 18,
  },
  {
    id: "bio-support",
    traits: ["BIO", "VILLAIN", "CITY", "SUPPORT", "Avengers"],
    playable: true,
    power: 90_000,
    yellowStars: 6,
    redStars: 6,
    gearTier: 17,
  },
  {
    id: "tech-blaster",
    traits: ["Tech", "Hero", "Global", "Blaster", "Raid"],
    playable: true,
    power: 80_000,
    yellowStars: 5,
    redStars: 5,
    gearTier: 16,
  },
];

describe("roster filters", () => {
  it("uses AND across origin and role categories", () => {
    const result = applyFilters(characters, {
      ...DEFAULT_FILTERS,
      origins: ["BIO"],
      alignments: ["HERO"],
      locations: ["COSMIC"],
      roles: ["BLASTER"],
    });

    expect(result.map((character) => character.id)).toEqual(["bio-blaster"]);
  });

  it("uses OR within one category and matches traits case-insensitively", () => {
    const result = applyFilters(characters, {
      ...DEFAULT_FILTERS,
      origins: ["bio", "tech"],
      roles: ["blaster"],
    });

    expect(result.map((character) => character.id)).toEqual([
      "bio-blaster",
      "tech-blaster",
    ]);
  });

  it("combines team, progression, and power constraints", () => {
    const result = applyFilters(characters, {
      ...DEFAULT_FILTERS,
      teams: ["AVENGERS"],
      diamondMin: 1,
      powerMin: 95_000,
    });

    expect(result.map((character) => character.id)).toEqual(["bio-blaster"]);
  });

  it("counts each trait category as a separate active filter", () => {
    expect(
      countActiveFilters({
        ...DEFAULT_FILTERS,
        origins: ["BIO"],
        alignments: ["HERO"],
        locations: ["COSMIC"],
        roles: ["BLASTER"],
      }),
    ).toBe(4);
  });
});
