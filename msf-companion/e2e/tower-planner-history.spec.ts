import { test, expect, type Page } from "@playwright/test";

const mockActiveTower = {
  active: true,
  tower: {
    id: "tower_alpha",
    name: "Alpha Tower",
    endDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
    currentWeek: 1,
    rays: [{ id: "ray_a", rooms: [{ id: "room_a1", name: "Floor 1" }] }],
  },
};

const mockRooms = [
  { id: "room_a1", rayId: "ray_a", name: "Floor 1", requirements: { traits: ["Mutant"], minGearTier: 16, minStars: 5, minLevel: 85 }, week: 1 },
];

const mockHistory = [
  { id: "h1", towerEventId: "t1", towerName: "Gamma Tower", roomsCleared: 10, totalRooms: 12, completedAt: "2025-01-15T00:00:00Z" },
  { id: "h2", towerEventId: "t2", towerName: "Beta Tower", roomsCleared: 8, totalRooms: 12, completedAt: "2025-01-01T00:00:00Z" },
];

async function setupMockRoutes(page: Page, historyData: unknown[] = mockHistory) {
  await page.route("**/api/tower/events", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockActiveTower) })
  );
  await page.route("**/api/tower/rooms*", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockRooms) })
  );
  await page.route("**/api/tower/readiness*", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ room_a1: { status: "ready", eligibleCount: 7 } }) })
  );
  await page.route("**/api/tower/upgrades*", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) })
  );
  await page.route("**/api/tower/history", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(historyData) })
  );
}

async function dismissModals(page: Page) {
  const skipBtn = page.getByText("Skip for now");
  if (await skipBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await skipBtn.click();
    await page.waitForTimeout(500);
  }
  const skipTour = page.getByText("Skip Tour");
  if (await skipTour.isVisible({ timeout: 1000 }).catch(() => false)) {
    await skipTour.click();
    await page.waitForTimeout(500);
  }
  const installDismiss = page.locator("[data-testid='install-dismiss']");
  if (await installDismiss.isVisible({ timeout: 1000 }).catch(() => false)) {
    await installDismiss.click();
    await page.waitForTimeout(500);
  }
}

test.describe("Tower Planner History", () => {
  test("history section renders past results", async ({ page }) => {
    await setupMockRoutes(page);
    await page.goto("/analyze/tower-planner");
    await dismissModals(page);

    const section = page.locator("[data-testid='tower-history-section']");
    await expect(section).toBeVisible({ timeout: 10000 });
    await expect(section).toContainText("History");

    const entries = page.locator("[data-testid='history-entry']");
    await expect(entries).toHaveCount(2);
    await expect(entries.first()).toContainText("Gamma Tower");
    await expect(entries.first()).toContainText("10/12");
  });

  test("comparison arrows show correct direction", async ({ page }) => {
    await setupMockRoutes(page);
    await page.goto("/analyze/tower-planner");
    await dismissModals(page);

    // First entry (most recent) improved by 2 from second entry (10 - 8 = +2)
    await expect(page.locator("[data-testid='history-up']")).toBeVisible({ timeout: 10000 });
    await expect(page.locator("[data-testid='history-up']")).toContainText("↑2");

    // Second entry is the oldest (first time)
    await expect(page.locator("[data-testid='history-first']")).toBeVisible();
    await expect(page.locator("[data-testid='history-first']")).toContainText("First time");
  });

  test("empty state for new users", async ({ page }) => {
    await setupMockRoutes(page, []);
    await page.goto("/analyze/tower-planner");
    await dismissModals(page);

    const emptyText = page.locator("[data-testid='history-empty']");
    await expect(emptyText).toBeVisible({ timeout: 10000 });
    await expect(emptyText).toContainText("Complete your first tower to see history here");
  });
});
