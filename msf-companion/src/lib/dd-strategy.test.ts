import { describe, expect, it } from "vitest";
import { buildDDNodeStrategy } from "@/lib/dd-strategy";

describe("DD node strategy", () => {
  it("prioritizes support and control threats using the live wave data", () => {
    const strategy = buildDDNodeStrategy({
      left: {
        waves: [
          {
            units: [
              {
                id: "damage",
                stats: { power: 1_000_000 },
                info: { name: "Damage Dealer", traits: ["Blaster"] },
              },
              {
                id: "support",
                stats: { power: 800_000 },
                info: { name: "Key Support", traits: ["Support"] },
              },
            ],
          },
          {
            onFewerThan: 2,
            units: [
              {
                id: "controller",
                stats: { power: 700_000 },
                info: { name: "Key Controller", traits: ["Controller"] },
              },
            ],
          },
        ],
      },
    });

    expect(strategy.targetPriorities[0]).toMatchObject({
      name: "Key Support",
      wave: 1,
    });
    expect(strategy.openingPlan).toContain("Open on Key Support");
    expect(strategy.wavePlan.join(" ")).toContain(
      "Wave 2 enters when fewer than 2 enemies remain",
    );
    expect(strategy.dataNote).toContain("does not invent hidden passive");
  });

  it("does not invent a target order when enemy data is missing", () => {
    const strategy = buildDDNodeStrategy(undefined);

    expect(strategy.targetPriorities).toEqual([]);
    expect(strategy.openingPlan).toContain("cannot be generated");
  });
});
