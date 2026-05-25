import { test, expect, type Page } from "@playwright/test";

// US-005 — UI shows opponent power, team power, margin, confidence per cell.
// Mocks /api/tower/solve with the new difficulty-aware response shape
// (opponentPowers + marginPct + marginFallback) and asserts the new UI surfaces.

const mockTower = {
  id: "tower_alpha",
  name: "Alpha Tower",
  endDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
  currentWeek: 1,
  rays: [
    {
      id: "ray_a",
      rooms: [
        { id: "room_easy", name: "Floor 1" },
        { id: "room_hard", name: "Floor 2" },
      ],
    },
  ],
};

// Include `towers` array so the rooms-loader effect's `towerData?.towers?.length`
// dep transitions from undefined → 1 and actually fires.
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
    requirements: { traits: ["Mutant"], minGearTier: 16, minStars: 5, minLevel: 85 },
    week: 1,
    combatId: "combat_easy",
  },
  {
    id: "room_hard",
    rayId: "ray_a",
    name: "Floor 2",
    requirements: { traits: ["Mutant"], minGearTier: 16, minStars: 5, minLevel: 85 },
    week: 1,
    combatId: "combat_hard",
  },
];

const mockReadiness = {
  room_easy: { status: "ready", eligibleCount: 7 },
  room_hard: { status: "ready", eligibleCount: 7 },
};

// Easy room: comfortable margin (+25%, strong). Hard room: marginFallback (no team meets safety margin).
const mockSolverResult = {
  assignments: {
    room_easy: {
      characters: [
        { id: "c1", name: "Wolverine" },
        { id: "c2", name: "Jean Grey" },
        { id: "c3", name: "Cyclops" },
        { id: "c4", name: "Storm" },
        { id: "c5", name: "Rogue" },
      ],
      power: 750000,
      confidence: "strong",
      reason: "Your team is ~25% stronger than the opponent.",
      marginPct: 25,
      marginFallback: false,
    },
    room_hard: {
      characters: [
        { id: "c1", name: "Wolverine" },
        { id: "c2", name: "Jean Grey" },
        { id: "c3", name: "Cyclops" },
        { id: "c4", name: "Storm" },
        { id: "c5", name: "Rogue" },
      ],
      power: 750000,
      confidence: "likelyLoss",
      reason:
        "No team meets the recommended 1.10x safety margin — best available shown.",
      marginPct: -25,
      marginFallback: true,
    },
  },
  unassignableRooms: [],
  opponentPowers: {
    room_easy: 600000,
    room_hard: 1000000,
  },
  opponentTeams: {
    room_easy: { combatId: "combat_easy", totalPower: 600000 },
    room_hard: { combatId: "combat_hard", totalPower: 1000000 },
  },
  roomFetchErrors: [],
};

async function setupMockRoutes(page: Page, solverBody: object) {
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
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(solverBody) }),
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

test.describe("Tower Planner Difficulty-Aware UI (US-005)", () => {
  test("margin % renders on at least one room card", async ({ page }) => {
    await setupMockRoutes(page, mockSolverResult);
    await page.goto("/analyze/tower-planner");
    await dismissModals(page);

    await Promise.all([
      page.waitForResponse((resp) => resp.url().includes("/api/tower/solve")),
      page.locator("[data-testid='pick-my-teams-btn']").click(),
    ]);

    const marginBadges = page.locator("[data-testid='margin-pct']");
    await expect(marginBadges.first()).toBeVisible({ timeout: 10000 });
    // Easy room: +25% margin.
    await expect(page.locator("[data-room-id='room_easy'] [data-testid='margin-pct']")).toContainText("25%");
    // Opponent power and team power should both render.
    await expect(page.locator("[data-room-id='room_easy'] [data-testid='opponent-power']")).toBeVisible();
    await expect(page.locator("[data-room-id='room_easy'] [data-testid='team-power']")).toBeVisible();
  });

  test("marginFallback shows the safety-margin warning banner", async ({ page }) => {
    await setupMockRoutes(page, mockSolverResult);
    await page.goto("/analyze/tower-planner");
    await dismissModals(page);

    await Promise.all([
      page.waitForResponse((resp) => resp.url().includes("/api/tower/solve")),
      page.locator("[data-testid='pick-my-teams-btn']").click(),
    ]);

    const warning = page.locator(
      "[data-room-id='room_hard'] [data-testid='margin-fallback-warning']",
    );
    await expect(warning).toBeVisible({ timeout: 10000 });
    await expect(warning).toContainText("safety margin");

    // The hard room should also show the likelyLoss confidence chip.
    await expect(
      page.locator("[data-room-id='room_hard'] [data-testid='confidence-badge']"),
    ).toContainText("Likely loss");
  });
});
