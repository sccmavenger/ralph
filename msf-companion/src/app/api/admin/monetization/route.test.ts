import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetAdminSession = vi.fn();
const mockCount = vi.fn();
const mockFindMany = vi.fn();
const mockGroupBy = vi.fn();
const mockQueryRawUnsafe = vi.fn();

vi.mock("@/lib/admin-session", () => ({
  getAdminSession: () => mockGetAdminSession(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    commander: {
      count: (...args: unknown[]) => mockCount(...args),
      findMany: (...args: unknown[]) => mockFindMany(...args),
    },
    usageEvent: {
      groupBy: (...args: unknown[]) => mockGroupBy(...args),
    },
    $queryRawUnsafe: (...args: unknown[]) => mockQueryRawUnsafe(...args),
  },
}));

import { GET } from "./route";

describe("GET /api/admin/monetization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when not authenticated", async () => {
    mockGetAdminSession.mockResolvedValue({ isAdmin: false });
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns complete response shape with empty data", async () => {
    mockGetAdminSession.mockResolvedValue({ isAdmin: true });
    mockCount.mockResolvedValue(0);
    mockFindMany.mockResolvedValue([]);
    mockGroupBy.mockResolvedValue([]);
    mockQueryRawUnsafe.mockResolvedValue([]);

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body).toHaveProperty("overview");
    expect(body).toHaveProperty("waterfall");
    expect(body).toHaveProperty("premiumTrend");
    expect(body).toHaveProperty("cohorts");
    expect(body).toHaveProperty("subscriptionHealth");
    expect(body).toHaveProperty("atRiskSubscribers");
    expect(body).toHaveProperty("revenueAtRisk");
    expect(body).toHaveProperty("premiumTopFeatures");

    // Overview shape
    expect(body.overview).toHaveProperty("mrr");
    expect(body.overview).toHaveProperty("arr");
    expect(body.overview).toHaveProperty("conversionRate");
    expect(body.overview).toHaveProperty("churnRate");
    expect(body.overview).toHaveProperty("ltv");
    expect(body.overview).toHaveProperty("arpu");
  });

  it("calculates MRR correctly from premium count", async () => {
    mockGetAdminSession.mockResolvedValue({ isAdmin: true });

    let countCallIdx = 0;
    mockCount.mockImplementation(() => {
      countCallIdx++;
      if (countCallIdx === 1) return 100; // totalCommanders
      if (countCallIdx === 2) return 25;  // premiumCommanders
      if (countCallIdx === 3) return 75;  // freeCommanders
      if (countCallIdx === 4) return 3;   // churnedThisMonth
      return 0;
    });

    mockFindMany.mockResolvedValue([]);
    mockGroupBy.mockResolvedValue([]);
    mockQueryRawUnsafe.mockResolvedValue([]);

    const res = await GET();
    const body = await res.json();

    // 25 premium × $1.99 = $49.75
    expect(body.overview.mrr).toBe(49.75);
    expect(body.overview.arr).toBe(597);
    expect(body.overview.conversionRate).toBe(25);
    // churn = 3 / (25 + 3) * 100 = 10.7%
    expect(body.overview.churnRate).toBe(10.7);
  });

  it("returns waterfall metrics", async () => {
    mockGetAdminSession.mockResolvedValue({ isAdmin: true });

    let countCallIdx = 0;
    mockCount.mockImplementation(() => {
      countCallIdx++;
      if (countCallIdx === 1) return 50;  // total
      if (countCallIdx === 2) return 10;  // premium
      if (countCallIdx === 3) return 40;  // free
      if (countCallIdx === 4) return 2;   // churned
      return 0;
    });

    mockFindMany.mockResolvedValue([]);
    mockGroupBy.mockResolvedValue([]);
    mockQueryRawUnsafe.mockImplementation((sql: string) => {
      if (sql.includes("NOT EXISTS")) return [{ count: BigInt(5) }]; // new conversions
      return [];
    });

    const res = await GET();
    const body = await res.json();

    expect(body.waterfall.newConversions).toBe(5);
    expect(body.waterfall.newMRR).toBe(9.95); // 5 × 1.99
    expect(body.waterfall.churnedThisMonth).toBe(2);
    expect(body.waterfall.churnedMRR).toBe(3.98); // 2 × 1.99
    expect(body.waterfall.netNewMRR).toBe(5.97); // 9.95 - 3.98
  });

  it("subscription health adds up", async () => {
    mockGetAdminSession.mockResolvedValue({ isAdmin: true });

    let countCallIdx = 0;
    mockCount.mockImplementation(() => {
      countCallIdx++;
      if (countCallIdx === 1) return 100; // total
      if (countCallIdx === 2) return 20;  // premium
      if (countCallIdx === 3) return 80;  // free
      if (countCallIdx === 4) return 0;   // churned
      if (countCallIdx === 5) return 15;  // healthy
      if (countCallIdx === 6) return 5;   // expiring soon
      return 0;
    });

    mockFindMany.mockResolvedValue([]);
    mockGroupBy.mockResolvedValue([]);
    mockQueryRawUnsafe.mockResolvedValue([]);

    const res = await GET();
    const body = await res.json();

    expect(body.subscriptionHealth.healthy).toBe(15);
    expect(body.subscriptionHealth.expiringSoon).toBe(5);
    expect(body.subscriptionHealth.total).toBe(20);
  });
});
