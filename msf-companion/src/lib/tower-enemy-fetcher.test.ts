import { describe, it, expect, beforeEach, vi, type Mock } from "vitest";

vi.mock("@/lib/msf-api", () => ({
  msfApiFetch: vi.fn(),
}));

import { msfApiFetch } from "@/lib/msf-api";
import {
  applyNodeEffects,
  clearEnemyTeamCache,
  getEnemyTeam,
  getEnemyTeamsForRooms,
  type EnemyUnit,
} from "./tower-enemy-fetcher";

const mockFetch = msfApiFetch as unknown as Mock;

function rawResponse(opts: {
  units?: Array<{ id: string; power?: number; name?: string }>;
  nodeHash?: string;
}) {
  const units = (opts.units ?? []).map((u) => ({
    id: u.id,
    power: u.power ?? 0,
    level: 95,
    gearTier: 17,
    activeYellow: 7,
    activeRed: 5,
    stats: { health: 100000 },
    nodeEffects: [],
    iso8: { active: "Skirmisher", level: 5, pips: 5 },
    info: { id: u.id, name: u.name ?? `Hero ${u.id}` },
  }));
  return {
    data: {
      left: { waves: [{ units }] },
    },
    meta: { hashes: { nodes: opts.nodeHash ?? "hash-1" } },
  };
}

beforeEach(() => {
  clearEnemyTeamCache();
  mockFetch.mockReset();
});

describe("getEnemyTeam", () => {
  it("fetches and normalizes a single enemy team", async () => {
    mockFetch.mockResolvedValueOnce(
      rawResponse({
        units: [
          { id: "u1", power: 200000, name: "Cyclops" },
          { id: "u2", power: 150000 },
        ],
      }),
    );

    const team = await getEnemyTeam("combat-A", "tower-1", "token");

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledWith({
      path: "/game/v1/nodeCombats/combat-A",
      accessToken: "token",
      params: {
        charInfo: "full",
        difficulty: "0",
        difficultyGroup: "tower-1",
      },
    });
    expect(team.combatId).toBe("combat-A");
    expect(team.units).toHaveLength(2);
    expect(team.units[0]).toMatchObject({
      id: "u1",
      name: "Cyclops",
      power: 200000,
      level: 95,
      gearTier: 17,
      activeYellow: 7,
      activeRed: 5,
    });
    expect(team.totalPower).toBe(350000);
  });

  it("returns the cached team on subsequent calls for the same combatId", async () => {
    mockFetch.mockResolvedValueOnce(
      rawResponse({ units: [{ id: "u1", power: 100000 }] }),
    );

    const first = await getEnemyTeam("combat-A", "tower-1", "token");
    const second = await getEnemyTeam("combat-A", "tower-1", "token");

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(second).toBe(first);
  });

  it("invalidates the cache when meta.hashes.nodes changes", async () => {
    mockFetch.mockResolvedValueOnce(
      rawResponse({ units: [{ id: "u1", power: 100000 }], nodeHash: "h1" }),
    );
    await getEnemyTeam("combat-A", "tower-1", "token");

    // A different combatId with a NEW nodes hash should flush the cache.
    mockFetch.mockResolvedValueOnce(
      rawResponse({ units: [{ id: "u2", power: 200000 }], nodeHash: "h2" }),
    );
    await getEnemyTeam("combat-B", "tower-1", "token");

    // Now re-request combat-A — cache was cleared, so a new fetch happens.
    mockFetch.mockResolvedValueOnce(
      rawResponse({ units: [{ id: "u1", power: 999999 }], nodeHash: "h2" }),
    );
    const refetched = await getEnemyTeam("combat-A", "tower-1", "token");

    expect(mockFetch).toHaveBeenCalledTimes(3);
    expect(refetched.totalPower).toBe(999999);
  });
});

describe("getEnemyTeamsForRooms", () => {
  it("returns null for rooms without a combatId and skips fetching them", async () => {
    mockFetch.mockResolvedValueOnce(
      rawResponse({ units: [{ id: "u1", power: 50000 }] }),
    );

    const rooms = [
      { id: "r1", combatId: "combat-A" },
      { id: "r2" },
      { id: "r3", combatId: null },
    ];

    const result = await getEnemyTeamsForRooms(rooms, "tower-1", "token");

    expect(result).toHaveLength(3);
    expect(result[0]?.combatId).toBe("combat-A");
    expect(result[1]).toBeNull();
    expect(result[2]).toBeNull();
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});

describe("applyNodeEffects", () => {
  it("returns the unit unchanged when there are no boosts", () => {
    const unit: EnemyUnit = { id: "u1", power: 200000, nodeEffects: { boosts: "" } };
    const adjusted = applyNodeEffects(unit);
    expect(adjusted.power).toBe(200000);

    const noNodeEffects: EnemyUnit = { id: "u2", power: 123456 };
    expect(applyNodeEffects(noNodeEffects).power).toBe(123456);
  });

  it("multiplies power by 1 + sum(boosts)/1000 within +-2% for CSV form '350,150,50,25,25'", () => {
    const base = 100_000;
    // sum = 600 -> multiplier = 1.60
    const unit: EnemyUnit = {
      id: "u1",
      power: base,
      nodeEffects: { boosts: "350,150,50,25,25" },
    };
    const adjusted = applyNodeEffects(unit);
    const expected = base * 1.6;
    const tolerance = expected * 0.02;
    expect(adjusted.power).toBeGreaterThan(base);
    expect(Math.abs((adjusted.power ?? 0) - expected)).toBeLessThanOrEqual(tolerance);
  });

  it("supports the object form of boosts", () => {
    const base = 50_000;
    const unit: EnemyUnit = {
      id: "u1",
      power: base,
      nodeEffects: { boosts: { health: 100, damage: 100, armor: 0, focus: 0, resist: 0 } },
    };
    const adjusted = applyNodeEffects(unit);
    // sum = 200 -> multiplier = 1.20
    expect(adjusted.power).toBe(Math.round(base * 1.2));
  });

  it("EnemyTeam.totalPower reflects adjusted unit power", async () => {
    mockFetch.mockResolvedValueOnce({
      data: {
        left: {
          waves: [
            {
              units: [
                {
                  id: "u1",
                  power: 100_000,
                  info: { id: "u1", name: "Boosted" },
                  nodeEffects: { boosts: "350,150,50,25,25" }, // +60%
                },
                {
                  id: "u2",
                  power: 100_000,
                  info: { id: "u2", name: "Unboosted" },
                  nodeEffects: { boosts: "" },
                },
              ],
            },
          ],
        },
      },
      meta: { hashes: { nodes: "hash-ne-1" } },
    });

    const team = await getEnemyTeam("combat-NE", "tower-1", "token");
    // u1 = 160_000, u2 = 100_000 -> total 260_000
    const tolerance = 260_000 * 0.02;
    expect(Math.abs(team.totalPower - 260_000)).toBeLessThanOrEqual(tolerance);
    expect(team.units[0]?.power).toBeGreaterThan(100_000);
    expect(team.units[1]?.power).toBe(100_000);
  });
});
