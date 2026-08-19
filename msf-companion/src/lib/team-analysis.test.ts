import { describe, expect, it } from "vitest";
import {
  analyzeTraitOverlap,
  calculateBuildReadiness,
  calculateTeamStats,
  compareToMeta,
  confidenceAdjustedRate,
  detectPassiveSynergies,
  isNamedTeamTrait,
  recommendationConfidence,
  suggestCharacters,
  type TeamCharacter,
} from "./team-analysis";

function character(
  id: string,
  traits: string[],
  passiveDescription?: string,
): TeamCharacter {
  return {
    id,
    name: id,
    portrait: null,
    power: 100_000,
    level: 100,
    gearTier: 19,
    yellowStars: 7,
    redStars: 7,
    traits,
    abilityKit: {
      basic: null,
      special: null,
      ultimate: null,
      passive: passiveDescription
        ? { id: `${id}-passive`, description: passiveDescription }
        : null,
    },
    stats: {
      health: 100,
      damage: 20,
      armor: 10,
      focus: 5,
      resist: 5,
      speed: 120,
      critChance: 0.1,
      critDamageBonus: 1.3,
      dodgeChance: 0,
      blockChance: 0,
      blockAmount: 0,
      accuracy: 1,
    },
  };
}

describe("team analysis", () => {
  it("categorizes Cosmic as a location and excludes core traits from team names", () => {
    const result = analyzeTraitOverlap([
      character("one", ["Bio", "Hero", "Cosmic", "Blaster", "XMen"]),
      character("two", ["Bio", "Hero", "Cosmic", "Support", "XMen"]),
    ]);

    expect(result.sharedTraits).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ trait: "Bio", category: "origin" }),
        expect.objectContaining({ trait: "Hero", category: "affinity" }),
        expect.objectContaining({ trait: "Cosmic", category: "location" }),
        expect.objectContaining({ trait: "XMen", category: "team" }),
      ]),
    );
    expect(isNamedTeamTrait("Cosmic")).toBe(false);
    expect(isNamedTeamTrait("XMen")).toBe(true);
  });

  it("does not count a passive owner as its own ally", () => {
    const result = detectPassiveSynergies([
      character("solo", ["XMen"], "Grant X-Men allies +20% Damage."),
    ]);

    expect(result.synergies).toEqual([
      expect.objectContaining({
        sourceCharacterId: "solo",
        targetTrait: "XMen",
        beneficiaryCount: 0,
        isActive: false,
      }),
    ]);
  });

  it("preserves full passive text and counts only other beneficiaries", () => {
    const description =
      "Grant S.H.I.E.L.D. allies Defense Up. In War, also grant Speed Up.";
    const result = detectPassiveSynergies(
      [
        character("source", ["Shield"], description),
        character("ally", ["Shield"]),
      ],
      "war",
    );

    expect(result.synergies[0]).toMatchObject({
      description,
      beneficiaryCount: 1,
      isActive: true,
      applicableMode: "war",
    });
  });

  it("recognizes offense and defense wording in mode-specific passives", () => {
    const result = detectPassiveSynergies(
      [
        character(
          "source",
          ["Shield"],
          "On WAR DEFENSE, grant S.H.I.E.L.D. allies Safeguard.",
        ),
        character("ally", ["Shield"]),
      ],
      "arena",
    );

    expect(result.synergies[0]).toMatchObject({
      applicableMode: "war",
      beneficiaryCount: 1,
      isActive: false,
    });
  });

  it("does not match trait names embedded inside unrelated words", () => {
    const result = detectPassiveSynergies([
      character("source", ["Hand"], "Gain Safeguard beforehand."),
      character("ally", ["Hand"]),
    ]);

    expect(result.synergies).toHaveLength(0);
  });

  it("does not generate arbitrary suggestions from generic traits alone", () => {
    const roster = [
      character("selected", ["Bio", "Hero", "Brawler"]),
      character("candidate", ["Bio", "Hero", "Brawler"]),
    ];

    expect(suggestCharacters(["selected"], roster, [], "all")).toEqual([]);
  });

  it("explains meaningful team-trait suggestions accurately", () => {
    const roster = [
      character("selected", ["Mutant", "Hero", "XMen"]),
      character("candidate", ["Mutant", "Hero", "XMen"]),
    ];

    const result = suggestCharacters(["selected"], roster, [], "all");

    expect(result[0]).toMatchObject({
      characterId: "candidate",
      reasons: ["Shares XMen team trait"],
    });
  });

  it("calculates totals and averages without mutating character stats", () => {
    const first = character("one", ["XMen"]);
    const second = character("two", ["XMen"]);
    second.stats.health = 300;
    second.stats.speed = 100;

    const result = calculateTeamStats([first, second]);

    expect(result.total.health).toBe(400);
    expect(result.average.health).toBe(200);
    expect(result.average.speed).toBe(110);
    expect(first.stats.health).toBe(100);
  });

  it("uses sample size to express confidence and adjust performance ranking", () => {
    expect(recommendationConfidence(99)).toBe("Low");
    expect(recommendationConfidence(100)).toBe("Medium");
    expect(recommendationConfidence(1_000)).toBe("High");
    expect(confidenceAdjustedRate(0.9, 10_000)).toBeGreaterThan(
      confidenceAdjustedRate(1, 1),
    );
  });

  it("calculates transparent roster build readiness against the benchmark", () => {
    const ready = character("ready", ["XMen"]);
    ready.gearTier = 16;
    const developing = character("developing", ["XMen"]);
    developing.gearTier = 8;
    developing.yellowStars = 4;
    developing.redStars = 2;

    const result = calculateBuildReadiness([ready, developing]);

    expect(result.readyCount).toBe(1);
    expect(result.totalCount).toBe(2);
    expect(result.percentage).toBeGreaterThan(50);
    expect(result.percentage).toBeLessThan(100);
  });

  it("keeps usage and performance evidence separate when comparing an exact team", () => {
    const squad = ["one", "two", "three", "four", "five"];
    const result = compareToMeta(
      squad,
      [
        {
          mode: "arena",
          teams: [{ squad, total: 3_000 }],
        },
        {
          mode: "war",
          teams: [
            {
              squad,
              total: 2_500,
              performance: [
                {
                  context: "war-offense",
                  sampleSize: 1_000,
                  successes: 900,
                  rate: 0.9,
                },
              ],
            },
          ],
        },
      ],
      "all",
    );

    expect(result.exactMatch).toMatchObject({
      mode: "arena",
      total: 3_000,
      performance: [
        { context: "war-offense", sampleSize: 1_000, rate: 0.9 },
      ],
    });
  });
});
