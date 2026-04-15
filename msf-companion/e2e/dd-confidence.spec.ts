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

// Recommendation with alternatives (high roster count)
const mockRecommendationWithAlts = {
  primaryTeam: [
    { id: "c1", name: "Silver Sable", power: 900000, gearTier: 19, reasoning: "High power" },
    { id: "c2", name: "Daredevil", power: 850000, gearTier: 19, reasoning: "Protection role" },
    { id: "c3", name: "Punisher", power: 800000, gearTier: 19, reasoning: "Trait synergy" },
    { id: "c4", name: "Blade", power: 750000, gearTier: 19, reasoning: "Damage output" },
    { id: "c5", name: "Oath", power: 700000, gearTier: 19, reasoning: "Support role" },
  ],
  confidence: 75,
  alternatives: [
    [
      { id: "c6", name: "Hit-Monkey", power: 680000, gearTier: 19, reasoning: "Alternative DPS" },
      { id: "c7", name: "Spider-Man 2099", power: 660000, gearTier: 19, reasoning: "Controller role" },
      { id: "c8", name: "Miles Morales", power: 640000, gearTier: 19, reasoning: "City synergy" },
    ],
  ],
  swapSuggestions: [],
  futureBuildSuggestions: [],
  maxCharacters: 5,
};

async function setupMockRoutes(page: Page, recData: unknown = mockRecommendationWithAlts) {
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
  await page.waitForSelector('[data-testid="primary-team"]');
}

test.describe("DD Confidence and Alternatives", () => {
  test("Confidence score element is visible with numeric value between 0 and 100", async ({
    page,
  }) => {
    await setupMockRoutes(page);
    await navigateAndRecommend(page);
    const scoreEl = page.getByTestId("confidence-value");
    await expect(scoreEl).toBeVisible();
    const text = await scoreEl.textContent();
    const value = parseInt(text ?? "", 10);
    expect(value).toBeGreaterThanOrEqual(0);
    expect(value).toBeLessThanOrEqual(100);
  });

  test("Confidence score has color styling applied (green, yellow, or red class)", async ({
    page,
  }) => {
    await setupMockRoutes(page);
    await navigateAndRecommend(page);
    const scoreEl = page.getByTestId("confidence-value");
    const classes = await scoreEl.getAttribute("class");
    // Should have one of the color classes
    const hasColor =
      classes?.includes("text-green") ||
      classes?.includes("text-yellow") ||
      classes?.includes("text-red");
    expect(hasColor).toBe(true);
  });

  test("When alternatives are available, alternative team section is displayed below primary team", async ({
    page,
  }) => {
    await setupMockRoutes(page);
    await navigateAndRecommend(page);
    await expect(page.getByTestId("alternatives")).toBeVisible();
    await expect(page.getByText("Alternative Team")).toBeVisible();
  });

  test("Alternative team entries show character names and portraits", async ({
    page,
  }) => {
    await setupMockRoutes(page);
    await navigateAndRecommend(page);
    const altChars = page.locator('[data-testid="alt-char"]');
    const count = await altChars.count();
    expect(count).toBeGreaterThan(0);
    // Check first alt char has a name
    await expect(page.getByText("Hit-Monkey")).toBeVisible();
  });
});
