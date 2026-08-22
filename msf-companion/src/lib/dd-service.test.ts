import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearCache } from "@/lib/planner-cache";
import { msfApiFetch } from "@/lib/msf-api";
import {
  DDServiceError,
  fetchAllDDs,
  fetchDD,
  fetchNode,
} from "@/lib/dd-service";

vi.mock("@/lib/msf-api", () => ({
  msfApiFetch: vi.fn(),
}));

const mockMsfApiFetch = vi.mocked(msfApiFetch);

describe("Dark Dimension service", () => {
  beforeEach(() => {
    clearCache();
    mockMsfApiFetch.mockReset();
  });

  it("counts combat rooms in a sparse live rays grid without the entrance", async () => {
    mockMsfApiFetch.mockResolvedValue({
      data: [
        {
          id: "dd9",
          name: "DARK DIMENSION IX",
          combatNodesPerTeam: 3,
          rayCount: 3,
          rayDepth: 3,
          startingRoomId: "A1",
          rays: [
            ["A1", "A2", "A3"],
            ["", "", "B3"],
            ["", "", "B3"],
          ],
        },
      ],
    });

    const result = await fetchAllDDs("token");

    expect(result[0].nodeCount).toBe(3);
  });

  it("omits the entrance when the live detail has no legacy rooms object", async () => {
    mockMsfApiFetch.mockResolvedValue({
      data: {
        id: "dd9",
        name: "DARK DIMENSION IX",
        startingRoomId: "A1",
        rays: [
          ["A1", "A2", "A3"],
          ["", "", "B3"],
        ],
      },
    });

    const result = await fetchDD("dd9", "token");

    expect(result.nodes.map((node) => node.roomId)).toEqual(["A2", "A3", "B3"]);
  });

  it("preserves room metadata while ordering and de-duplicating from rays", async () => {
    mockMsfApiFetch.mockResolvedValue({
      data: {
        id: "dd7",
        startingRoomId: "A1",
        rays: [
          ["A1", "A2"],
          ["", "A2"],
        ],
        rooms: {
          A1: { name: "Entrance" },
          A2: { name: "Boss", isBoss: true },
        },
      },
    });

    const result = await fetchDD("dd7", "token");

    expect(result.nodes).toMatchObject([
      { roomId: "A2", name: "Boss", isBoss: true },
    ]);
  });

  it("normalizes an array of difficulty requirements to normal difficulty", async () => {
    mockMsfApiFetch.mockResolvedValue({
      data: {
        name: "Node A1",
        requirements: [
          { maxCharacters: 5, anyCharacterFilters: [{ gearTier: 18 }] },
          { maxCharacters: 5, anyCharacterFilters: [{ gearTier: 19 }] },
        ],
      },
    });

    const result = await fetchNode("dd9", "A1", "token");

    expect(result.requirements?.anyCharacterFilters?.[0].gearTier).toBe(18);
  });

  it("rejects an empty successful node payload instead of caching false intelligence", async () => {
    mockMsfApiFetch.mockResolvedValue({ data: {} });

    await expect(fetchNode("dd9", "A1", "token")).rejects.toEqual(
      expect.objectContaining<Partial<DDServiceError>>({
        name: "DDServiceError",
        status: 502,
      }),
    );
  });
});
