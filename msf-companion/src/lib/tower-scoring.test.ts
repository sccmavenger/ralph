import { describe, expect, it } from "vitest";
import { counterScore, factionSynergyScore, roleBalanceScore } from "./tower-scoring";
import { COUNTER_MAP, FACTION_PASSIVES, type CounterMap, type FactionPassiveMap } from "./tower-scoring-data";
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

describe("COUNTER_MAP", () => {
  it("includes at least 12 entries covering the required opponent tags", () => {
    const required = [
      "revive",
      "heal",
      "bleed",
      "disrupted",
      "slow",
      "blind",
      "offense_down",
      "defense_down",
      "stun",
      "ability_block",
      "taunt",
      "dispel",
    ];
    for (const tag of required) {
      expect(COUNTER_MAP[tag]).toBeDefined();
      expect(COUNTER_MAP[tag].counteredBy.length).toBeGreaterThan(0);
      expect(COUNTER_MAP[tag].weight).toBeGreaterThan(0);
    }
    expect(Object.keys(COUNTER_MAP).length).toBeGreaterThanOrEqual(12);
  });
});

describe("counterScore", () => {
  it("returns 0 when the opponent has no ability tags", () => {
    expect(counterScore({ a: ["dispel", "heal"] }, [])).toBe(0);
  });

  it("returns 0 when no team character counters any opponent tag", () => {
    const teamTags = { a: ["heal"], b: ["taunt"] };
    const oppTags = ["revive", "stun"];
    expect(counterScore(teamTags, oppTags)).toBe(0);
  });

  it("returns 100 when the team fully counters every opponent tag", () => {
    const teamTags = {
      a: ["revive_block", "heal_block"],
      b: ["ability_block", "dispel"],
    };
    const oppTags = ["revive", "heal", "stun", "slow"];
    expect(counterScore(teamTags, oppTags)).toBe(100);
  });

  it("scales between 0 and 100 with partial coverage", () => {
    // Opponent has revive (12) + slow (5) = 17 max weight.
    // Team only counters revive → 12/17 ≈ 71.
    const teamTags = { a: ["revive_block"] };
    const oppTags = ["revive", "slow"];
    const score = counterScore(teamTags, oppTags);
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThan(100);
    expect(score).toBe(Math.round((12 / 17) * 100));
  });

  it("scores low when the team only covers light threats of a strong opponent kit", () => {
    // Opponent has revive (12) + heal (10) + stun (9) = 31. Team only counters slow-class — none here.
    const teamTags = { a: ["taunt"], b: ["counter_attack"] };
    const oppTags = ["revive", "heal", "stun"];
    expect(counterScore(teamTags, oppTags)).toBe(0);
  });

  it("de-duplicates repeated opponent tags so they aren't double-weighted", () => {
    const teamTags = { a: ["revive_block"] };
    const oppTagsOnce = ["revive"];
    const oppTagsThrice = ["revive", "revive", "revive"];
    expect(counterScore(teamTags, oppTagsThrice)).toBe(
      counterScore(teamTags, oppTagsOnce),
    );
  });

  it("ignores opponent tags that aren't in the counter map", () => {
    const teamTags = { a: ["dispel"] };
    expect(counterScore(teamTags, ["unknown_tag"])).toBe(0);
  });

  it("respects a custom counter map override", () => {
    const custom: CounterMap = {
      foo: { counteredBy: ["bar"], weight: 1 },
    };
    expect(counterScore({ a: ["bar"] }, ["foo"], custom)).toBe(100);
    expect(counterScore({ a: ["baz"] }, ["foo"], custom)).toBe(0);
  });
});

describe("roleBalanceScore", () => {
  it("returns 0 for an empty team", () => {
    expect(roleBalanceScore({})).toBe(0);
  });

  it("scores an all-damage team low (no healer, no frontline)", () => {
    const team = {
      a: ["bleed"],
      b: ["offense_down"],
      c: ["counter_attack"],
      d: ["bleed"],
      e: [],
    };
    // Only the damage component fires (5 damage chars → caps at 1 × 100/3 ≈ 33).
    expect(roleBalanceScore(team)).toBe(33);
  });

  it("scores a healer-only team low (no frontline, no damage past the healer)", () => {
    const team = {
      a: ["heal"],
      b: ["heal"],
      c: ["heal"],
      d: ["heal"],
      e: ["heal"],
    };
    // Healer present (33) but 0 frontline and 0 damage chars → 33.
    expect(roleBalanceScore(team)).toBe(33);
  });

  it("scores a fully balanced team 100 (healer + tank + ≥2 damage)", () => {
    const team = {
      a: ["heal"],
      b: ["taunt"],
      c: ["bleed"],
      d: ["offense_down"],
      e: ["counter_attack"],
    };
    expect(roleBalanceScore(team)).toBe(100);
  });

  it("treats a disruptor as a valid frontline when there's no tank", () => {
    const team = {
      a: ["heal"],
      b: ["ability_block"],
      c: ["bleed"],
      d: ["offense_down"],
      e: ["counter_attack"],
    };
    expect(roleBalanceScore(team)).toBe(100);
  });

  it("scores a full-tank team without a healer ~67 (frontline + damage, no healer)", () => {
    const team = {
      a: ["taunt"],
      b: ["taunt"],
      c: ["taunt"],
      d: ["bleed"],
      e: ["bleed"],
    };
    // Frontline present (33) + 2 damage chars (33) → 67. No healer.
    expect(roleBalanceScore(team)).toBe(67);
  });

  it("scales the damage component down when there's only 1 damage character", () => {
    const team = {
      a: ["heal"],
      b: ["taunt"],
      c: ["taunt"],
      d: ["taunt"],
      e: ["bleed"],
    };
    // Healer (33) + Frontline (33) + 1/2 damage (17) → 83.
    expect(roleBalanceScore(team)).toBe(83);
  });

  it("returns a value in the 0–100 range for any input", () => {
    const team = {
      a: ["heal", "taunt"],
      b: ["heal"],
      c: ["ability_block"],
      d: ["bleed"],
      e: ["bleed"],
    };
    const score = roleBalanceScore(team);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });
});
