import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetAdminSession = vi.fn();
const mockGroupBy = vi.fn();
const mockCount = vi.fn();
const mockQueryRawUnsafe = vi.fn();
const mockFindMany = vi.fn();
const mockFindFirst = vi.fn();

vi.mock("@/lib/admin-session", () => ({
  getAdminSession: () => mockGetAdminSession(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    usageEvent: {
      groupBy: (...args: unknown[]) => mockGroupBy(...args),
      count: (...args: unknown[]) => mockCount(...args),
      findFirst: (...args: unknown[]) => mockFindFirst(...args),
    },
    commander: {
      findMany: (...args: unknown[]) => mockFindMany(...args),
    },
    $queryRawUnsafe: (...args: unknown[]) => mockQueryRawUnsafe(...args),
  },
}));

import { GET } from "./route";

describe("GET /api/admin/usage-insights", () => {
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

  it("returns complete response shape with empty data", async () => {
    mockGetAdminSession.mockResolvedValue({ isAdmin: true });
    mockGroupBy.mockResolvedValue([]);
    mockCount.mockResolvedValue(0);
    mockQueryRawUnsafe.mockResolvedValue([]);
    mockFindMany.mockResolvedValue([]);
    mockFindFirst.mockResolvedValue(null);

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();

    // Verify all top-level keys exist
    expect(body).toHaveProperty("summary");
    expect(body).toHaveProperty("dauTrend");
    expect(body).toHaveProperty("featureStickiness");
    expect(body).toHaveProperty("pathToPremium");
    expect(body).toHaveProperty("peakHours");
    expect(body).toHaveProperty("atRiskCommanders");
    expect(body).toHaveProperty("atRiskCount");
    expect(body).toHaveProperty("newUserJourney");
    expect(body).toHaveProperty("tierSplit");

    // Summary shape
    expect(body.summary).toHaveProperty("activeToday");
    expect(body.summary).toHaveProperty("activeThisWeek");
    expect(body.summary).toHaveProperty("retentionRate");
    expect(body.summary).toHaveProperty("avgSessionDepth");
    expect(body.summary).toHaveProperty("todayVsYesterday");
    expect(body.summary).toHaveProperty("weekVsPriorWeek");
  });

  it("returns correct summary metrics with seeded data", async () => {
    mockGetAdminSession.mockResolvedValue({ isAdmin: true });

    // Track call order to mock appropriately
    let groupByCallCount = 0;
    mockGroupBy.mockImplementation(() => {
      groupByCallCount++;
      // Calls 1-4: activeToday, activeWeek, activeYesterday, activePriorWeek
      if (groupByCallCount === 1) return [{ commanderId: "a" }, { commanderId: "b" }]; // today: 2
      if (groupByCallCount === 2) return [{ commanderId: "a" }, { commanderId: "b" }, { commanderId: "c" }]; // week: 3
      if (groupByCallCount === 3) return [{ commanderId: "a" }]; // yesterday: 1
      if (groupByCallCount === 4) return [{ commanderId: "x" }, { commanderId: "y" }]; // prior week: 2
      // Retention check: which prior week users returned
      if (groupByCallCount === 5) return [{ commanderId: "x" }]; // 1 of 2 returned = 50%
      // Rest: feature stickiness + tier queries
      return [];
    });

    mockCount.mockResolvedValue(9); // page views this week
    mockQueryRawUnsafe.mockResolvedValue([]); // DAU, premium path, peak hours
    mockFindMany.mockResolvedValue([]); // new commanders

    const res = await GET();
    const body = await res.json();

    expect(body.summary.activeToday).toBe(2);
    expect(body.summary.activeThisWeek).toBe(3);
    expect(body.summary.todayVsYesterday).toBe(100); // (2-1)/1 * 100
    expect(body.summary.retentionRate).toBe(50); // 1/2 returned
    expect(body.summary.avgSessionDepth).toBe(3); // 9 views / 3 weekly users
  });

  it("returns 24 peak hours entries", async () => {
    mockGetAdminSession.mockResolvedValue({ isAdmin: true });
    mockGroupBy.mockResolvedValue([]);
    mockCount.mockResolvedValue(0);
    mockFindMany.mockResolvedValue([]);
    mockFindFirst.mockResolvedValue(null);

    // Return some peak hours data
    let queryCallCount = 0;
    mockQueryRawUnsafe.mockImplementation(() => {
      queryCallCount++;
      if (queryCallCount === 1) return []; // DAU
      if (queryCallCount === 2) return []; // premium conversions
      // Peak hours
      return [
        { hour: 18, count: BigInt(50) },
        { hour: 19, count: BigInt(45) },
        { hour: 20, count: BigInt(40) },
      ];
    });

    const res = await GET();
    const body = await res.json();

    expect(body.peakHours).toHaveLength(24);
    expect(body.peakHours[18].count).toBe(50);
    expect(body.peakHours[19].count).toBe(45);
    expect(body.peakHours[0].count).toBe(0);
  });

  it("tier split adds up to 100 when data exists", async () => {
    mockGetAdminSession.mockResolvedValue({ isAdmin: true });
    mockCount.mockResolvedValue(0);
    mockQueryRawUnsafe.mockResolvedValue([]);
    mockFindMany.mockResolvedValue([]);
    mockFindFirst.mockResolvedValue(null);

    let groupByCallCount = 0;
    mockGroupBy.mockImplementation(() => {
      groupByCallCount++;
      // Last tier query (after all the feature stickiness queries)
      // We'll just return tier data for the last groupBy call with "tier"
      // Since we can't easily predict the call order, mock all to empty except tier
      return [];
    });

    // Override for the tier-specific call
    mockGroupBy.mockImplementation((args: Record<string, unknown>) => {
      const by = args.by as string[];
      if (by && by[0] === "tier") {
        return [
          { tier: "FREE", _count: { commanderId: 70 } },
          { tier: "PREMIUM", _count: { commanderId: 30 } },
        ];
      }
      return [];
    });

    const res = await GET();
    const body = await res.json();

    expect(body.tierSplit.FREE + body.tierSplit.PREMIUM).toBe(100);
    expect(body.tierSplit.FREE).toBe(70);
    expect(body.tierSplit.PREMIUM).toBe(30);
  });

  it("returns freeVsPremium behavior breakdown", async () => {
    mockGetAdminSession.mockResolvedValue({ isAdmin: true });
    mockGroupBy.mockResolvedValue([]);
    mockCount.mockResolvedValue(0);
    mockQueryRawUnsafe.mockResolvedValue([]);
    mockFindMany.mockResolvedValue([]);
    mockFindFirst.mockResolvedValue(null);

    const res = await GET();
    const body = await res.json();

    expect(body).toHaveProperty("freeVsPremium");
    expect(body.freeVsPremium).toHaveProperty("featureBreakdown");
    expect(body.freeVsPremium).toHaveProperty("engagement");
    expect(body.freeVsPremium.engagement).toHaveProperty("free");
    expect(body.freeVsPremium.engagement).toHaveProperty("premium");
    expect(body.freeVsPremium.engagement.free).toHaveProperty("uniqueUsers");
    expect(body.freeVsPremium.engagement.free).toHaveProperty("avgSessionDepth");
  });

  it("returns topUsers array", async () => {
    mockGetAdminSession.mockResolvedValue({ isAdmin: true });
    mockGroupBy.mockResolvedValue([]);
    mockCount.mockResolvedValue(0);
    mockFindMany.mockResolvedValue([]);
    mockFindFirst.mockResolvedValue(null);

    mockQueryRawUnsafe.mockImplementation((sql: string) => {
      if (sql.includes('"eventCount"')) {
        return [
          { commanderId: "user1", eventCount: BigInt(42), lastActive: new Date("2026-05-01"), tier: "PREMIUM" },
        ];
      }
      if (sql.includes("cnt")) {
        return [{ commanderId: "user1", eventName: "/advisor", cnt: BigInt(20) }];
      }
      return [];
    });

    // findMany for commander names
    mockFindMany.mockImplementation((args: Record<string, unknown>) => {
      const where = args.where as Record<string, unknown>;
      if (where?.id) {
        return [{ id: "user1", displayName: "TestCommander" }];
      }
      return [];
    });

    const res = await GET();
    const body = await res.json();

    expect(body).toHaveProperty("topUsers");
    expect(Array.isArray(body.topUsers)).toBe(true);
    if (body.topUsers.length > 0) {
      expect(body.topUsers[0]).toHaveProperty("displayName");
      expect(body.topUsers[0]).toHaveProperty("tier");
      expect(body.topUsers[0]).toHaveProperty("eventCount");
      expect(body.topUsers[0]).toHaveProperty("topFeature");
    }
  });

  it("returns premiumValueSignals array", async () => {
    mockGetAdminSession.mockResolvedValue({ isAdmin: true });
    mockGroupBy.mockResolvedValue([]);
    mockCount.mockResolvedValue(0);
    mockQueryRawUnsafe.mockResolvedValue([]);
    mockFindMany.mockResolvedValue([]);
    mockFindFirst.mockResolvedValue(null);

    const res = await GET();
    const body = await res.json();

    expect(body).toHaveProperty("premiumValueSignals");
    expect(Array.isArray(body.premiumValueSignals)).toBe(true);
  });
});
