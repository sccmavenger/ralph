import { describe, expect, it } from "vitest";
import { buildCharacterModeEvidence } from "@/lib/dd-mode-evidence";

describe("DD cross-mode evidence", () => {
  it("counts distinct mode breadth and usage appearances separately", () => {
    const sharedSquad = ["one", "two", "three", "four", "five"];
    const evidence = buildCharacterModeEvidence({
      raids: [{ squad: sharedSquad, total: 100 }],
      war: [
        { squad: sharedSquad, total: 50 },
        { squad: ["one", "six", "seven", "eight", "nine"], total: 25 },
      ],
    });

    expect(evidence.one).toEqual({
      modes: ["raids", "war"],
      totalAppearances: 175,
    });
    expect(evidence.two).toEqual({
      modes: ["raids", "war"],
      totalAppearances: 150,
    });
  });

  it("ignores malformed squads instead of inflating popularity", () => {
    const evidence = buildCharacterModeEvidence({
      arena: [
        { squad: ["one", "one", "two", "three", "four"], total: 999 },
        { squad: ["one", "two"], total: 999 },
      ],
    });

    expect(evidence).toEqual({});
  });
});
