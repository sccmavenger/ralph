import { test, expect, type Page } from "@playwright/test";

const mockDDList = [
  { id: "dd7", name: "Dark Dimension 7", nodeCount: 3, ddCompletion: null },
];

const mockDDDetail = {
  id: "dd7",
  name: "Dark Dimension 7",
  ddCompletion: null,
  nodes: [
    { roomId: "A1", name: "City Node 1", isBoss: false, sectionName: "City" },
  ],
};

const mockNodeDetail = {
  roomId: "A1",
  name: "City Node 1",
  isBoss: false,
  sectionName: "City",
  requirements: { anyCharacterFilters: [{ allTraits: ["City"], gearTier: 19 }], maxCharacters: 5 },
  enemies: { left: { waves: [{ units: [{ id: "e1", level: 95, info: { name: "Enemy" } }] }] } },
};

// Recommendation with weak roster (low confidence, future builds present)
const mockWeakRosterRecommendation = {
  primaryTeam: [
    { id: "c1", name: "Silver Sable", power: 600000, gearTier: 17, reasoning: "Best available" },
    { id: "c2", name: "Daredevil", power: 500000, gearTier: 16, reasoning: "Trait match" },
  ],
  confidence: 45,
  alternatives: [],
  swapSuggestions: [],
  futureBuildSuggestions: [
    {
      id: "fb1",
      name: "Spider-Man 2099",
      reason: "Strong City hero with crowd control, covers Controller role gap",
      currentState: { gearTier: 14, level: 60 },
      requiredState: { gearTier: 19, level: 90 },
    },
    {
      id: "fb2",
      name: "Oath",
      reason: "Top-tier City Support for healing and buff removal",
      currentState: { gearTier: 0, level: 0 },
      requiredState: { gearTier: 19, level: 90 },
    },
  ],
  gearOriginWarnings: [],
  maxCharacters: 5,
};

async function setupMockRoutes(page: Page, recData: unknown = mockWeakRosterRecommendation) {
  await page.route("**/api/msf/planner/dd/recommend", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(recData),
    }),
  );

  await page.route("**/api/msf/planner/dd/dd7/A1*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockNodeDetail),
    }),
  );

  await page.route("**/api/msf/planner/dd/dd7", (route) => {
    if (route.request().url().includes("/dd7/")) return route.fallback();
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockDDDetail),
    });
  });

  await page.route("**/api/msf/planner/dd", (route) => {
    if (route.request().url().includes("/dd/")) return route.fallback();
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockDDList),
    });
  });
}

async function navigateAndRecommend(page: Page) {
  await page.goto("/analyze/dd-planner");
  await page.waitForSelector('[data-testid="dd-selector"]');
  await page.locator('[data-testid="dd-selector"]').selectOption("dd7");
  await page.waitForSelector('[data-testid="node-selector"]');
  await page.locator('[data-testid="node-selector"]').selectOption("A1");
  await page.waitForSelector('[data-testid="get-recommendation-btn"]');
  await page.locator('[data-testid="get-recommendation-btn"]').click();
  await page.waitForSelector('[data-testid="confidence-score"]');
}

test.describe("DD Future Builds and Gear Origin", () => {
  test("Future build suggestions section appears with at least 1 suggestion when roster is weak", async ({
    page,
  }) => {
    await setupMockRoutes(page);
    await navigateAndRecommend(page);
    await expect(page.getByTestId("future-builds")).toBeVisible();
    const entries = await page.locator('[data-testid="future-build-entry"]').count();
    expect(entries).toBeGreaterThanOrEqual(1);
  });

  test("Each future build suggestion shows character name and a reason string", async ({
    page,
  }) => {
    await setupMockRoutes(page);
    await navigateAndRecommend(page);
    await expect(page.getByText("Spider-Man 2099")).toBeVisible();
    const reasons = await page.locator('[data-testid="future-build-reason"]').count();
    expect(reasons).toBeGreaterThan(0);
    for (let i = 0; i < reasons; i++) {
      const text = await page.locator('[data-testid="future-build-reason"]').nth(i).textContent();
      expect(text?.length).toBeGreaterThan(0);
    }
  });

  test("Future builds section has 'Suggested Investments' heading text", async ({
    page,
  }) => {
    await setupMockRoutes(page);
    await navigateAndRecommend(page);
    await expect(page.getByText("Suggested Investments")).toBeVisible();
  });

  test("Future builds section is visually below/separate from primary team section", async ({
    page,
  }) => {
    await setupMockRoutes(page);
    await navigateAndRecommend(page);

    const primaryTeamBox = await page.getByTestId("primary-team").boundingBox();
    const futureBuildsBox = await page.getByTestId("future-builds").boundingBox();

    expect(primaryTeamBox).toBeTruthy();
    expect(futureBuildsBox).toBeTruthy();
    // Future builds should be below primary team
    expect(futureBuildsBox!.y).toBeGreaterThan(primaryTeamBox!.y);
  });
});
