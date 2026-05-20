import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "./route";
import { msfApiFetch } from "@/lib/msf-api";
import { NextResponse } from "next/server";

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

// Mock global fetch for getMsfBearerToken
global.fetch = vi.fn();

describe("Tower API Route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SCOPELY_CLIENT_ID = "test-id";
    process.env.SCOPELY_CLIENT_SECRET = "test-secret";
    process.env.MSF_API_KEY = "test-api-key";
    
    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({ access_token: "mock-token" }),
    });
  });

  it("returns active: false when no tower event is found", async () => {
    (msfApiFetch as any).mockResolvedValueOnce({ data: [] }); // events list

    const response = await GET();
    const data = await response.json();

    expect(data).toEqual({ active: false, tower: null });
  });

  it("detects active tower event and returns layout", async () => {
    const now = new Date();
    const startTime = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString(); // 2 days ago
    const endTime = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000).toISOString(); // 5 days from now

    (msfApiFetch as any)
      .mockResolvedValueOnce({
        data: [
          {
            id: "event_tower_1",
            name: "The High Tower",
            type: "pickYourPoison",
            startTime,
            endTime,
          },
        ],
      }) // events list
      .mockResolvedValueOnce({
        data: [{ id: "tower_alpha", name: "Alpha Tower" }],
      }) // towers list
      .mockResolvedValueOnce({
        id: "tower_alpha",
        name: "Alpha Tower",
        rays: [
          {
            id: "ray_1",
            rooms: [{ id: "room_1", name: "Floor 1" }],
          },
        ],
      }); // layout detail

    const response = await GET();
    const data = await response.json();

    expect(data.active).toBe(true);
    expect(data.tower.id).toBe("tower_alpha");
    expect(data.tower.currentWeek).toBe(1);
    expect(data.tower.rays).toHaveLength(1);
    expect(data.tower.rays[0].rooms[0].name).toBe("Floor 1");
  });

  it("calculates week 2 correctly after 7 days", async () => {
    const now = new Date();
    const startTime = new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000).toISOString(); // 8 days ago
    const endTime = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000).toISOString();

    (msfApiFetch as any)
      .mockResolvedValueOnce({
        data: [
          {
            id: "event_tower_1",
            name: "The High Tower",
            type: "pickYourPoison",
            startTime,
            endTime,
          },
        ],
      })
      .mockResolvedValueOnce({ data: [{ id: "t1", name: "T1" }] })
      .mockResolvedValueOnce({ id: "t1", rays: [] });

    const response = await GET();
    const data = await response.json();

    expect(data.tower.currentWeek).toBe(2);
  });
});
