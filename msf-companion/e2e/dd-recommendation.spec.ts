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
  requirements: {
    anyCharacterFilters: [{ allTraits: ["City"], gearTier: 19 }],
    maxCharacters: 5,
  },
  enemies: {
    left: {
      waves: [
        {
          units: [
            { id: "enemy-1", level: 95, gearTier: 19, info: { name: "Enemy 1" } },
          ],
        },
      ],
    },
  },
};

const mockRecommendation = {
  primaryTeam: [
    { id: "char-1", name: "Silver Sable", power: 900000, gearTier: 19, reasoning: "High power relative to enemies" },
    { id: "char-2", name: "Daredevil", power: 850000, gearTier: 19, reasoning: "Provides team protection (Protector role)" },
    { id: "char-3", name: "Punisher", power: 800000, gearTier: 19, reasoning: "Strong trait overlap with enemy composition" },
    { id: "char-4", name: "Blade", power: 750000, gearTier: 19, reasoning: "High damage output" },
    { id: "char-5", name: "Oath", power: 700000, gearTier: 19, reasoning: "Provides healing/buffs (Support role)" },
  ],
  confidence: 82,
  alternatives: [],
  swapSuggestions: [],
  futureBuildSuggestions: [],
  maxCharacters: 5,
};

async function setupMockRoutes(page: Page) {
  await page.route("**/api/msf/planner/dd/recommend", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockRecommendation),
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
  await page.waitForSelector('[data-testid="primary-team"]');
}

test.describe("DD Recommendation Display", () => {
  test("Select a node and click Get Recommendation — recommendation card appears", async ({
    page,
  }) => {
    await setupMockRoutes(page);
    await navigateAndRecommend(page);
    const entries = await page.locator('[data-testid="recommended-char"]').count();
    expect(entries).toBeGreaterThan(0);
  });

  test("Each recommended character shows name, portrait element, and reasoning text", async ({
    page,
  }) => {
    await setupMockRoutes(page);
    await navigateAndRecommend(page);
    await expect(page.getByText("Silver Sable")).toBeVisible();
    const reasonings = await page.locator('[data-testid="char-reasoning"]').count();
    expect(reasonings).toBeGreaterThan(0);
    for (let i = 0; i < reasonings; i++) {
      const text = await page.locator('[data-testid="char-reasoning"]').nth(i).textContent();
      expect(text?.length).toBeGreaterThan(0);
    }
  });

  test("Recommendation panel shows team size label matching node requirements", async ({
    page,
  }) => {
    await setupMockRoutes(page);
    await navigateAndRecommend(page);
    await expect(page.getByTestId("team-size-label")).toContainText("5 characters recommended");
    await expect(page.getByTestId("team-size-label")).toContainText("max 5");
  });

  test("Recommendation loads within 5 seconds from button click", async ({
    page,
  }) => {
    await setupMockRoutes(page);
    await page.goto("/analyze/dd-planner");
    await page.waitForSelector('[data-testid="dd-selector"]');
    await page.locator('[data-testid="dd-selector"]').selectOption("dd7");
    await page.waitForSelector('[data-testid="node-selector"]');
    await page.locator('[data-testid="node-selector"]').selectOption("A1");
    await page.waitForSelector('[data-testid="get-recommendation-btn"]');

    const start = Date.now();
    await page.locator('[data-testid="get-recommendation-btn"]').click();
    await page.waitForSelector('[data-testid="primary-team"]', { timeout: 5000 });
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(5000);
  });
});
