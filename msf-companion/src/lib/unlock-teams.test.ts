import { describe, it, expect } from "vitest";
import { selectUnlockTeams, type RosterEntry } from "./unlock-teams";
import type { NormalizedEvent, NormalizedEncounter } from "./planner-events";

/** Minimal encounter builder for tests. */
function enc(
  partial: Partial<NormalizedEncounter> & { filters: NormalizedEncounter["filters"] },
): NormalizedEncounter {
  return {
    chapter: 1,
    tier: 1,
    minCharacters: 5,
    maxCharacters: null,
    missionCharacters: false,
    ...partial,
  };
}

function filter(
  partial: Partial<NormalizedEncounter["filters"][number]>,
): NormalizedEncounter["filters"][number] {
  return {
    traits: [],
    specificCharacters: [],
    minGearTier: null,
    minStars: null,
    minLevel: null,
    ...partial,
  };
}

function event(partial: Partial<NormalizedEvent>): NormalizedEvent {
  return {
    id: "EVT",
    name: "Unlock X",
    type: "episodic",
    startTime: "",
    endTime: "",
    requirements: {
      traits: [],
      specificCharacters: [],
      minGearTier: null,
      minStars: null,
      minLevel: null,
    },
    encounters: [],
    prerequisites: [],
    ...partial,
  };
}

const roster: RosterEntry[] = [
  { id: "NEBULA", name: "Nebula", traits: ["Kree"], gearTier: 13, stars: 5 },
  { id: "RONAN", name: "Ronan", traits: ["Kree"], gearTier: 13, stars: 5 },
  { id: "GAMORA", name: "Gamora", traits: ["Kree"], gearTier: 11, stars: 5 },
  { id: "KORATH", name: "Korath", traits: ["Kree"], gearTier: 13, stars: 5 },
];

describe("selectUnlockTeams", () => {
  it("TC-008.1 lists all non-mission encounters as teams with their required characters + gates", () => {
    const evt = event({
      encounters: [
        enc({ tier: 1, filters: [filter({ specificCharacters: ["NEBULA"], minGearTier: 13 })] }),
        enc({ tier: 2, filters: [filter({ specificCharacters: ["RONAN"], minGearTier: 13 })] }),
        enc({ tier: 3, filters: [filter({ specificCharacters: ["GAMORA"], minGearTier: 13 })] }),
      ],
    });

    const view = selectUnlockTeams(evt, roster);

    expect(view.teams).toHaveLength(3);
    expect(view.teams.map((t) => t.tier)).toEqual([1, 2, 3]);
    expect(view.teams[0].characters).toHaveLength(1);
    expect(view.teams[0].characters[0]).toMatchObject({
      id: "NEBULA",
      requiredGear: 13,
    });
    expect(view.teams[2].characters[0]).toMatchObject({
      id: "GAMORA",
      requiredGear: 13,
    });
  });

  it("TC-008.2 flags an under-gate character and marks an at/above character ok", () => {
    const evt = event({
      encounters: [
        enc({
          filters: [
            filter({ specificCharacters: ["GAMORA", "NEBULA"], minGearTier: 13 }),
          ],
        }),
      ],
    });

    const view = selectUnlockTeams(evt, roster);
    const chars = view.teams[0].characters;

    const gamora = chars.find((c) => c.id === "GAMORA")!;
    expect(gamora.currentGear).toBe(11);
    expect(gamora.requiredGear).toBe(13);
    expect(gamora.status).toBe("under");

    const nebula = chars.find((c) => c.id === "NEBULA")!;
    expect(nebula.currentGear).toBe(13);
    expect(nebula.status).toBe("ok");

    expect(view.underGate.map((c) => c.id)).toEqual(["GAMORA"]);
  });

  it("TC-008.3 excludes mission-only encounters from the roster-gap list", () => {
    const evt = event({
      encounters: [
        enc({ tier: 1, filters: [filter({ specificCharacters: ["GAMORA"], minGearTier: 13 })] }),
        enc({ tier: 2, missionCharacters: true, filters: [] }),
      ],
    });

    const view = selectUnlockTeams(evt, roster);

    expect(view.teams).toHaveLength(1);
    expect(view.teams[0].tier).toBe(1);
  });

  it("TC-008.4 surfaces prerequisites when present and none when absent", () => {
    const withPrereq = selectUnlockTeams(
      event({
        prerequisites: [{ type: "campaign", id: "ECM_MORGAN_C" }],
        encounters: [enc({ filters: [filter({ specificCharacters: ["NEBULA"] })] })],
      }),
      roster,
    );
    expect(withPrereq.prerequisites).toEqual([
      { type: "campaign", id: "ECM_MORGAN_C" },
    ]);

    const noPrereq = selectUnlockTeams(
      event({ encounters: [enc({ filters: [filter({ specificCharacters: ["NEBULA"] })] })] }),
      roster,
    );
    expect(noPrereq.prerequisites).toEqual([]);
  });

  it("TC-008.5 presents a shared character's gear status consistently across teams", () => {
    const evt = event({
      encounters: [
        enc({ tier: 1, filters: [filter({ specificCharacters: ["GAMORA"], minGearTier: 13 })] }),
        enc({ tier: 2, filters: [filter({ specificCharacters: ["GAMORA"], minGearTier: 13 })] }),
      ],
    });

    const view = selectUnlockTeams(evt, roster);

    const a = view.teams[0].characters.find((c) => c.id === "GAMORA")!;
    const b = view.teams[1].characters.find((c) => c.id === "GAMORA")!;
    expect(a.status).toBe(b.status);
    expect(a.currentGear).toBe(b.currentGear);
    expect(a.status).toBe("under");

    // Deduped once in the roster-gap list.
    expect(view.underGate.filter((c) => c.id === "GAMORA")).toHaveLength(1);
  });

  it("resolves trait gates to matching roster characters with per-character status", () => {
    const evt = event({
      encounters: [enc({ filters: [filter({ traits: ["Kree"], minGearTier: 13 })] })],
    });

    const view = selectUnlockTeams(evt, roster);
    const ids = view.teams[0].characters.map((c) => c.id).sort();
    expect(ids).toEqual(["GAMORA", "KORATH", "NEBULA", "RONAN"]);
    // Only Gamora (G11) is under the G13 gate.
    expect(view.underGate.map((c) => c.id)).toEqual(["GAMORA"]);
  });

  it("marks a named-but-unowned required character as under-gate", () => {
    const evt = event({
      encounters: [enc({ filters: [filter({ specificCharacters: ["APOCALYPSE"], minGearTier: 15 })] })],
    });

    const view = selectUnlockTeams(evt, roster);
    const apoc = view.teams[0].characters[0];
    expect(apoc.owned).toBe(false);
    expect(apoc.status).toBe("under");
    expect(apoc.requiredGear).toBe(15);
  });

  it("is pure — does not mutate its inputs", () => {
    const evt = event({
      encounters: [enc({ filters: [filter({ specificCharacters: ["NEBULA"] })] })],
    });
    const snapshot = JSON.stringify(evt);
    selectUnlockTeams(evt, roster);
    expect(JSON.stringify(evt)).toBe(snapshot);
  });
});
