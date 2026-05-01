import { test, expect } from "@playwright/test";
import { sealData } from "iron-session";
import fs from "fs";
import path from "path";

function getEnvVar(name: string): string {
  const envPath = path.join(__dirname, "..", ".env");
  const envContent = fs.readFileSync(envPath, "utf8");
  const match = envContent.match(new RegExp(`${name}="([^"]+)"`));
  if (!match) throw new Error(`${name} not found in .env`);
  return match[1];
}

async function setAdminSession(
  context: import("@playwright/test").BrowserContext,
) {
  const secret = getEnvVar("ADMIN_SESSION_SECRET");
  const sealed = await sealData({ isAdmin: true }, { password: secret, ttl: 86400 });
  await context.addCookies([
    {
      name: "admin-session",
      value: sealed,
      domain: "localhost",
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
}

const mockInsightsData = {
  summary: {
    activeToday: 47,
    activeThisWeek: 183,
    todayVsYesterday: 12,
    weekVsPriorWeek: 8,
    retentionRate: 62,
    avgSessionDepth: 4.2,
  },
  dauTrend: [
    { day: "2026-04-01", count: 30 },
    { day: "2026-04-02", count: 35 },
    { day: "2026-04-03", count: 42 },
  ],
  featureStickiness: [
    { feature: "AI Advisor", path: "/advisor", usersThisWeek: 142, returnRate: 78 },
    { feature: "Daily Briefing", path: "/dashboard/daily-briefing", usersThisWeek: 98, returnRate: 71 },
    { feature: "Roster", path: "/roster", usersThisWeek: 156, returnRate: 54 },
    { feature: "Team Builder", path: "/teams", usersThisWeek: 34, returnRate: 18 },
  ],
  pathToPremium: [
    { feature: "AI Advisor", count: 12, percentage: 41 },
    { feature: "DD Planner", count: 8, percentage: 28 },
    { feature: "Farming Guide", count: 6, percentage: 19 },
  ],
  peakHours: Array.from({ length: 24 }, (_, i) => ({ hour: i, count: i >= 17 && i <= 20 ? 50 : 10 })),
  atRiskCommanders: [
    { displayName: "DarkPhoenix_42", lastSeen: "2026-04-22" },
    { displayName: "SymbioteKing", lastSeen: "2026-04-23" },
  ],
  atRiskCount: 5,
  weeklyActiveCount: 183,
  newUserJourney: [
    { feature: "Roster", adoption: 93 },
    { feature: "AI Advisor", adoption: 76 },
    { feature: "Daily Briefing", adoption: 61 },
    { feature: "Team Builder", adoption: 15 },
  ],
  tierSplit: { FREE: 72, PREMIUM: 28 },
  freeVsPremium: {
    featureBreakdown: [
      { feature: "AI Advisor", freeUsers: 85, premiumUsers: 57 },
      { feature: "Roster", freeUsers: 120, premiumUsers: 36 },
      { feature: "DD Planner", freeUsers: 12, premiumUsers: 28 },
    ],
    engagement: {
      free: { uniqueUsers: 132, avgSessionDepth: 3.1 },
      premium: { uniqueUsers: 51, avgSessionDepth: 7.4 },
    },
  },
  topUsers: [
    { displayName: "WarMachine_X", tier: "PREMIUM", eventCount: 347, lastActive: "2026-05-01", topFeature: "AI Advisor" },
    { displayName: "DarkPhoenix_42", tier: "FREE", eventCount: 215, lastActive: "2026-04-30", topFeature: "Roster" },
    { displayName: "SymbioteKing", tier: "PREMIUM", eventCount: 198, lastActive: "2026-04-30", topFeature: "DD Planner" },
  ],
  premiumValueSignals: [
    { feature: "DD Planner", premiumShare: 70, lift: 150, premiumUsers: 28, freeUsers: 12 },
    { feature: "AI Advisor", premiumShare: 40, lift: 43, premiumUsers: 57, freeUsers: 85 },
  ],
};

test.describe("Usage Insights Dashboard", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window.navigator, "standalone", { value: true });
      const origMatchMedia = window.matchMedia.bind(window);
      window.matchMedia = (query: string) => {
        if (query === "(display-mode: standalone)") {
          return {
            matches: true,
            media: query,
            addEventListener: () => {},
            removeEventListener: () => {},
            addListener: () => {},
            removeListener: () => {},
            onchange: null,
            dispatchEvent: () => true,
          } as MediaQueryList;
        }
        return origMatchMedia(query);
      };
    });
  });

  test("unauthenticated user is redirected", async ({ page }) => {
    await page.goto("/admin/usage-analytics");
    await expect(page).toHaveURL(/\/admin$/);
  });

  test("displays all insight sections with mock data", async ({ page }) => {
    await page.route("**/api/admin/usage-insights", async (route) => {
      await route.fulfill({
        status: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(mockInsightsData),
      });
    });

    await setAdminSession(page.context());
    await page.goto("/admin/usage-analytics");

    // Summary cards
    const summary = page.getByTestId("insights-summary");
    await expect(summary).toBeVisible({ timeout: 10000 });
    await expect(summary).toContainText("47");
    await expect(summary).toContainText("183");
    await expect(summary).toContainText("62%");
    await expect(summary).toContainText("4.2");

    // DAU Trend
    const dau = page.getByTestId("insights-dau-trend");
    await expect(dau).toBeVisible();
    await expect(dau).toContainText("Daily Active Users");

    // Feature stickiness
    const stickiness = page.getByTestId("insights-feature-stickiness");
    await expect(stickiness).toBeVisible();
    await expect(stickiness).toContainText("AI Advisor");
    await expect(stickiness).toContainText("78%");
    await expect(stickiness).toContainText("Invest More");
    await expect(stickiness).toContainText("Team Builder");
    await expect(stickiness).toContainText("18%");
    await expect(stickiness).toContainText("Rethink");

    // Path to premium
    const premium = page.getByTestId("insights-path-to-premium");
    await expect(premium).toBeVisible();
    await expect(premium).toContainText("41%");
    await expect(premium).toContainText("AI Advisor");

    // Peak hours
    const hours = page.getByTestId("insights-peak-hours");
    await expect(hours).toBeVisible();

    // At-risk commanders
    const atRisk = page.getByTestId("insights-at-risk");
    await expect(atRisk).toBeVisible();
    await expect(atRisk).toContainText("DarkPhoenix_42");
    await expect(atRisk).toContainText("SymbioteKing");

    // New user journey
    const journey = page.getByTestId("insights-new-user-journey");
    await expect(journey).toBeVisible();
    await expect(journey).toContainText("93%");
    await expect(journey).toContainText("Roster");

    // Tier split
    const tier = page.getByTestId("insights-tier-split");
    await expect(tier).toBeVisible();
    await expect(tier).toContainText("Free 72%");
    await expect(tier).toContainText("Premium 28%");

    // Free vs Premium behavior
    const fvp = page.getByTestId("insights-free-vs-premium");
    await expect(fvp).toBeVisible();
    await expect(fvp).toContainText("Free Users");
    await expect(fvp).toContainText("132");
    await expect(fvp).toContainText("3.1 pages/visit");
    await expect(fvp).toContainText("Premium Users");
    await expect(fvp).toContainText("51");
    await expect(fvp).toContainText("7.4 pages/visit");

    // Top users
    const topUsers = page.getByTestId("insights-top-users");
    await expect(topUsers).toBeVisible();
    await expect(topUsers).toContainText("WarMachine_X");
    await expect(topUsers).toContainText("347");
    await expect(topUsers).toContainText("PREMIUM");

    // Premium value signals
    const signals = page.getByTestId("insights-premium-signals");
    await expect(signals).toBeVisible();
    await expect(signals).toContainText("DD Planner");
    await expect(signals).toContainText("150% lift");
  });

  test("shows skeleton while loading", async ({ page }) => {
    await page.route("**/api/admin/usage-insights", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      await route.fulfill({
        status: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(mockInsightsData),
      });
    });

    await setAdminSession(page.context());
    await page.goto("/admin/usage-analytics");

    const skeleton = page.getByTestId("insights-skeleton");
    await expect(skeleton).toBeVisible({ timeout: 5000 });

    // After load, content appears
    const summary = page.getByTestId("insights-summary");
    await expect(summary).toBeVisible({ timeout: 10000 });
  });

  test("handles empty data gracefully", async ({ page }) => {
    const emptyData = {
      ...mockInsightsData,
      dauTrend: [],
      featureStickiness: [],
      pathToPremium: [],
      atRiskCommanders: [],
      atRiskCount: 0,
      newUserJourney: [],
      freeVsPremium: { featureBreakdown: [], engagement: { free: { uniqueUsers: 0, avgSessionDepth: 0 }, premium: { uniqueUsers: 0, avgSessionDepth: 0 } } },
      topUsers: [],
      premiumValueSignals: [],
    };

    await page.route("**/api/admin/usage-insights", async (route) => {
      await route.fulfill({
        status: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(emptyData),
      });
    });

    await setAdminSession(page.context());
    await page.goto("/admin/usage-analytics");

    const content = page.getByTestId("usage-insights-content");
    await expect(content).toBeVisible({ timeout: 10000 });

    // Empty states show messages
    await expect(page.getByText("No data yet")).toBeVisible();
    await expect(page.getByText("Not enough data")).toBeVisible();
    await expect(page.getByText("No premium conversions")).toBeVisible();
    await expect(page.getByText("No at-risk commanders")).toBeVisible();
    await expect(page.getByText("No new user data")).toBeVisible();
  });

  test("no horizontal overflow at 375px viewport", async ({ page }) => {
    await page.route("**/api/admin/usage-insights", async (route) => {
      await route.fulfill({
        status: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(mockInsightsData),
      });
    });

    await page.setViewportSize({ width: 375, height: 812 });
    await setAdminSession(page.context());
    await page.goto("/admin/usage-analytics");

    const content = page.getByTestId("usage-insights-content");
    await expect(content).toBeVisible({ timeout: 10000 });

    const body = page.locator("body");
    const scrollWidth = await body.evaluate((el) => el.scrollWidth);
    const clientWidth = await body.evaluate((el) => el.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
  });
});
