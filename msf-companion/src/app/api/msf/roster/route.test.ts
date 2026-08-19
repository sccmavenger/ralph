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

const mockToken = getValidAccessTokenWithRefresh as unknown as Mock;
const mockMsfFetch = msfApiFetch as unknown as Mock;

beforeEach(() => {
  mockToken.mockReset();
  mockMsfFetch.mockReset();
});

describe("GET /api/msf/roster", () => {
  it("returns 401 when the user has no access token", async () => {
    mockToken.mockResolvedValue(null);

    const response = await GET();

    expect(response.status).toBe(401);
    expect(mockMsfFetch).not.toHaveBeenCalled();
  });

  it("fetches every safe-sized page sequentially and normalizes characters", async () => {
    mockToken.mockResolvedValue("user-token");
    mockMsfFetch
      .mockResolvedValueOnce({
        data: [
          {
            id: "char-1",
            level: 100,
            activeYellow: 7,
            activeRed: 9,
            gearTier: 19,
            power: 1_000_000,
            info: {
              name: "Hero One",
              portrait: "hero-one.png",
              traits: ["Bio", { id: "Blaster" }],
            },
          },
        ],
        meta: { perTotal: 52 },
      })
      .mockResolvedValueOnce({ data: [{ id: "char-26" }] })
      .mockResolvedValueOnce({ data: [{ id: "char-51" }] });

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toHaveLength(3);
    expect(body.data[0]).toEqual({
      id: "char-1",
      name: "Hero One",
      portrait: "hero-one.png",
      traits: ["Bio", "Blaster"],
      playable: true,
      level: 100,
      yellowStars: 7,
      redStars: 9,
      gearTier: 19,
      power: 1_000_000,
    });
    expect(mockMsfFetch).toHaveBeenNthCalledWith(1, {
      path: "/player/v1/roster?charInfo=full&traitFormat=id&page=1&perPage=25",
      accessToken: "user-token",
    });
    expect(mockMsfFetch).toHaveBeenNthCalledWith(2, {
      path: "/player/v1/roster?charInfo=full&traitFormat=id&page=2&perPage=25",
      accessToken: "user-token",
    });
    expect(mockMsfFetch).toHaveBeenNthCalledWith(3, {
      path: "/player/v1/roster?charInfo=full&traitFormat=id&page=3&perPage=25",
      accessToken: "user-token",
    });
  });

  it("returns a retryable 502 when any roster page fails", async () => {
    mockToken.mockResolvedValue("user-token");
    mockMsfFetch.mockRejectedValue(new Error("MSF API error 502"));

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(body).toMatchObject({
      code: "MSF_API_ERROR",
      retryable: true,
    });
  });
});
