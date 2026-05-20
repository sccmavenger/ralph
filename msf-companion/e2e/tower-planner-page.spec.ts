import { test, expect, type Page } from "@playwright/test";

const mockActiveTower = {
  active: true,
  tower: {
    id: "tower_alpha",
    name: "Alpha Tower",
    endDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
    currentWeek: 1,
    rays: [
      {
        id: "ray_a",
        rooms: [
          { id: "room_a1", name: "Floor 1" },
          { id: "room_a2", name: "Floor 2" },
        ],
      },
    ],
  },
};

const mockNoTower = {
  active: false,
  tower: null,
};

async function setupMockRoutes(page: Page, towerResponse: unknown) {
  await page.route("**/api/tower/events", (route) => {
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(towerResponse),
    });
  });
}

test.describe("Tower Planner Page", () => {
  test("page loads at /analyze/tower-planner", async ({ page }) => {
    await setupMockRoutes(page, mockActiveTower);
    await page.goto("/analyze/tower-planner");
    await expect(page.locator("[data-testid='tower-planner-active']")).toBeVisible();
  });

  test("shows empty state when no tower is active", async ({ page }) => {
    await setupMockRoutes(page, mockNoTower);
    await page.goto("/analyze/tower-planner");

    const empty = page.locator("[data-testid='tower-planner-empty']");
    await expect(empty).toBeVisible();
    await expect(empty).toContainText("No tower event running right now");
    await expect(empty).toContainText("Check back when one starts");
  });

  test("shows tower header with name, week badge, and end date when active", async ({ page }) => {
    await setupMockRoutes(page, mockActiveTower);
    await page.goto("/analyze/tower-planner");

    const active = page.locator("[data-testid='tower-planner-active']");
    await expect(active).toBeVisible();
    await expect(active).toContainText("Alpha Tower");
    await expect(active).toContainText("Week 1");
    await expect(active).toContainText("Ends");
  });

  test("no horizontal overflow at 390x844 viewport", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await setupMockRoutes(page, mockActiveTower);
    await page.goto("/analyze/tower-planner");

    await expect(page.locator("[data-testid='tower-planner-active']")).toBeVisible();

    const body = page.locator("body");
    const scrollWidth = await body.evaluate((el) => el.scrollWidth);
    const clientWidth = await body.evaluate((el) => el.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
  });
});
