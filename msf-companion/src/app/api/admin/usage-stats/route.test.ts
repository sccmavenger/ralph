import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetAdminSession = vi.fn();
const mockGroupBy = vi.fn();

vi.mock("@/lib/admin-session", () => ({
  getAdminSession: () => mockGetAdminSession(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    usageEvent: {
      groupBy: (...args: unknown[]) => mockGroupBy(...args),
    },
  },
}));

import { GET } from "./route";

describe("GET /api/admin/usage-stats", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when not authenticated as admin", async () => {
    mockGetAdminSession.mockResolvedValue({ isAdmin: false });

    const res = await GET();
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("returns correct response shape with seeded data", async () => {
    mockGetAdminSession.mockResolvedValue({ isAdmin: true });

    // Mock calls in order: activeToday, activeWeek, topPages, topFeatures, tierGroups
    let callCount = 0;
    mockGroupBy.mockImplementation((args: Record<string, unknown>) => {
      callCount++;
      const by = args.by as string[];
      const where = args.where as Record<string, unknown>;

      // activeToday and activeWeek (grouped by commanderId)
      if (by[0] === "commanderId") {
        if (callCount <= 2) {
          // First call = today, second = week
          return callCount === 1
            ? [{ commanderId: "cmd-1" }, { commanderId: "cmd-2" }]
            : [
                { commanderId: "cmd-1" },
                { commanderId: "cmd-2" },
                { commanderId: "cmd-3" },
              ];
        }
      }

      // topPages
      if (
        by[0] === "eventName" &&
        (where as { eventType?: string }).eventType === "page_view"
      ) {
        return [
          { eventName: "/dashboard", _count: { eventName: 50 } },
          { eventName: "/roster", _count: { eventName: 30 } },
        ];
      }

      // topFeatures
      if (
        by[0] === "eventName" &&
        (where as { eventType?: string }).eventType === "feature_use"
      ) {
        return [
          { eventName: "advisor_question", _count: { eventName: 20 } },
          { eventName: "team_builder_use", _count: { eventName: 10 } },
        ];
      }

      // tierGroups
      if (by[0] === "tier") {
        return [
          { tier: "FREE", _count: { commanderId: 60 } },
          { tier: "PREMIUM", _count: { commanderId: 40 } },
        ];
      }

      return [];
    });

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.activeUsersToday).toBe(2);
    expect(body.activeUsersThisWeek).toBe(3);

    expect(body.topPages).toEqual([
      { page: "/dashboard", count: 50 },
      { page: "/roster", count: 30 },
    ]);

    expect(body.topFeatures).toEqual([
      { feature: "advisor_question", count: 20 },
      { feature: "team_builder_use", count: 10 },
    ]);

    expect(body.tierSplit).toEqual({ FREE: 60, PREMIUM: 40 });
  });

  it("tier split percentages sum to 100", async () => {
    mockGetAdminSession.mockResolvedValue({ isAdmin: true });

    let callCount = 0;
    mockGroupBy.mockImplementation((args: Record<string, unknown>) => {
      callCount++;
      const by = args.by as string[];

      if (by[0] === "commanderId") {
        return [];
      }
      if (by[0] === "eventName") {
        return [];
      }
      if (by[0] === "tier") {
        return [
          { tier: "FREE", _count: { commanderId: 73 } },
          { tier: "PREMIUM", _count: { commanderId: 27 } },
        ];
      }
      return [];
    });

    const res = await GET();
    const body = await res.json();

    expect(body.tierSplit.FREE + body.tierSplit.PREMIUM).toBe(100);
  });

  it("returns zero tier split when no events exist", async () => {
    mockGetAdminSession.mockResolvedValue({ isAdmin: true });

    mockGroupBy.mockResolvedValue([]);

    const res = await GET();
    const body = await res.json();

    expect(body.tierSplit).toEqual({ FREE: 0, PREMIUM: 0 });
    expect(body.activeUsersToday).toBe(0);
    expect(body.activeUsersThisWeek).toBe(0);
  });
});
