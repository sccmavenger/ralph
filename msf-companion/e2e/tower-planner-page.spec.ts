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

const mockRooms = [
  { id: "room_a1", rayId: "ray_a", name: "Floor 1", requirements: { traits: ["Mutant"], minGearTier: 16, minStars: 5, minLevel: 85 }, week: 1 },
  { id: "room_a2", rayId: "ray_a", name: "Floor 2", requirements: { traits: ["Bio"], minGearTier: 17, minStars: 6, minLevel: 90 }, week: 1 },
  { id: "room_b1", rayId: "ray_b", name: "Floor 3", requirements: { traits: ["Tech"], minGearTier: 17, minStars: 7, minLevel: 95 }, week: 2 },
];

const mockReadiness: Record<string, { status: string; eligibleCount: number }> = {
  room_a1: { status: "ready", eligibleCount: 7 },
  room_a2: { status: "almost", eligibleCount: 4 },
  room_b1: { status: "blocked", eligibleCount: 1 },
};

const mockUpgrades = [
  { characterName: "Jean Grey", currentValue: 16, targetValue: 17, upgradeType: "gear", roomsUnlocked: ["Floor 2"], impact: 3 },
  { characterName: "Storm", currentValue: 5, targetValue: 6, upgradeType: "stars", roomsUnlocked: ["Floor 3"], impact: 2 },
];

async function setupMockRoutes(page: Page, towerResponse: unknown, upgradesResponse: unknown[] = mockUpgrades) {
  await page.route("**/api/tower/events", (route) => {
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(towerResponse),
    });
  });

  await page.route("**/api/tower/rooms*", (route) => {
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockRooms),
    });
  });

  await page.route("**/api/tower/readiness*", (route) => {
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockReadiness),
    });
  });

  await page.route("**/api/tower/upgrades*", (route) => {
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(upgradesResponse),
    });
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

  test("room cards render with correct status badges", async ({ page }) => {
    await setupMockRoutes(page, mockActiveTower);
    await page.goto("/analyze/tower-planner");

    await expect(page.locator("[data-testid='room-card']")).toHaveCount(3);
    await expect(page.getByText("Ready to go")).toBeVisible();
    await expect(page.getByText("Almost there")).toBeVisible();
    await expect(page.getByText("Not possible yet")).toBeVisible();
  });

  test("summary bar shows counts", async ({ page }) => {
    await setupMockRoutes(page, mockActiveTower);
    await page.goto("/analyze/tower-planner");

    const summary = page.locator("[data-testid='tower-summary-bar']");
    await expect(summary).toBeVisible();
    await expect(summary).toContainText("1 ready");
    await expect(summary).toContainText("1 almost");
    await expect(summary).toContainText("1 blocked");
  });

  test("week 2 divider is visible", async ({ page }) => {
    await setupMockRoutes(page, mockActiveTower);
    await page.goto("/analyze/tower-planner");

    const divider = page.locator("[data-testid='week-2-divider']");
    await expect(divider).toBeVisible();
    await expect(divider).toContainText("Week 2");
  });

  test("upgrade recommendations section renders when blocked rooms exist", async ({ page }) => {
    await setupMockRoutes(page, mockActiveTower);
    await page.goto("/analyze/tower-planner");

    const section = page.locator("[data-testid='upgrades-section']");
    await expect(section).toBeVisible();
    await expect(section).toContainText("Things That Would Help You");
    await expect(page.locator("[data-testid='upgrade-item']")).toHaveCount(2);
    await expect(section).toContainText("Jean Grey");
    await expect(section).toContainText("16 → 17");
    await expect(section).toContainText("unlocks 1 room");
  });

  test("upgrade recommendations hidden when all rooms ready", async ({ page }) => {
    // Override readiness to all ready
    await page.route("**/api/tower/events", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockActiveTower) })
    );
    await page.route("**/api/tower/rooms*", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockRooms) })
    );
    await page.route("**/api/tower/readiness*", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ room_a1: { status: "ready", eligibleCount: 7 }, room_a2: { status: "ready", eligibleCount: 5 }, room_b1: { status: "ready", eligibleCount: 6 } }),
      })
    );
    await page.route("**/api/tower/upgrades*", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) })
    );

    await page.goto("/analyze/tower-planner");
    await expect(page.locator("[data-testid='upgrades-section']")).not.toBeVisible();
  });

  test("How It Works expanded on first visit", async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.removeItem("tower-planner-seen");
    });
    await setupMockRoutes(page, mockActiveTower);
    await page.goto("/analyze/tower-planner");

    const content = page.locator("[data-testid='how-it-works-content']");
    await expect(content).toBeVisible();
    await expect(page.locator("[data-testid='how-step-1']")).toBeVisible();
    await expect(page.locator("[data-testid='how-step-2']")).toBeVisible();
    await expect(page.locator("[data-testid='how-step-3']")).toBeVisible();
  });

  test("How It Works collapsed on second visit", async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("tower-planner-seen", "1");
    });
    await setupMockRoutes(page, mockActiveTower);
    await page.goto("/analyze/tower-planner");

    await expect(page.locator("[data-testid='how-it-works-section']")).toBeVisible();
    await expect(page.locator("[data-testid='how-it-works-content']")).not.toBeVisible();
  });

  test("How It Works toggle works", async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("tower-planner-seen", "1");
    });
    await setupMockRoutes(page, mockActiveTower);
    await page.goto("/analyze/tower-planner");
    await dismissModals(page);

    // Initially collapsed
    await expect(page.locator("[data-testid='how-it-works-content']")).not.toBeVisible();

    // Click to expand
    await page.locator("[data-testid='how-it-works-toggle']").click();
    await expect(page.locator("[data-testid='how-it-works-content']")).toBeVisible();

    // Click to collapse
    await page.locator("[data-testid='how-it-works-toggle']").click();
    await expect(page.locator("[data-testid='how-it-works-content']")).not.toBeVisible();
  });
});
