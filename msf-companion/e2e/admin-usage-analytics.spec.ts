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
  context: import("@playwright/test").BrowserContext
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

const mockUsageStats = {
  activeUsersToday: 12,
  activeUsersThisWeek: 47,
  topPages: [
    { page: "/dashboard", count: 150 },
    { page: "/roster", count: 98 },
    { page: "/advisor", count: 72 },
    { page: "/analyze/dd-planner", count: 45 },
    { page: "/profile", count: 30 },
  ],
  topFeatures: [
    { feature: "advisor_question", count: 85 },
    { feature: "team_builder_use", count: 60 },
    { feature: "upgrade_calculator_use", count: 42 },
    { feature: "dd_planner_node_select", count: 28 },
  ],
  tierSplit: { FREE: 65, PREMIUM: 35 },
};

test.describe("Admin Usage Analytics Page", () => {
  test.beforeEach(async ({ page }) => {
    // Suppress install app modal
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

  test("unauthenticated user is redirected from /admin/usage-analytics", async ({
    page,
  }) => {
    await page.goto("/admin/usage-analytics");
    await expect(page).toHaveURL(/\/admin$/);
  });

  test("usage analytics page loads with mock data and shows all sections", async ({
    page,
  }) => {
    await page.route("**/api/admin/usage-stats", async (route) => {
      await route.fulfill({
        status: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(mockUsageStats),
      });
    });

    await setAdminSession(page.context());
    await page.goto("/admin/usage-analytics");

    // Usage Analytics section visible
    const section = page.getByTestId("usage-analytics-section");
    await expect(section).toBeVisible({ timeout: 10000 });

    // Active user counts are visible
    const activeUsers = page.getByTestId("usage-active-users");
    await expect(activeUsers).toBeVisible();
    await expect(activeUsers).toContainText("12");
    await expect(activeUsers).toContainText("47");

    // Top pages list is visible
    const topPages = page.getByTestId("usage-top-pages");
    await expect(topPages).toBeVisible();
    await expect(topPages).toContainText("/dashboard");
    await expect(topPages).toContainText("150");

    // Top features list is visible
    const topFeatures = page.getByTestId("usage-top-features");
    await expect(topFeatures).toBeVisible();
    await expect(topFeatures).toContainText("advisor_question");
    await expect(topFeatures).toContainText("85");

    // Tier split percentages are visible
    const tierSplit = page.getByTestId("usage-tier-split");
    await expect(tierSplit).toBeVisible();
    await expect(tierSplit).toContainText("Free 65%");
    await expect(tierSplit).toContainText("Premium 35%");
  });

  test("section shows skeleton loader while data loads", async ({ page }) => {
    // Delay the usage-stats response
    await page.route("**/api/admin/usage-stats", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      await route.fulfill({
        status: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(mockUsageStats),
      });
    });

    await setAdminSession(page.context());
    await page.goto("/admin/usage-analytics");

    // Skeleton should be visible while loading
    const skeleton = page.getByTestId("usage-analytics-skeleton");
    await expect(skeleton).toBeVisible({ timeout: 5000 });

    // After loading, skeleton should disappear and data should show
    const activeUsers = page.getByTestId("usage-active-users");
    await expect(activeUsers).toBeVisible({ timeout: 10000 });
  });

  test("no horizontal overflow at 375px viewport", async ({ page }) => {
    await page.route("**/api/admin/usage-stats", async (route) => {
      await route.fulfill({
        status: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(mockUsageStats),
      });
    });

    await page.setViewportSize({ width: 375, height: 812 });
    await setAdminSession(page.context());
    await page.goto("/admin/usage-analytics");

    const section = page.getByTestId("usage-analytics-section");
    await expect(section).toBeVisible({ timeout: 10000 });

    const body = page.locator("body");
    const scrollWidth = await body.evaluate((el) => el.scrollWidth);
    const clientWidth = await body.evaluate((el) => el.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
  });
});
