import { describe, expect, it } from "vitest";
import { factionSynergyScore } from "./tower-scoring";
import { FACTION_PASSIVES, type FactionPassiveMap } from "./tower-scoring-data";
import type { Character } from "./tower-readiness";

function mkChar(id: string, traits: string[]): Character {
  return {
    id,
    name: id,
    traits,
    gearTier: 15,
    stars: 6,
    level: 90,
    power: 200_000,
  };
}

describe("factionSynergyScore", () => {
  it("returns 0 for an empty team", () => {
    expect(factionSynergyScore([], FACTION_PASSIVES)).toBe(0);
  });

  it("returns 0 when no passive activates", () => {
    const team: Character[] = [
      mkChar("a", ["Hero", "Cosmic"]),
      mkChar("b", ["Hero", "Tech"]),
      mkChar("c", ["Villain", "Skill"]),
      mkChar("d", ["Hero", "Bio"]),
      mkChar("e", ["Villain", "Mystic"]),
    ];
    expect(factionSynergyScore(team, FACTION_PASSIVES)).toBe(0);
  });

  it("returns 50 when exactly one passive activates at its threshold (3/5)", () => {
    const team: Character[] = [
      mkChar("a", ["X-Men", "Hero"]),
      mkChar("b", ["X-Men", "Hero"]),
      mkChar("c", ["X-Men", "Hero"]),
      mkChar("d", ["Tech"]),
      mkChar("e", ["Skill"]),
    ];
    expect(factionSynergyScore(team, FACTION_PASSIVES)).toBe(50);
  });

  it("scales above the threshold as more members share the trait (4/5 → 75)", () => {
    const team: Character[] = [
      mkChar("a", ["Asgardian"]),
      mkChar("b", ["Asgardian"]),
      mkChar("c", ["Asgardian"]),
      mkChar("d", ["Asgardian"]),
      mkChar("e", ["Skill"]),
    ];
    expect(factionSynergyScore(team, FACTION_PASSIVES)).toBe(75);
  });

  it("returns 100 when one passive has all 5 team members", () => {
    const team: Character[] = [
      mkChar("a", ["Avenger"]),
      mkChar("b", ["Avenger"]),
      mkChar("c", ["Avenger"]),
      mkChar("d", ["Avenger"]),
      mkChar("e", ["Avenger"]),
    ];
    expect(factionSynergyScore(team, FACTION_PASSIVES)).toBe(100);
  });

  it("returns 100 when two or more passives both activate (multi-passive overlap)", () => {
    const team: Character[] = [
      mkChar("a", ["X-Men", "Brotherhood"]),
      mkChar("b", ["X-Men", "Brotherhood"]),
      mkChar("c", ["X-Men", "Brotherhood"]),
      mkChar("d", ["Tech"]),
      mkChar("e", ["Skill"]),
    ];
    expect(factionSynergyScore(team, FACTION_PASSIVES)).toBe(100);
  });

  it("ignores passives whose minMembers threshold isn't met", () => {
    // Two X-Men (below 3-threshold) should contribute nothing.
    const team: Character[] = [
      mkChar("a", ["X-Men"]),
      mkChar("b", ["X-Men"]),
      mkChar("c", ["Hero"]),
      mkChar("d", ["Hero"]),
      mkChar("e", ["Hero"]),
    ];
    expect(factionSynergyScore(team, FACTION_PASSIVES)).toBe(0);
  });

  it("handles a custom passive map with minMembers === 5 (always 100 on activation)", () => {
    const custom: FactionPassiveMap = {
      OnlyIfAll: {
        trait: "Custom",
        minMembers: 5,
        description: "Activates only when all 5 share the trait.",
      },
    };
    const team: Character[] = [
      mkChar("a", ["Custom"]),
      mkChar("b", ["Custom"]),
      mkChar("c", ["Custom"]),
      mkChar("d", ["Custom"]),
      mkChar("e", ["Custom"]),
    ];
    expect(factionSynergyScore(team, custom)).toBe(100);
  });
});
