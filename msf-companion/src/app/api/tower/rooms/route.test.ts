import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "./route";
import { NextRequest } from "next/server";

vi.mock("@/lib/session", () => ({
  getSession: vi.fn(),
}));

vi.mock("@/lib/msf-api", () => ({
  msfApiFetch: vi.fn(),
}));

import { getSession } from "@/lib/session";
import { msfApiFetch } from "@/lib/msf-api";

function createRequest(url: string): NextRequest {
  return new NextRequest(new URL(url, "http://localhost:3000"));
}

describe("Tower Rooms API Route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when user is not authenticated", async () => {
    (getSession as any).mockResolvedValue({ accessToken: undefined });

    const response = await GET(createRequest("/api/tower/rooms?towerId=tower1"));
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe("Unauthorized");
  });

  it("returns 400 when towerId is missing", async () => {
    (getSession as any).mockResolvedValue({ accessToken: "valid-token" });

    const response = await GET(createRequest("/api/tower/rooms"));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("towerId query parameter required");
  });

  it("returns 404 when tower is not found", async () => {
    (getSession as any).mockResolvedValue({ accessToken: "valid-token" });
    (msfApiFetch as any).mockRejectedValue(new Error("MSF API error 404: Not Found"));

    const response = await GET(createRequest("/api/tower/rooms?towerId=bad-id"));
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toBe("Tower not found");
  });

  it("returns rooms ordered by ray (A, B, C) and room ID", async () => {
    (getSession as any).mockResolvedValue({ accessToken: "valid-token" });
    (msfApiFetch as any).mockResolvedValue({
      rays: [
        {
          id: "ray_b",
          rooms: [
            { id: "room_b1", name: "B1", traits: ["Mutant"], minGearTier: 16, minStars: 5, minLevel: 85, week: 1 },
          ],
        },
        {
          id: "ray_a",
          rooms: [
            { id: "room_a2", name: "A2", traits: ["Bio"], minGearTier: 17, minStars: 6, minLevel: 90, week: 2 },
            { id: "room_a1", name: "A1", traits: ["Tech"], minGearTier: 15, minStars: 4, minLevel: 80, week: 1 },
          ],
        },
      ],
    });

    const response = await GET(createRequest("/api/tower/rooms?towerId=tower1"));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toHaveLength(3);
    // Ray A rooms first, sorted by ID
    expect(data[0].rayId).toBe("ray_a");
    expect(data[0].id).toBe("room_a1");
    expect(data[1].rayId).toBe("ray_a");
    expect(data[1].id).toBe("room_a2");
    // Then ray B
    expect(data[2].rayId).toBe("ray_b");
    expect(data[2].id).toBe("room_b1");
  });

  it("passes user access token to msfApiFetch", async () => {
    (getSession as any).mockResolvedValue({ accessToken: "user-token-123" });
    (msfApiFetch as any).mockResolvedValue({ rays: [] });

    await GET(createRequest("/api/tower/rooms?towerId=tower1"));

    expect(msfApiFetch).toHaveBeenCalledWith({
      path: "/player/v1/survivalTowers/tower1",
      accessToken: "user-token-123",
    });
  });

  it("correctly maps room requirements and week", async () => {
    (getSession as any).mockResolvedValue({ accessToken: "valid-token" });
    (msfApiFetch as any).mockResolvedValue({
      rays: [
        {
          id: "ray_a",
          rooms: [
            { id: "room_1", name: "Floor 1", traits: ["Mutant", "X-Men"], minGearTier: 17, minStars: 7, minLevel: 95, week: 2 },
          ],
        },
      ],
    });

    const response = await GET(createRequest("/api/tower/rooms?towerId=tower1"));
    const data = await response.json();

    expect(data[0]).toEqual({
      id: "room_1",
      rayId: "ray_a",
      name: "Floor 1",
      requirements: {
        traits: ["Mutant", "X-Men"],
        minGearTier: 17,
        minStars: 7,
        minLevel: 95,
      },
      week: 2,
    });
  });
});
