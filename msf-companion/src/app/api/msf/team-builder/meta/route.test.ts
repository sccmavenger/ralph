import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";

vi.mock("@/lib/auth", () => ({
  getValidAccessTokenWithRefresh: vi.fn(),
}));

vi.mock("@/lib/msf-api", () => ({
  msfApiFetch: vi.fn(),
}));

import { GET } from "./route";
import { getValidAccessTokenWithRefresh } from "@/lib/auth";
import { msfApiFetch } from "@/lib/msf-api";
import { clearCache } from "@/lib/planner-cache";

const mockToken = getValidAccessTokenWithRefresh as unknown as Mock;
const mockMsfFetch = msfApiFetch as unknown as Mock;

beforeEach(() => {
  clearCache();
  mockToken.mockReset();
  mockMsfFetch.mockReset();
});

describe("GET /api/msf/team-builder/meta", () => {
  it("returns 401 without an access token", async () => {
    mockToken.mockResolvedValue(null);

    const response = await GET();

    expect(response.status).toBe(401);
    expect(mockMsfFetch).not.toHaveBeenCalled();
  });

  it("normalizes valid five-character squads and rejects malformed entries", async () => {
    mockToken.mockResolvedValue("user-token");
    mockMsfFetch.mockResolvedValue({
      data: {
        arena: [
          { squad: ["one", "two", "three", "four", "five"], total: 42 },
          { squad: ["one", "one", "three", "four", "five"], total: 99 },
          { squad: ["one", "two"], total: 1 },
          { squad: ["one", "two", "three", "four", "six"], total: "bad" },
        ],
      },
    });

    const response = await GET();
    const body = await response.json();
    const arena = body.data.find((entry: { mode: string }) => entry.mode === "arena");

    expect(response.status).toBe(200);
    expect(arena.teams).toEqual([
      { squad: ["one", "two", "three", "four", "five"], total: 42 },
    ]);
  });

  it("falls back to sequential paginated mode endpoints on response-too-large", async () => {
    mockToken.mockResolvedValue("user-token");
    mockMsfFetch.mockImplementation(({ path }: { path: string }) => {
      if (path === "/game/v1/analysis/teamOrder") {
        throw new Error("MSF API error 472: RESPONSE_TOO_LARGE");
      }
      if (path === "/game/v1/analysis/teamOrder/roster?page=1&perPage=200") {
        return {
          data: [{ squad: ["one", "two", "three", "four", "five"], total: 10 }],
          meta: { perTotal: 201 },
        };
      }
      if (path === "/game/v1/analysis/teamOrder/roster?page=2&perPage=200") {
        return {
          data: [{ squad: ["six", "seven", "eight", "nine", "ten"], total: 5 }],
        };
      }
      return { data: [], meta: { perTotal: 0 } };
    });

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data[0]).toMatchObject({ mode: "roster" });
    expect(body.data[0].teams).toHaveLength(2);
    expect(mockMsfFetch).toHaveBeenNthCalledWith(2, {
      path: "/game/v1/analysis/teamOrder/roster?page=1&perPage=200",
      accessToken: "user-token",
    });
    expect(mockMsfFetch).toHaveBeenNthCalledWith(3, {
      path: "/game/v1/analysis/teamOrder/roster?page=2&perPage=200",
      accessToken: "user-token",
    });
    expect(mockMsfFetch).toHaveBeenCalledTimes(12);
  });

  it("attaches War and Crucible performance evidence without conflating it with usage", async () => {
    mockToken.mockResolvedValue("user-token");
    const squad = ["one", "two", "three", "four", "five"];
    mockMsfFetch.mockImplementation(({ path }: { path: string }) => {
      if (path === "/game/v1/analysis/teamOrder") {
        return {
          data: {
            war: [{ squad, total: 2_500 }],
            crucible: [{ squad, total: 1_500 }],
          },
        };
      }
      if (path.startsWith("/game/v1/analysis/war/offense")) {
        return { data: [{ squad, total: 1_000, wins: 900 }] };
      }
      if (path.startsWith("/game/v1/analysis/war/defense")) {
        return { data: [{ squad, total: 500, wins: 200 }] };
      }
      if (path.startsWith("/game/v1/analysis/crucible/defense")) {
        return { data: [{ squad, defends: 300, defeats: 100 }] };
      }
      throw new Error(`Unexpected path: ${path}`);
    });

    const response = await GET();
    const body = await response.json();
    const war = body.data.find((entry: { mode: string }) => entry.mode === "war");
    const crucible = body.data.find(
      (entry: { mode: string }) => entry.mode === "crucible",
    );

    expect(war.teams[0]).toMatchObject({
      total: 2_500,
      performance: [
        { context: "war-offense", sampleSize: 1_000, successes: 900, rate: 0.9 },
        { context: "war-defense", sampleSize: 500, successes: 200, rate: 0.4 },
      ],
    });
    expect(crucible.teams[0].performance[0]).toMatchObject({
      context: "crucible-defense",
      sampleSize: 300,
      successes: 200,
    });
    expect(crucible.teams[0].performance[0].rate).toBeCloseTo(2 / 3);
    expect(body.performanceSources).toEqual([
      "war-offense",
      "war-defense",
      "crucible-defense",
    ]);
    expect(body.generatedAt).toEqual(expect.any(String));

    await GET();
    expect(mockMsfFetch).toHaveBeenCalledTimes(4);
  });

  it("returns a retryable 502 for non-size upstream failures", async () => {
    mockToken.mockResolvedValue("user-token");
    mockMsfFetch.mockRejectedValue(new Error("MSF API error 503"));

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(body).toMatchObject({ code: "MSF_API_ERROR", retryable: true });
    expect(mockMsfFetch).toHaveBeenCalledTimes(1);
  });
});
