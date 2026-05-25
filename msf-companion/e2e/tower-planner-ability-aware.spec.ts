import { test, expect, type Page } from "@playwright/test";

// US-009 — Regression: the ability-aware solver should pick a counter-relevant
// team over an equivalent-power team that lacks counters.
//
// Scenario: opponent has a bleed-heavy kit. User's roster contains two
// equivalent-power teams (each ~750k):
//   - Team A: bleed-immune characters (e.g. Symbiote / armor traits) — counter coverage > 0
//   - Team B: non-bleed-immune characters of equal power — counter coverage = 0
// The composite score (power + synergy + counter + balance) prefers Team A.
//
// E2E intentionally mocks /api/tower/solve directly to assert the rendered
// "Why this team?" breakdown surfaces a non-zero counter sub-score and the
// bleed-immune characters were chosen. The solver's actual counter logic is
// covered by unit tests in src/lib/tower-scoring.test.ts.

const mockTower = {
  id: "tower_us009",
  eventId: "tower_us009",
  name: "Ability-Aware Tower",
  endDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
  currentWeek: 1,
  rays: [
    {
      id: "ray_a",
      rooms: [{ id: "room_bleed", name: "Floor 1" }],
    },
  ],
};

// IMPORTANT: include both `tower` AND `towers: [tower]` so the per-tower data
// effect in TowerPlannerClient (deps: [activeTowerIndex, towers?.length])
// actually fires — see progress.txt Codebase Patterns note on this gotcha.
const mockActiveTower = {
  active: true,
  tower: mockTower,
  towers: [mockTower],
};

const mockRooms = [
  {
    id: "room_bleed",
    rayId: "ray_a",
    name: "Floor 1",
    requirements: {
      traits: [],
      minGearTier: 0,
      minStars: 0,
      minLevel: 0,
      minCharacters: 5,
      maxCharacters: 5,
    },
    week: 1,
    combatId: "combat_bleed",
  },
];

const mockReadiness = {
  room_bleed: { status: "ready", eligibleCount: 10 },
};

// 10-character roster: 5 bleed-immune (BI*) + 5 non-immune (PL*), each team
// summing to the same total power (~750k) so power alone can't decide.
const BLEED_IMMUNE_TEAM = [
  { id: "bi1", name: "Carnage" },
  { id: "bi2", name: "Venom" },
  { id: "bi3", name: "Anti-Venom" },
  { id: "bi4", name: "Scream" },
  { id: "bi5", name: "Knull" },
];

const NON_IMMUNE_TEAM = [
  { id: "pl1", name: "Plain One" },
  { id: "pl2", name: "Plain Two" },
  { id: "pl3", name: "Plain Three" },
  { id: "pl4", name: "Plain Four" },
  { id: "pl5", name: "Plain Five" },
];

const mockSolverResult = {
  // Solver picked the bleed-immune team. The composite breakdown shows a
  // non-zero counter sub-score, which is the regression signal: prior to
  // the ability-aware solver, both teams would have tied on power and the
  // solver would have picked arbitrarily.
  assignments: {
    room_bleed: {
      characters: BLEED_IMMUNE_TEAM,
      power: 750_000,
      confidence: "strong",
      reason:
        "Bleed-immune Symbiotes counter the opponent's bleed kit. Score 82/100 (power 60, synergy 70, counter 80, balance 50).",
      marginPct: 50,
      marginFallback: false,
      compositeScore: {
        power: 60,
        synergy: 70,
        counter: 80,
        roleBalance: 50,
        total: 82,
      },
    },
  },
  unassignableRooms: [],
  opponentPowers: { room_bleed: 500_000 },
  opponentTeams: {
    room_bleed: {
      combatId: "combat_bleed",
      totalPower: 500_000,
      units: [
        { id: "wolverine", name: "Wolverine", power: 100_000, tags: ["bleed"] },
        { id: "sabretooth", name: "Sabretooth", power: 100_000, tags: ["bleed"] },
        { id: "deadpool", name: "Deadpool", power: 100_000, tags: ["bleed"] },
        { id: "lady_deathstrike", name: "Lady Deathstrike", power: 100_000, tags: ["bleed"] },
        { id: "x23", name: "X-23", power: 100_000, tags: ["bleed"] },
      ],
    },
  },
  roomFetchErrors: [],
  // NOTE: intentionally omit `solverInputs` so the client does NOT re-run
  // `solveTowerAllocation` locally on initial render (US-006 behavior).
  // The client-side recompute path doesn't receive the opponentTags /
  // characterTags maps (only opponentPowers + safetyMargin), so
  // `compositeScore` would be dropped from the recomputed assignment.
  // We want our mocked assignment (with compositeScore.counter > 0) to be
  // what the UI renders.
};

async function setupMockRoutes(page: Page) {
  await page.route("**/api/tower/events", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockActiveTower),
    }),
  );
  await page.route("**/api/tower/rooms*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockRooms),
    }),
  );
  await page.route("**/api/tower/readiness*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockReadiness),
    }),
  );
  await page.route("**/api/tower/upgrades*", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) }),
  );
  await page.route("**/api/tower/history", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) }),
  );
  await page.route("**/api/tower/meta-teams*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ teams: [] }),
    }),
  );
  await page.route("**/api/tower/solve*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockSolverResult),
    }),
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

test.describe("Tower Planner Ability-Aware Scoring (US-009)", () => {
  test("solver picks bleed-immune team and Why this team? shows counter > 0", async ({ page }) => {
    await setupMockRoutes(page);
    await page.goto("/analyze/tower-planner");
    await dismissModals(page);

    await Promise.all([
      page.waitForResponse((resp) => resp.url().includes("/api/tower/solve")),
      page.locator("[data-testid='pick-my-teams-btn']").click(),
    ]);

    // 1. The bleed-immune team was assigned — assert characters from
    //    BLEED_IMMUNE_TEAM are rendered and none from NON_IMMUNE_TEAM.
    const assignment = page.locator("[data-testid='team-assignment']");
    await expect(assignment).toBeVisible({ timeout: 10000 });
    for (const c of BLEED_IMMUNE_TEAM) {
      await expect(page.getByText(c.name)).toBeVisible();
    }
    for (const c of NON_IMMUNE_TEAM) {
      await expect(page.getByText(c.name)).toHaveCount(0);
    }

    // 2. Expand "Why this team?" breakdown.
    await page.locator("[data-testid='why-this-team']").click();
    await expect(page.locator("[data-testid='why-this-team-panel']")).toBeVisible();
    await expect(page.locator("[data-testid='composite-breakdown']")).toBeVisible();

    // 3. The regression assertion: counter sub-score is greater than zero.
    const counterText = await page
      .locator("[data-testid='composite-counter']")
      .innerText();
    const counterMatch = counterText.match(/(\d+)\s*\/\s*100/);
    expect(counterMatch, `expected "N/100" in counter text, got: ${counterText}`).not.toBeNull();
    const counterValue = Number(counterMatch![1]);
    expect(counterValue).toBeGreaterThan(0);
  });
});
