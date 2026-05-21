import { test, expect, type Page } from "@playwright/test";

const mockActiveTower = {
  active: true,
  tower: {
    id: "tower_alpha",
    name: "Alpha Tower",
    endDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
    currentWeek: 1,
    rays: [],
  },
};

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

test.describe("Dashboard Tower Event Card", () => {
  test("card renders with tower name and countdown when active", async ({ page }) => {
    await page.route("**/api/tower/events", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockActiveTower) })
    );
    await page.goto("/dashboard");
    await dismissModals(page);

    const card = page.locator("[data-testid='tower-event-card']");
    await expect(card).toBeVisible({ timeout: 10000 });
    await expect(card).toContainText("Alpha Tower");
    await expect(card).toContainText("Week 1");
    await expect(card).toContainText("day");
  });

  test("card absent when no tower event active", async ({ page }) => {
    await page.route("**/api/tower/events", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ active: false, tower: null }) })
    );
    await page.goto("/dashboard");
    await dismissModals(page);

    // Wait for page to load fully
    await page.waitForTimeout(2000);
    await expect(page.locator("[data-testid='tower-event-card']")).not.toBeVisible();
  });

  test("card click navigates to tower planner", async ({ page }) => {
    await page.route("**/api/tower/events", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockActiveTower) })
    );
    await page.route("**/api/tower/rooms*", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) })
    );
    await page.route("**/api/tower/readiness*", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({}) })
    );
    await page.route("**/api/tower/upgrades*", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) })
    );
    await page.goto("/dashboard");
    await dismissModals(page);

    const card = page.locator("[data-testid='tower-event-card']");
    await expect(card).toBeVisible({ timeout: 10000 });
    await card.click();
    await expect(page).toHaveURL(/\/analyze\/tower-planner/);
  });
});
