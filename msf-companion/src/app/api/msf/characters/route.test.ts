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

describe("GET /api/msf/characters", () => {
  it("returns 401 when the user has no access token", async () => {
    mockToken.mockResolvedValue(null);

    const response = await GET();

    expect(response.status).toBe(401);
    expect(mockMsfFetch).not.toHaveBeenCalled();
  });

  it("fetches and combines every bounded page", async () => {
    mockToken.mockResolvedValue("user-token");
    mockMsfFetch
      .mockResolvedValueOnce({
        data: [{ id: "char-1", status: "playable" }],
        meta: { page: 1, perPage: 100, perTotal: 201, version: 42 },
      })
      .mockResolvedValueOnce({ data: [{ id: "char-101", status: "playable" }] })
      .mockResolvedValueOnce({ data: [{ id: "char-201", status: "playable" }] });

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toEqual([
      { id: "char-1", status: "playable" },
      { id: "char-101", status: "playable" },
      { id: "char-201", status: "playable" },
    ]);
    expect(body.meta).toEqual({
      page: 1,
      perPage: 3,
      perTotal: 201,
      version: 42,
    });
    expect(mockMsfFetch).toHaveBeenCalledTimes(3);
    expect(mockMsfFetch).toHaveBeenNthCalledWith(1, {
      path: "/game/v1/characters?traitFormat=id&page=1&perPage=100",
      accessToken: "user-token",
    });
    expect(mockMsfFetch).toHaveBeenNthCalledWith(2, {
      path: "/game/v1/characters?traitFormat=id&page=2&perPage=100",
      accessToken: "user-token",
    });
    expect(mockMsfFetch).toHaveBeenNthCalledWith(3, {
      path: "/game/v1/characters?traitFormat=id&page=3&perPage=100",
      accessToken: "user-token",
    });
  });

  it("returns the existing 502 response when an upstream page fails", async () => {
    mockToken.mockResolvedValue("user-token");
    mockMsfFetch.mockRejectedValue(new Error("MSF API error 472"));

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(body).toMatchObject({
      code: "MSF_API_ERROR",
      retryable: true,
    });
  });
});
