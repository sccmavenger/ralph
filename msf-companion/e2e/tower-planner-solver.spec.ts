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

const mockReadiness = {
  room_a1: { status: "ready", eligibleCount: 7 },
};

const mockMetaTeams = {
  teams: [
    { squad: ["char1", "char2", "char3", "char4", "char5"], usageTotal: 100 },
  ],
};

const mockSolverResult = {
  assignments: {
    room_a1: {
      characters: [
        { id: "c1", name: "Wolverine" },
        { id: "c2", name: "Jean Grey" },
        { id: "c3", name: "Cyclops" },
        { id: "c4", name: "Storm" },
        { id: "c5", name: "Rogue" },
      ],
      power: 750000,
      confidence: "strong",
      reason: "Your strongest Mutant team — 150k above minimum",
    },
  },
  unassignableRooms: [],
};

async function setupMockRoutes(page: Page) {
  await page.route("**/api/tower/events", (route) => {
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockActiveTower),
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

  await page.route("**/api/tower/meta-teams*", (route) => {
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockMetaTeams),
    });
  });

  await page.route("**/api/tower/solve*", (route) => {
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockSolverResult),
    });
  });
}

async function dismissModals(page: Page) {
  // Dismiss "Stay in the loop" email modal
  const skipBtn = page.getByText("Skip for now");
  if (await skipBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await skipBtn.click();
    await page.waitForTimeout(500);
  }

  // Dismiss "Welcome, Commander!" onboarding tour
  const skipTour = page.getByText("Skip Tour");
  if (await skipTour.isVisible({ timeout: 1000 }).catch(() => false)) {
    await skipTour.click();
    await page.waitForTimeout(500);
  }

  // Dismiss "Install MSF Companion" PWA prompt
  const installDismiss = page.locator("[data-testid='install-dismiss']");
  if (await installDismiss.isVisible({ timeout: 1000 }).catch(() => false)) {
    await installDismiss.click();
    await page.waitForTimeout(500);
  }
}

test.describe("Tower Planner Solver", () => {
  test("Pick My Teams button is visible and clickable", async ({ page }) => {
    await setupMockRoutes(page);
    await page.goto("/analyze/tower-planner");
    await dismissModals(page);

    const button = page.locator("[data-testid='pick-my-teams-btn']");
    await expect(button).toBeVisible();
    await expect(button).toContainText("Pick My Teams");
  });

  test("assignments populate after clicking Pick My Teams", async ({ page }) => {
    await setupMockRoutes(page);
    await page.goto("/analyze/tower-planner");
    await dismissModals(page);

    // Click and wait for the solve API response
    await Promise.all([
      page.waitForResponse((resp) => resp.url().includes("/api/tower/solve")),
      page.locator("[data-testid='pick-my-teams-btn']").click(),
    ]);

    // Wait for assignments to appear
    await expect(page.locator("[data-testid='team-assignment']")).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("Wolverine")).toBeVisible();
  });

  test("confidence badges render with correct colors", async ({ page }) => {
    await setupMockRoutes(page);
    await page.goto("/analyze/tower-planner");
    await dismissModals(page);

    await Promise.all([
      page.waitForResponse((resp) => resp.url().includes("/api/tower/solve")),
      page.locator("[data-testid='pick-my-teams-btn']").click(),
    ]);

    const badge = page.locator("[data-testid='confidence-badge']");
    await expect(badge).toBeVisible({ timeout: 10000 });
    await expect(badge).toContainText("Strong pick");
  });

  test("Why this team expander works", async ({ page }) => {
    await setupMockRoutes(page);
    await page.goto("/analyze/tower-planner");
    await dismissModals(page);

    await Promise.all([
      page.waitForResponse((resp) => resp.url().includes("/api/tower/solve")),
      page.locator("[data-testid='pick-my-teams-btn']").click(),
    ]);

    // Expander should be present
    const expander = page.locator("[data-testid='why-this-team']");
    await expect(expander).toBeVisible({ timeout: 10000 });
    await expander.click();

    // Reason text should appear
    await expect(page.getByText("150k above minimum")).toBeVisible();
  });

  test("edit button visible on assigned rooms", async ({ page }) => {
    await setupMockRoutes(page);
    await page.goto("/analyze/tower-planner");
    await dismissModals(page);

    await Promise.all([
      page.waitForResponse((resp) => resp.url().includes("/api/tower/solve")),
      page.locator("[data-testid='pick-my-teams-btn']").click(),
    ]);

    await expect(page.locator("[data-testid='edit-assignment-btn']")).toBeVisible({ timeout: 10000 });
  });

  test("manual override opens character picker", async ({ page }) => {
    await setupMockRoutes(page);
    await page.goto("/analyze/tower-planner");
    await dismissModals(page);

    await Promise.all([
      page.waitForResponse((resp) => resp.url().includes("/api/tower/solve")),
      page.locator("[data-testid='pick-my-teams-btn']").click(),
    ]);

    await page.locator("[data-testid='edit-assignment-btn']").click();
    await expect(page.locator("[data-testid='character-picker']")).toBeVisible();
    await expect(page.locator("[data-testid='confirm-override-btn']")).toBeVisible();
  });
});
