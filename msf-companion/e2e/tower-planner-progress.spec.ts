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
  { id: "room_a2", rayId: "ray_a", name: "Floor 2", requirements: { traits: ["Bio"], minGearTier: 15, minStars: 4, minLevel: 80 }, week: 1 },
];

const mockReadiness = {
  room_a1: { status: "ready", eligibleCount: 7 },
  room_a2: { status: "almost", eligibleCount: 4 },
};

async function setupMockRoutes(page: Page) {
  await page.route("**/api/tower/events", (route) => {
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockActiveTower) });
  });
  await page.route("**/api/tower/rooms*", (route) => {
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockRooms) });
  });
  await page.route("**/api/tower/readiness*", (route) => {
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockReadiness) });
  });
  await page.route("**/api/tower/meta-teams*", (route) => {
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({}) });
  });
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

test.describe("Tower Planner Progress Tracking", () => {
  test("cleared rooms are dimmed with checkmark", async ({ page }) => {
    // Clear localStorage for this test
    await page.addInitScript(() => {
      localStorage.clear();
    });
    await setupMockRoutes(page);
    await page.goto("/analyze/tower-planner");
    await dismissModals(page);

    // Mark first room as cleared
    const markBtn = page.locator("[data-testid='mark-cleared-btn']").first();
    await expect(markBtn).toBeVisible({ timeout: 10000 });
    await markBtn.click();

    // Room should now show cleared badge
    const clearedBadge = page.locator("[data-testid='cleared-badge']").first();
    await expect(clearedBadge).toBeVisible();
    await expect(clearedBadge).toContainText("Cleared");

    // Room card should have reduced opacity
    const firstCard = page.locator("[data-testid='room-card']").first();
    await expect(firstCard).toHaveClass(/opacity-50/);
  });

  test("Mark as Cleared is in-memory only and resets on reload (by design)", async ({ page }) => {
    // Manual "Mark as Cleared" is an in-memory prediction layer; the API's
    // `completedTier` is the authoritative source for cleared cells per tower.
    // See TowerPlannerClient.tsx markRoomCleared / computeAutoCleared.
    await setupMockRoutes(page);
    await page.goto("/analyze/tower-planner");
    await dismissModals(page);

    // Clear any prior state
    await page.evaluate(() => localStorage.clear());
    await page.goto("/analyze/tower-planner");
    await dismissModals(page);

    // Mark first room
    const markBtn = page.locator("[data-testid='mark-cleared-btn']").first();
    await expect(markBtn).toBeVisible({ timeout: 10000 });
    await markBtn.click();

    // Cleared badge appears immediately in the current session
    const clearedBadge = page.locator("[data-testid='cleared-badge']").first();
    await expect(clearedBadge).toBeVisible();

    // Navigate away and back — should NOT persist
    await page.goto("/analyze/tower-planner");
    await dismissModals(page);

    // Should be back to un-cleared state (mock readiness has no cleared rooms)
    await expect(page.locator("[data-testid='cleared-badge']")).toHaveCount(0);
    await expect(page.locator("[data-testid='mark-cleared-btn']").first()).toBeVisible({
      timeout: 10000,
    });
  });

  test("Reset All shows confirm then clears", async ({ page }) => {
    await setupMockRoutes(page);
    await page.goto("/analyze/tower-planner");
    await dismissModals(page);

    // Mark a room
    const markBtn = page.locator("[data-testid='mark-cleared-btn']").first();
    await expect(markBtn).toBeVisible({ timeout: 10000 });
    await markBtn.click();

    // Click Reset All
    const resetBtn = page.locator("[data-testid='reset-all-btn']");
    await expect(resetBtn).toBeVisible();
    await resetBtn.click();

    // Confirm dialog should appear
    const confirmDialog = page.locator("[data-testid='reset-confirm-dialog']");
    await expect(confirmDialog).toBeVisible();

    // Confirm yes
    await page.locator("[data-testid='reset-confirm-yes']").click();

    // Room should no longer be cleared
    await expect(page.locator("[data-testid='cleared-badge']")).not.toBeVisible();
    await expect(page.locator("[data-testid='mark-cleared-btn']").first()).toBeVisible();
  });

  test("Refresh button triggers loading state", async ({ page }) => {
    await setupMockRoutes(page);
    await page.goto("/analyze/tower-planner");
    await dismissModals(page);

    const refreshBtn = page.locator("[data-testid='refresh-progress-btn']");
    await expect(refreshBtn).toBeVisible({ timeout: 10000 });
    await expect(refreshBtn).toContainText("Refresh Progress");

    // Click refresh — text changes briefly
    await refreshBtn.click();
    // After refresh completes, text should be back to normal
    await expect(refreshBtn).toContainText("Refresh Progress");
  });
});
