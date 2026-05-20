import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "./route";
import { msfApiFetch } from "@/lib/msf-api";

vi.mock("@/lib/msf-api", () => ({
  msfApiFetch: vi.fn(),
}));

vi.mock("next/server", () => ({
  NextResponse: {
    json: vi.fn((data, init) => ({
      json: async () => data,
      status: init?.status || 200,
    })),
  },
}));

global.fetch = vi.fn();

describe("Tower Meta Teams API Route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SCOPELY_CLIENT_ID = "test-id";
    process.env.SCOPELY_CLIENT_SECRET = "test-secret";

    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({ access_token: "mock-token" }),
    });
  });

  it("returns teams with correct response shape", async () => {
    (msfApiFetch as any).mockResolvedValue({
      data: [
        { squad: ["char1", "char2", "char3", "char4", "char5"], total: 100, wins: 85 },
        { squad: ["char6", "char7", "char8", "char9", "char10"], total: 50 },
      ],
    });

    const response = await GET();
    const data = await response.json();

    expect(data.teams).toHaveLength(2);
    expect(data.teams[0]).toEqual({
      squad: ["char1", "char2", "char3", "char4", "char5"],
      usageTotal: 100,
      winRate: 0.85,
    });
    expect(data.teams[1]).toEqual({
      squad: ["char6", "char7", "char8", "char9", "char10"],
      usageTotal: 50,
      winRate: undefined,
    });
  });

  it("passes correct API path and params", async () => {
    (msfApiFetch as any).mockResolvedValue({ data: [] });

    await GET();

    expect(msfApiFetch).toHaveBeenCalledWith({
      path: "/game/v1/analysis/teamOrder/tower",
      accessToken: "mock-token",
      params: { perPage: "200" },
    });
  });

  it("returns 500 on API error", async () => {
    (msfApiFetch as any).mockRejectedValue(new Error("API timeout"));

    const response = await GET();

    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data.error).toBe("API timeout");
  });
});
