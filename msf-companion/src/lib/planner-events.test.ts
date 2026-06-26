import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";

vi.mock("@/lib/msf-api", () => ({
  msfApiFetch: vi.fn(),
}));

vi.mock("@/lib/planner-cache", () => ({
  getCached: vi.fn(() => null),
  setCache: vi.fn(),
}));

import { msfApiFetch } from "@/lib/msf-api";
import {
  extractEpisodicEncounters,
  extractEpisodicPrerequisites,
  fetchNormalizedEvents,
} from "./planner-events";

const mockFetch = msfApiFetch as unknown as Mock;

// Real APOCALYPSE HARD tier shapes (from /game/v1/episodics dump).
const apocalypseDetail = {
  data: {
    id: "ECM_APOCALYPSE_C",
    name: "HARD",
    requirements: {
      otherRequirements: {
        allNodeCompletions: [
          { type: "eventCampaign", id: "ECM_MORGAN_C", chapter: 1, tier: 1, completionStars: 3 },
          { type: "eventCampaign", id: "ECM_MORGAN_C", chapter: 1, tier: 2, completionStars: 3 },
        ],
      },
    },
    chapters: {
      "1": {
        tiers: {
          "1": { requirements: { minCharacters: 5, anyCharacterFilters: [{ allTraits: ["Mystic"], gearTier: 15 }] } },
          "5": { requirements: { minCharacters: 3, maxCharacters: 3, anyCharacterFilters: [{ allTraits: ["MSFOriginal"], gearTier: 15 }] } },
          "6": { requirements: { anyCharacterFilters: [{ gearTier: 15 }], specificCharacters: ["MorganLeFay"] } },
          "7": { requirements: { anyCharacterFilters: [{ gearTier: 15 }], specificCharacters: ["Rogue", "Archangel"] } },
          "8": { requirements: { minCharacters: 4, anyCharacterFilters: [{ allTraits: ["Horseman"], gearTier: 15 }] } },
        },
      },
    },
  },
};

const missionOnlyDetail = {
  data: {
    id: "SSE_SPIDERSOCIETY",
    chapters: {
      "1": {
        tiers: {
          "1": { requirements: { missionCharacters: true } },
          "2": { requirements: { missionCharacters: true } },
        },
      },
    },
  },
};

const unlockEventDetail = {
  data: {
    id: "XTREMEXMEN_UNLOCK",
    requirements: null,
    chapters: { "1": { tiers: {} } },
  },
};

describe("extractEpisodicEncounters", () => {
  it("produces one encounter per tier, preserving distinct team gates", () => {
    const encounters = extractEpisodicEncounters(apocalypseDetail);
    expect(encounters).toHaveLength(5);

    const t1 = encounters.find((e) => e.tier === 1)!;
    expect(t1.minCharacters).toBe(5);
    expect(t1.missionCharacters).toBe(false);
    expect(t1.filters[0].traits).toEqual(["Mystic"]);
    expect(t1.filters[0].minGearTier).toBe(15);

    const t5 = encounters.find((e) => e.tier === 5)!;
    expect(t5.minCharacters).toBe(3);
    expect(t5.maxCharacters).toBe(3);
    expect(t5.filters[0].traits).toEqual(["MSFOriginal"]);

    const t8 = encounters.find((e) => e.tier === 8)!;
    expect(t8.minCharacters).toBe(4);
    expect(t8.filters[0].traits).toEqual(["Horseman"]);
  });

  it("attaches the bare gear gate to named specific characters", () => {
    const encounters = extractEpisodicEncounters(apocalypseDetail);

    const t6 = encounters.find((e) => e.tier === 6)!;
    expect(t6.filters).toHaveLength(1);
    expect(t6.filters[0].specificCharacters).toEqual(["MorganLeFay"]);
    expect(t6.filters[0].minGearTier).toBe(15);
    expect(t6.filters[0].traits).toEqual([]);

    const t7 = encounters.find((e) => e.tier === 7)!;
    expect(t7.filters[0].specificCharacters).toEqual(["Rogue", "Archangel"]);
    expect(t7.filters[0].minGearTier).toBe(15);
  });

  it("flags mission tiers and keeps them filter-free", () => {
    const encounters = extractEpisodicEncounters(missionOnlyDetail);
    expect(encounters).toHaveLength(2);
    for (const enc of encounters) {
      expect(enc.missionCharacters).toBe(true);
      expect(enc.filters).toEqual([]);
    }
  });

  it("returns no encounters for an unlock event with no team gates", () => {
    expect(extractEpisodicEncounters(unlockEventDetail)).toEqual([]);
  });
});

