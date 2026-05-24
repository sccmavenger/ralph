import { test, expect, type Page } from "@playwright/test";

// US-006 — User-tunable safety margin slider.
// Mocks /api/tower/solve with a response that includes `solverInputs` (US-006)
// so the client can re-run the solver locally when the slider moves.

const mockTower = {
  id: "tower_us006",
  eventId: "tower_us006",
  name: "Slider Tower",
  endDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
  currentWeek: 1,
  rays: [
    {
      id: "ray_a",
      rooms: [{ id: "room_easy", name: "Floor 1" }],
    },
  ],
};

const mockActiveTower = {
  active: true,
  tower: mockTower,
  towers: [mockTower],
};

const mockRooms = [
  {
    id: "room_easy",
    rayId: "ray_a",
    name: "Floor 1",
    requirements: { traits: [], minGearTier: 0, minStars: 0, minLevel: 0, minCharacters: 5, maxCharacters: 5 },
    week: 1,
    combatId: "combat_easy",
  },
];

const mockReadiness = {
  room_easy: { status: "ready", eligibleCount: 8 },
};

// 8 eligible characters with stepped power so a higher margin forces the
// solver to pick a stronger subset.
const roster = Array.from({ length: 8 }, (_, i) => ({
  id: `c${i + 1}`,
  name: `Char ${i + 1}`,
  traits: [],
  gearTier: 17,
  stars: 7,
  level: 95,
  power: 100_000 + i * 20_000, // 100k, 120k, 140k, ... 240k
}));

const solverRooms = [
  {
    id: "room_easy",
    name: "Floor 1",
    requirements: { traits: [], minGearTier: 0, minStars: 0, minLevel: 0, filters: [] },
    minCharacters: 5,
  },
];

// Server's initial response uses default 1.10x margin: weakest viable team
// (c1..c5 = 100+120+140+160+180 = 700k) vs opponent 500k -> +40% margin, strong.
const mockSolverResult = {
  assignments: {
    room_easy: {
      characters: [
        { id: "c1", name: "Char 1" },
        { id: "c2", name: "Char 2" },
        { id: "c3", name: "Char 3" },
        { id: "c4", name: "Char 4" },
        { id: "c5", name: "Char 5" },
      ],
      power: 700_000,
      confidence: "strong",
      reason: "Your team is ~40% stronger than the opponent.",
      marginPct: 40,
      marginFallback: false,
    },
  },
  unassignableRooms: [],
  opponentPowers: { room_easy: 500_000 },
  opponentTeams: { room_easy: { combatId: "combat_easy", totalPower: 500_000 } },
  roomFetchErrors: [],
  solverInputs: {
    roster,
    solverRooms,
    metaTeams: [],
    clearedRooms: [],
  },
};

async function setupMockRoutes(page: Page) {
  await page.route("**/api/tower/events", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockActiveTower) }),
  );
  await page.route("**/api/tower/rooms*", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockRooms) }),
  );
  await page.route("**/api/tower/readiness*", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockReadiness) }),
  );
  await page.route("**/api/tower/upgrades*", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) }),
  );
  await page.route("**/api/tower/history", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) }),
  );
  await page.route("**/api/tower/solve*", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockSolverResult) }),
  );
}

async function dismissModals(page: Page) {
  const skipBtn = page.getByText("Skip for now");
  if (await skipBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await skipBtn.click();
    await page.waitForTimeout(300);
  }
  const skipTour = page.getByText("Skip Tour");
  if (await skipTour.isVisible({ timeout: 1000 }).catch(() => false)) {
    await skipTour.click();
    await page.waitForTimeout(300);
  }
  const installDismiss = page.locator("[data-testid='install-dismiss']");
  if (await installDismiss.isVisible({ timeout: 1000 }).catch(() => false)) {
    await installDismiss.click();
    await page.waitForTimeout(300);
  }
}

test.describe("Tower Planner Safety Margin Slider (US-006)", () => {
  test("slider is visible with default value and reset link", async ({ page }) => {
    await setupMockRoutes(page);
    await page.goto("/analyze/tower-planner");
    await dismissModals(page);

    const slider = page.locator("[data-testid='safety-margin-slider']");
    await expect(slider).toBeVisible({ timeout: 10000 });
    await expect(slider).toHaveValue("1.1");

    await expect(page.locator("[data-testid='safety-margin-value']")).toContainText("1.10x");
    await expect(page.locator("[data-testid='safety-margin-reset']")).toBeVisible();
  });

  test("changing the slider re-runs solver client-side and updates margin %", async ({ page }) => {
    await setupMockRoutes(page);
    await page.goto("/analyze/tower-planner");
    await dismissModals(page);

    await Promise.all([
      page.waitForResponse((resp) => resp.url().includes("/api/tower/solve")),
      page.locator("[data-testid='pick-my-teams-btn']").click(),
    ]);

    // Initial margin at 1.10x: weakest viable team (c1..c5 = 700k) vs 500k = +40%.
    await expect(
      page.locator("[data-room-id='room_easy'] [data-testid='margin-pct']"),
    ).toContainText("40%", { timeout: 10000 });

    // Count solve API calls — we should not make another one when the slider changes.
    let solveCallCount = 0;
    await page.route("**/api/tower/solve*", (route) => {
      solveCallCount += 1;
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockSolverResult) });
    });

    // Move slider up to 1.50x. With opponent=500k, target = 750k → weakest
    // 5-char window now starts at c2..c6 (120+140+160+180+200 = 800k) → +60%.
    const slider = page.locator("[data-testid='safety-margin-slider']");
    await slider.fill("1.5");
    await slider.dispatchEvent("change");

    await expect(page.locator("[data-testid='safety-margin-value']")).toContainText("1.50x");
    await expect(
      page.locator("[data-room-id='room_easy'] [data-testid='margin-pct']"),
    ).toContainText("60%", { timeout: 5000 });

    // No extra solve API call was made by the slider change.
    expect(solveCallCount).toBe(0);

    // Reset link snaps back to 1.10x and the displayed margin returns to +40%.
    await page.locator("[data-testid='safety-margin-reset']").click();
    await expect(page.locator("[data-testid='safety-margin-value']")).toContainText("1.10x");
    await expect(
      page.locator("[data-room-id='room_easy'] [data-testid='margin-pct']"),
    ).toContainText("40%");
  });
});
