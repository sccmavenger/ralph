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

describe("GET /api/msf/team-builder/roster", () => {
  it("returns 401 without an access token", async () => {
    mockToken.mockResolvedValue(null);

    const response = await GET();

    expect(response.status).toBe(401);
    expect(mockMsfFetch).not.toHaveBeenCalled();
  });

  it("uses safe sequential pages and joins passive descriptions", async () => {
    mockToken.mockResolvedValue("user-token");
    mockMsfFetch
      .mockResolvedValueOnce({
        data: [
          {
            id: "char-1",
            passive: 2,
            power: 123_456,
            info: {
              name: "Hero One",
              status: "playable",
              traits: ["Bio", { id: "Blaster" }],
            },
            stats: { health: 100, speed: 120 },
          },
        ],
        meta: { perTotal: 26 },
      })
      .mockResolvedValueOnce({ data: [{ id: "char-26" }] })
      .mockResolvedValueOnce({
        data: [
          {
            id: "char-1",
            abilityKit: {
              passive: {
                levels: {
                  "2": {
                    description: "Grant <color=#86e619>X-Men</color> allies Speed Up.",
                  },
                },
              },
            },
          },
        ],
        meta: { perTotal: 16 },
      })
      .mockResolvedValueOnce({ data: [{ id: "char-26" }] });

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data[0]).toMatchObject({
      id: "char-1",
      name: "Hero One",
      power: 123_456,
      traits: ["Bio", "Blaster"],
      abilityKit: {
        passive: {
          level: 2,
          description: "Grant X-Men allies Speed Up.",
        },
      },
      stats: { health: 100, speed: 120 },
    });
    expect(mockMsfFetch).toHaveBeenNthCalledWith(1, {
      path: "/player/v1/roster?charInfo=full&traitFormat=id&statsFormat=object&page=1&perPage=25",
      accessToken: "user-token",
    });
    expect(mockMsfFetch).toHaveBeenNthCalledWith(2, {
      path: "/player/v1/roster?charInfo=full&traitFormat=id&statsFormat=object&page=2&perPage=25",
      accessToken: "user-token",
    });
    expect(mockMsfFetch).toHaveBeenNthCalledWith(3, {
      path: "/game/v1/characters?abilityKits=full&page=1&perPage=15",
      accessToken: "user-token",
    });
    expect(mockMsfFetch).toHaveBeenNthCalledWith(4, {
      path: "/game/v1/characters?abilityKits=full&page=2&perPage=15",
      accessToken: "user-token",
    });
  });

  it("reuses cached game ability kits across player roster requests", async () => {
    mockToken.mockResolvedValue("user-token");
    mockMsfFetch
      .mockResolvedValueOnce({ data: [{ id: "one" }], meta: { perTotal: 1 } })
      .mockResolvedValueOnce({ data: [], meta: { perTotal: 0 } })
      .mockResolvedValueOnce({ data: [{ id: "two" }], meta: { perTotal: 1 } });

    await GET();
    await GET();

    expect(mockMsfFetch).toHaveBeenCalledTimes(3);
    expect(mockMsfFetch).toHaveBeenNthCalledWith(3, {
      path: "/player/v1/roster?charInfo=full&traitFormat=id&statsFormat=object&page=1&perPage=25",
      accessToken: "user-token",
    });
  });

  it("returns a retryable 502 for upstream failures", async () => {
    mockToken.mockResolvedValue("user-token");
    mockMsfFetch.mockRejectedValue(new Error("MSF API error 502"));

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(body).toMatchObject({ code: "MSF_API_ERROR", retryable: true });
  });
});