describe("extractEpisodicPrerequisites", () => {
  it("collects distinct prerequisite campaigns", () => {
    const prereqs = extractEpisodicPrerequisites(apocalypseDetail);
    expect(prereqs).toEqual([{ type: "eventCampaign", id: "ECM_MORGAN_C" }]);
  });

  it("returns empty when there are no prerequisites", () => {
    expect(extractEpisodicPrerequisites(unlockEventDetail)).toEqual([]);
  });
});

describe("fetchNormalizedEvents", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("normalizes episodic events with encounters, prerequisites, and a derived aggregate", async () => {
    const future = Math.floor(Date.now() / 1000) + 86400;
    mockFetch.mockImplementation(({ path }: { path: string }) => {
      if (path.startsWith("/game/v1/events")) {
        return Promise.resolve({
          data: [
            {
              id: "EVT_APOC",
              name: "Apocalypse",
              type: "episodic",
              endTime: future,
              episodic: { type: "eventCampaign", id: "ECM_APOCALYPSE_C" },
            },
          ],
        });
      }
      if (path.startsWith("/game/v1/episodics")) {
        return Promise.resolve(apocalypseDetail);
      }
      return Promise.resolve({});
    });

    const events = await fetchNormalizedEvents("token", true);
    expect(events).toHaveLength(1);
    const evt = events[0];

    expect(evt.encounters).toHaveLength(5);
    expect(evt.prerequisites).toEqual([{ type: "eventCampaign", id: "ECM_MORGAN_C" }]);

    // Aggregate is the union/max of all encounter filters.
    expect(evt.requirements.minGearTier).toBe(15);
    expect(evt.requirements.traits).toEqual(
      expect.arrayContaining(["Mystic", "MSFOriginal", "Horseman"]),
    );
    expect(evt.requirements.specificCharacters).toEqual(
      expect.arrayContaining(["MorganLeFay", "Rogue", "Archangel"]),
    );
  });

  it("filters out expired events", async () => {
    const past = Math.floor(Date.now() / 1000) - 86400;
    mockFetch.mockImplementation(({ path }: { path: string }) => {
      if (path.startsWith("/game/v1/events")) {
        return Promise.resolve({
          data: [{ id: "OLD", name: "Old", type: "episodic", endTime: past }],
        });
      }
      return Promise.resolve({});
    });

    const events = await fetchNormalizedEvents("token", true);
    expect(events).toEqual([]);
  });

  it("normalizes a blitz event from its single requirements block", async () => {
    const future = Math.floor(Date.now() / 1000) + 86400;
    mockFetch.mockImplementation(({ path }: { path: string }) => {
      if (path.startsWith("/game/v1/events")) {
        return Promise.resolve({
          data: [
            {
              id: "BLITZ1",
              name: "Blitz",
              type: "blitz",
              endTime: future,
              blitz: { requirements: { minCharacters: 5, anyCharacterFilters: [{ anyTraits: ["Villain"], gearTier: 13 }] } },
            },
          ],
        });
      }
      return Promise.resolve({});
    });

    const events = await fetchNormalizedEvents("token", true);
    expect(events).toHaveLength(1);
    expect(events[0].encounters).toHaveLength(1);
    expect(events[0].encounters[0].filters[0].traits).toEqual(["Villain"]);
    expect(events[0].requirements.minGearTier).toBe(13);
  });
});
