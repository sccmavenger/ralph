import { describe, it, expect, beforeEach, vi, type Mock } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth", () => ({
  getValidAccessTokenWithRefresh: vi.fn(),
}));

vi.mock("@/lib/msf-api", () => ({
  msfApiFetch: vi.fn(),
}));

vi.mock("@/lib/tower-fetcher", () => ({
  fetchTowerRooms: vi.fn(),
}));

vi.mock("@/lib/tower-enemy-fetcher", () => ({
  getEnemyTeam: vi.fn(),
}));

vi.mock("@/lib/tower-ability-tags", () => ({
  extractAbilityTags: vi.fn(async () => ({})),
}));

vi.mock("@/lib/tower-solver", () => ({
  solveTowerAllocation: vi.fn(() => ({
    assignments: new Map(),
    unassignableRooms: [],
  })),
}));

import { POST } from "./route";
import { getValidAccessTokenWithRefresh } from "@/lib/auth";
import { msfApiFetch } from "@/lib/msf-api";
import { fetchTowerRooms } from "@/lib/tower-fetcher";
import { getEnemyTeam } from "@/lib/tower-enemy-fetcher";

const mockToken = getValidAccessTokenWithRefresh as unknown as Mock;
const mockMsfFetch = msfApiFetch as unknown as Mock;
const mockFetchRooms = fetchTowerRooms as unknown as Mock;
const mockGetEnemyTeam = getEnemyTeam as unknown as Mock;

function makeRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/tower/solve", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  mockToken.mockReset();
  mockMsfFetch.mockReset();
  mockFetchRooms.mockReset();
  mockGetEnemyTeam.mockReset();
});

describe("/api/tower/solve - opponent power exposure (US-002)", () => {
  it("returns opponentPowers, opponentTeams, and roomFetchErrors", async () => {
    mockToken.mockResolvedValue("user-token");
    mockMsfFetch.mockResolvedValue({
      data: [
        {
          id: "char1",
          info: { name: "Cyclops", traits: ["Mutant"] },
          gearTier: 17,
          activeYellow: 7,
          level: 95,
          power: 250000,
        },
      ],
    });
    mockFetchRooms.mockResolvedValue([
      {
        id: "room_a1",
        rayId: "A",
        name: "A1",
        requirements: { traits: [], minGearTier: 0, minStars: 0, minLevel: 0, minCharacters: 5, maxCharacters: 5, specificCharacters: [], filters: [] },
        week: 1,
        combatId: "combat_a1",
      },
      {
        id: "room_a2",
        rayId: "A",
        name: "A2",
        requirements: { traits: [], minGearTier: 0, minStars: 0, minLevel: 0, minCharacters: 5, maxCharacters: 5, specificCharacters: [], filters: [] },
        week: 1,
        combatId: "combat_a2",
      },
      {
        id: "room_a3",
        rayId: "A",
        name: "A3 (no combat)",
        requirements: { traits: [], minGearTier: 0, minStars: 0, minLevel: 0, minCharacters: 5, maxCharacters: 5, specificCharacters: [], filters: [] },
        week: 1,
        // no combatId
      },
    ]);

    // Two successes (with different powers) and one failure.
    mockGetEnemyTeam.mockImplementation(async (combatId: string) => {
      if (combatId === "combat_a1") {
        return { combatId, units: [{ id: "e1", power: 100000 }], totalPower: 100000 };
      }
      if (combatId === "combat_a2") {
        throw new Error("Upstream 500");
      }
      throw new Error("unexpected combatId " + combatId);
    });

    const res = await POST(makeRequest({ towerId: "tower-event-1" }));
    expect(res.status).toBe(200);
    const json = await res.json();

    expect(json.opponentPowers).toEqual({ room_a1: 100000 });
    expect(json.opponentTeams.room_a1).toMatchObject({
      combatId: "combat_a1",
      totalPower: 100000,
    });
    expect(json.opponentTeams.room_a2).toBeUndefined();
    expect(json.roomFetchErrors).toEqual(["combat_a2"]);

    // Preserves existing response fields.
    expect(json).toHaveProperty("assignments");
    expect(json).toHaveProperty("unassignableRooms");

    // Rooms without combatId are skipped entirely (no fetch attempt, no error).
    const calledCombatIds = mockGetEnemyTeam.mock.calls.map((c) => c[0]);
    expect(calledCombatIds).toEqual(["combat_a1", "combat_a2"]);
  });

  it("returns 401 when there is no user token", async () => {
    mockToken.mockResolvedValue(null);
    const res = await POST(makeRequest({ towerId: "t1" }));
    expect(res.status).toBe(401);
  });

  it("returns 400 when towerId is missing", async () => {
    mockToken.mockResolvedValue("user-token");
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
  });
});
