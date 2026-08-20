import { describe, expect, it } from "vitest";
import { calculateMetaPerformance, extractCharacterAbilities } from "./kb-official-sync";

describe("official knowledge transformations", () => {
  it("reads the current abilityKit contract and chooses the highest level", () => {
    const abilities = extractCharacterAbilities({
      abilityKit: {
        basic: { name: "Web Shot", levels: { "1": { description: "Old" }, "7": { description: "Final <color=#fff>attack</color>" } } },
      },
    });
    expect(abilities).toEqual([{ name: "Web Shot", description: "Final attack" }]);
  });

  it("calculates Crucible defensive holds rather than losses", () => {
    expect(calculateMetaPerformance("crucible-defense", { defends: 100, defeats: 35 }))
      .toEqual({ successes: 65, total: 100, rate: 65 });
  });

  it("calculates War performance from wins and total", () => {
    expect(calculateMetaPerformance("war-offense", { total: 80, wins: 60 }))
      .toEqual({ successes: 60, total: 80, rate: 75 });
  });
});
