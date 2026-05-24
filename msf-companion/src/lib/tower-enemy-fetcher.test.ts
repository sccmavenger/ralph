import { describe, it, expect, beforeEach, vi, type Mock } from "vitest";

vi.mock("@/lib/msf-api", () => ({
  msfApiFetch: vi.fn(),
}));

import { msfApiFetch } from "@/lib/msf-api";
import {
  clearEnemyTeamCache,
  getEnemyTeam,
  getEnemyTeamsForRooms,
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
