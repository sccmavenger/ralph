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

const mockMonetizationData = {
  overview: {
    totalCommanders: 500,
    premiumCommanders: 47,
    freeCommanders: 453,
    mrr: 93.53,
    arr: 1122.36,
    conversionRate: 9.4,
    churnRate: 4.3,
    arpu: 0.51,
    ltv: 46.28,
    pricePerMonth: 1.99,
  },
  waterfall: {
    newConversions: 8,
    newMRR: 15.92,
    churnedThisMonth: 3,
    churnedMRR: 5.97,
    netNewMRR: 9.95,
  },
  premiumTrend: [
    { day: "2026-04-02", gained: 2, lost: 0 },
    { day: "2026-04-05", gained: 1, lost: 1 },
    { day: "2026-04-10", gained: 3, lost: 0 },
    { day: "2026-04-15", gained: 0, lost: 2 },
    { day: "2026-04-20", gained: 2, lost: 0 },
  ],
  cohorts: [
    { month: "2025-12", total: 80, premium: 12, conversionRate: 15 },
    { month: "2026-01", total: 95, premium: 10, conversionRate: 10.5 },
    { month: "2026-02", total: 110, premium: 9, conversionRate: 8.2 },
    { month: "2026-03", total: 120, premium: 11, conversionRate: 9.2 },
    { month: "2026-04", total: 95, premium: 5, conversionRate: 5.3 },
  ],
  subscriptionHealth: {
    healthy: 40,
    expiringSoon: 7,
    total: 47,
  },
  atRiskSubscribers: [
    { displayName: "DarkPhoenix_42", expiresAt: "2026-05-03", email: "dar..." },
    { displayName: "SymbioteKing", expiresAt: "2026-05-05", email: "sym..." },
  ],
  revenueAtRisk: 13.93,
  premiumTopFeatures: [
    { feature: "AI Advisor", views: 342 },
    { feature: "DD Planner", views: 218 },
    { feature: "Team Builder", views: 156 },
    { feature: "Farming Guide", views: 89 },
  ],
};

test.describe("Monetization Dashboard", () => {
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
    await page.goto("/admin/monetization");
    await expect(page).toHaveURL(/\/admin$/);
  });

  test("displays all monetization sections with mock data", async ({ page }) => {
    await page.route("**/api/admin/monetization", async (route) => {
      await route.fulfill({
        status: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(mockMonetizationData),
      });
    });

    await setAdminSession(page.context());
    await page.goto("/admin/monetization");

    // KPI cards
    const kpis = page.getByTestId("monetization-kpis");
    await expect(kpis).toBeVisible({ timeout: 10000 });
    await expect(kpis).toContainText("$93.53");
    await expect(kpis).toContainText("9.4%");
    await expect(kpis).toContainText("4.3%");
    await expect(kpis).toContainText("$46.28");

    // Waterfall
    const waterfall = page.getByTestId("monetization-waterfall");
    await expect(waterfall).toBeVisible();
    await expect(waterfall).toContainText("+$15.92");
    await expect(waterfall).toContainText("-$5.97");
    await expect(waterfall).toContainText("+$9.95");

    // Growth trend
    const trend = page.getByTestId("monetization-trend");
    await expect(trend).toBeVisible();

    // Subscription health
    const health = page.getByTestId("monetization-health");
    await expect(health).toBeVisible();
    await expect(health).toContainText("47 active premium");

    // Revenue at risk
    const atRisk = page.getByTestId("monetization-at-risk");
    await expect(atRisk).toBeVisible();
    await expect(atRisk).toContainText("$13.93");
    await expect(atRisk).toContainText("DarkPhoenix_42");

    // Cohorts
    const cohorts = page.getByTestId("monetization-cohorts");
    await expect(cohorts).toBeVisible();
    await expect(cohorts).toContainText("2025-12");
    await expect(cohorts).toContainText("15%");

    // Premium features
    const features = page.getByTestId("monetization-features");
    await expect(features).toBeVisible();
    await expect(features).toContainText("AI Advisor");
    await expect(features).toContainText("342 views");

    // Churn playbook
    const playbook = page.getByTestId("monetization-churn-playbook");
    await expect(playbook).toBeVisible();
    await expect(playbook).toContainText("Re-engage At-Risk Users");
    await expect(playbook).toContainText("Reduce Involuntary Churn");
  });

  test("shows skeleton while loading", async ({ page }) => {
    await page.route("**/api/admin/monetization", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      await route.fulfill({
        status: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(mockMonetizationData),
      });
    });

    await setAdminSession(page.context());
    await page.goto("/admin/monetization");

    const skeleton = page.getByTestId("monetization-skeleton");
    await expect(skeleton).toBeVisible({ timeout: 5000 });

    const kpis = page.getByTestId("monetization-kpis");
    await expect(kpis).toBeVisible({ timeout: 10000 });
  });

  test("no horizontal overflow at 375px viewport", async ({ page }) => {
    await page.route("**/api/admin/monetization", async (route) => {
      await route.fulfill({
        status: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(mockMonetizationData),
      });
    });

    await page.setViewportSize({ width: 375, height: 812 });
    await setAdminSession(page.context());
    await page.goto("/admin/monetization");

    const content = page.getByTestId("monetization-content");
    await expect(content).toBeVisible({ timeout: 10000 });

    const body = page.locator("body");
    const scrollWidth = await body.evaluate((el) => el.scrollWidth);
    const clientWidth = await body.evaluate((el) => el.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
  });
});
