import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET, POST } from "./route";
import { NextRequest } from "next/server";

vi.mock("@/lib/session", () => ({
  getSession: vi.fn(),
}));

vi.mock("@/lib/scopely-id", () => ({
  getScopelyId: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    commander: { findUnique: vi.fn() },
    towerResult: { findMany: vi.fn(), upsert: vi.fn() },
  },
}));

import { getSession } from "@/lib/session";
import { getScopelyId } from "@/lib/scopely-id";
import { prisma } from "@/lib/prisma";

describe("Tower History API Route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("GET", () => {
    it("returns empty array for new user with no commander record", async () => {
      (getSession as any).mockResolvedValue({ accessToken: "token" });
      (getScopelyId as any).mockResolvedValue("scopely-123");
      (prisma.commander.findUnique as any).mockResolvedValue(null);

      const response = await GET();
      const data = await response.json();

      expect(data).toEqual([]);
    });

    it("returns 401 when not authenticated", async () => {
      (getSession as any).mockResolvedValue({ accessToken: undefined });
      (getScopelyId as any).mockResolvedValue(null);

      const response = await GET();
      expect(response.status).toBe(401);
    });

    it("returns tower results sorted by completedAt desc", async () => {
      (getSession as any).mockResolvedValue({ accessToken: "token" });
      (getScopelyId as any).mockResolvedValue("scopely-123");
      (prisma.commander.findUnique as any).mockResolvedValue({ id: "cmd-1" });
      (prisma.towerResult.findMany as any).mockResolvedValue([
        { id: "r1", towerName: "Tower A", roomsCleared: 10, totalRooms: 12, completedAt: "2026-05-15" },
        { id: "r2", towerName: "Tower B", roomsCleared: 8, totalRooms: 12, completedAt: "2026-05-01" },
      ]);

      const response = await GET();
      const data = await response.json();

      expect(data).toHaveLength(2);
      expect(data[0].towerName).toBe("Tower A");
      expect(prisma.towerResult.findMany).toHaveBeenCalledWith({
        where: { commanderId: "cmd-1" },
        orderBy: { completedAt: "desc" },
      });
    });
  });

  describe("POST", () => {
    it("creates a new tower result record", async () => {
      (getSession as any).mockResolvedValue({ accessToken: "token" });
      (getScopelyId as any).mockResolvedValue("scopely-123");
      (prisma.commander.findUnique as any).mockResolvedValue({ id: "cmd-1" });
      (prisma.towerResult.upsert as any).mockResolvedValue({
        id: "new-result",
        towerEventId: "tower-event-1",
        towerName: "High Tower",
        roomsCleared: 10,
        totalRooms: 12,
      });

      const request = new NextRequest("http://localhost/api/tower/history", {
        method: "POST",
        body: JSON.stringify({
          towerEventId: "tower-event-1",
          towerName: "High Tower",
          roomsCleared: 10,
          totalRooms: 12,
          week1Cleared: 6,
          week2Cleared: 4,
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(201);
      expect(data.towerEventId).toBe("tower-event-1");
      expect(prisma.towerResult.upsert).toHaveBeenCalled();
    });

    it("upserts when duplicate towerEventId for same user", async () => {
      (getSession as any).mockResolvedValue({ accessToken: "token" });
      (getScopelyId as any).mockResolvedValue("scopely-123");
      (prisma.commander.findUnique as any).mockResolvedValue({ id: "cmd-1" });
      (prisma.towerResult.upsert as any).mockResolvedValue({
        id: "existing-result",
        towerEventId: "tower-event-1",
        roomsCleared: 12,
      });

      const request = new NextRequest("http://localhost/api/tower/history", {
        method: "POST",
        body: JSON.stringify({
          towerEventId: "tower-event-1",
          towerName: "High Tower",
          roomsCleared: 12,
          totalRooms: 12,
          week1Cleared: 6,
          week2Cleared: 6,
        }),
      });

      const response = await POST(request);
      expect(response.status).toBe(201);

      const upsertCall = (prisma.towerResult.upsert as any).mock.calls[0][0];
      expect(upsertCall.where.commanderId_towerEventId).toEqual({
        commanderId: "cmd-1",
        towerEventId: "tower-event-1",
      });
    });

    it("returns 401 when not authenticated", async () => {
      (getSession as any).mockResolvedValue({ accessToken: undefined });
      (getScopelyId as any).mockResolvedValue(null);

      const request = new NextRequest("http://localhost/api/tower/history", {
        method: "POST",
        body: JSON.stringify({ towerEventId: "t1", towerName: "T1" }),
      });

      const response = await POST(request);
      expect(response.status).toBe(401);
    });
  });
});
