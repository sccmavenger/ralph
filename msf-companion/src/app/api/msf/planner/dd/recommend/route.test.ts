import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";

vi.mock("@/lib/auth", () => ({
  getValidAccessTokenWithRefresh: vi.fn(),
  refreshAccessToken: vi.fn(),
}));

vi.mock("@/lib/msf-api", () => ({
  msfApiFetch: vi.fn(),
}));

vi.mock("@/lib/dd-service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/dd-service")>();
  return { ...actual, fetchNode: vi.fn() };
});

import { POST } from "./route";
import { getValidAccessTokenWithRefresh, refreshAccessToken } from "@/lib/auth";
import { msfApiFetch } from "@/lib/msf-api";
import { fetchNode } from "@/lib/dd-service";

const mockToken = getValidAccessTokenWithRefresh as unknown as Mock;
const mockRefresh = refreshAccessToken as unknown as Mock;
const mockMsfFetch = msfApiFetch as unknown as Mock;
const mockFetchNode = fetchNode as unknown as Mock;

function request(mode?: string): Request {
  return new Request("http://localhost/api/msf/planner/dd/recommend", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ddId: "dd7", roomId: "A1", mode }),
  });
}

beforeEach(() => {
  mockToken.mockReset();
  mockRefresh.mockReset();
  mockMsfFetch.mockReset();
  mockFetchNode.mockReset();
  mockToken.mockResolvedValue("old-token");
});

describe("POST /api/msf/planner/dd/recommend", () => {
  it("does not fetch the roster for a fixed mission-team node", async () => {
    mockFetchNode.mockResolvedValue({
      roomId: "A1",
      requirements: { missionCharacters: true, maxCharacters: 5 },
    });

    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      missionCharacters: true,
      primaryTeam: [],
    });
    expect(mockMsfFetch).not.toHaveBeenCalled();
  });

  it("fetches roster pages sequentially in safe groups of 25", async () => {
    mockFetchNode.mockResolvedValue({
      roomId: "A1",
      requirements: { maxCharacters: 5 },
    });
    mockMsfFetch
      .mockResolvedValueOnce({
        data: [
          {
            id: "one",
            power: 100,
            info: { name: "One", traits: ["Brawler"] },
          },
        ],
        meta: { perTotal: 26 },
      })
      .mockResolvedValueOnce({
        data: [
          {
            id: "two",
            power: 90,
            info: { name: "Two", traits: ["Support"] },
          },
        ],
      });

    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.primaryTeam).toHaveLength(2);
    expect(mockMsfFetch).toHaveBeenNthCalledWith(1, {
      path: "/player/v1/roster?charInfo=full&page=1&perPage=25",
      accessToken: "old-token",
    });
    expect(mockMsfFetch).toHaveBeenNthCalledWith(2, {
      path: "/player/v1/roster?charInfo=full&page=2&perPage=25",
      accessToken: "old-token",
    });
  });

  it("retries the complete recommendation once with a refreshed token", async () => {
    mockFetchNode
      .mockRejectedValueOnce(new Error("MSF API error 403"))
      .mockResolvedValueOnce({
        roomId: "A1",
        requirements: { missionCharacters: true },
      });
    mockRefresh.mockResolvedValue("fresh-token");

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(mockFetchNode).toHaveBeenNthCalledWith(1, "dd7", "A1", "old-token");
    expect(mockFetchNode).toHaveBeenNthCalledWith(
      2,
      "dd7",
      "A1",
      "fresh-token",
    );
  });

  it("rejects unknown recommendation modes", async () => {
    const response = await POST(request("invented-mode"));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.code).toBe("BAD_REQUEST");
    expect(mockFetchNode).not.toHaveBeenCalled();
  });

  it("uses current cross-mode usage breadth without calling it performance", async () => {
    mockFetchNode.mockResolvedValue({
      roomId: "A1",
      requirements: { maxCharacters: 1 },
    });
    mockMsfFetch.mockImplementation(({ path }: { path: string }) => {
      if (path.startsWith("/player/v1/roster")) {
        return Promise.resolve({
          data: [
            {
              id: "raw-power",
              power: 1_000_000,
              info: { name: "Raw Power", traits: ["Blaster"] },
            },
            {
              id: "broad-value",
              power: 100_000,
              info: { name: "Broad Value", traits: ["Support"] },
            },
          ],
        });
      }
      if (path === "/game/v1/analysis/teamOrder") {
        const squad = ["broad-value", "two", "three", "four", "five"];
        return Promise.resolve({
          data: {
            raids: [{ squad, total: 500 }],
            arena: [{ squad, total: 400 }],
            war: [{ squad, total: 300 }],
            crucible: [{ squad, total: 200 }],
            tower: [{ squad, total: 100 }],
            blitz: [{ squad, total: 50 }],
          },
        });
      }
      throw new Error(`Unexpected MSF path: ${path}`);
    });

    const response = await POST(request("cross-mode-value"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.mode).toBe("cross-mode-value");
    expect(body.modeEvidence.available).toBe(true);
    expect(body.modeEvidence.meaning).toContain("popularity, not wins");
    expect(body.primaryTeam[0]).toMatchObject({ id: "broad-value" });
    expect(body.primaryTeam[0].reasoning).toContain(
      "Observed across 6 current mode datasets",
    );
  });
});
