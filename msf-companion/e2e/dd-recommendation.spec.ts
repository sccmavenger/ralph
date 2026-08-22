import { test, expect, type Page } from "@playwright/test";
import { suppressInstallPrompt } from "./helpers/app-page";

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
            {
              id: "enemy-1",
              level: 95,
              gearTier: 19,
              info: { name: "Enemy 1" },
            },
          ],
        },
      ],
    },
  },
};

const mockRecommendation = {
  primaryTeam: [
    {
      id: "char-1",
      name: "Silver Sable",
      power: 900000,
      gearTier: 19,
      reasoning: "High power relative to enemies",
    },
    {
      id: "char-2",
      name: "Daredevil",
      power: 850000,
      gearTier: 19,
      reasoning: "Provides team protection (Protector role)",
    },
    {
      id: "char-3",
      name: "Punisher",
      power: 800000,
      gearTier: 19,
      reasoning: "Adds damage pressure to the available team",
    },
    {
      id: "char-4",
      name: "Blade",
      power: 750000,
      gearTier: 19,
      reasoning: "High damage output",
    },
    {
      id: "char-5",
      name: "Oath",
      power: 700000,
      gearTier: 19,
      reasoning: "Provides healing/buffs (Support role)",
    },
  ],
  rosterReadiness: 82,
  readinessBasis: "Ready team size, power, and role coverage.",
  mode: "fastest-clear",
  alternatives: [],
  swapSuggestions: [],
  futureBuildSuggestions: [],
  maxCharacters: 5,
};

async function setupMockRoutes(
  page: Page,
  onRecommendation?: (body: Record<string, unknown>) => void,
) {
  await page.route("**/api/msf/planner/dd/recommend", (route) => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    onRecommendation?.(body);
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ...mockRecommendation,
        mode: body.mode ?? "fastest-clear",
        modeEvidence: {
          available: body.mode === "cross-mode-value",
          generatedAt: "2026-08-22T00:00:00.000Z",
          sourceModes: ["raids", "war"],
          meaning: "Usage breadth is popularity, not wins.",
        },
      }),
    });
  });

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
  test.beforeEach(async ({ page }) => suppressInstallPrompt(page));

  test("Select a node and click Get Recommendation — recommendation card appears", async ({
    page,
  }) => {
    await setupMockRoutes(page);
    await navigateAndRecommend(page);
    const entries = await page
      .locator('[data-testid="recommended-char"]')
      .count();
    expect(entries).toBeGreaterThan(0);
  });

  test("Each recommended character shows name, portrait element, and reasoning text", async ({
    page,
  }) => {
    await setupMockRoutes(page);
    await navigateAndRecommend(page);
    await expect(page.getByText("Silver Sable")).toBeVisible();
    const reasonings = await page
      .locator('[data-testid="char-reasoning"]')
      .count();
    expect(reasonings).toBeGreaterThan(0);
    for (let i = 0; i < reasonings; i++) {
      const text = await page
        .locator('[data-testid="char-reasoning"]')
        .nth(i)
        .textContent();
      expect(text?.length).toBeGreaterThan(0);
    }
  });

  test("Recommendation panel shows team size label matching node requirements", async ({
    page,
  }) => {
    await setupMockRoutes(page);
    await navigateAndRecommend(page);
    await expect(page.getByTestId("team-size-label")).toContainText(
      "5 characters recommended",
    );
    await expect(page.getByTestId("team-size-label")).toContainText("max 5");
  });

  test("Recommendation goal is sent to the API and can be changed after loading", async ({
    page,
  }) => {
    const requests: Record<string, unknown>[] = [];
    await setupMockRoutes(page, (body) => requests.push(body));
    await page.goto("/analyze/dd-planner");
    await page.getByTestId("dd-selector").selectOption("dd7");
    await page.getByTestId("node-selector").selectOption("A1");

    await page.getByTestId("recommendation-mode-lowest-investment").click();
    await page.getByTestId("get-recommendation-btn").click();
    await expect(page.getByTestId("primary-team")).toBeVisible();
    expect(requests.at(-1)?.mode).toBe("lowest-investment");

    await page.getByTestId("recommendation-mode-cross-mode-value").click();
    await expect(page.getByTestId("mode-evidence-note")).toBeVisible();
    expect(requests.at(-1)?.mode).toBe("cross-mode-value");
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
    await page.waitForSelector('[data-testid="primary-team"]', {
      timeout: 5000,
    });
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(5000);
  });

  test("Mission-only nodes explain that no roster team is needed", async ({
    page,
  }) => {
    await setupMockRoutes(page);
    await page.route("**/api/msf/planner/dd/recommend", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          primaryTeam: [],
          mode: "fastest-clear",
          alternatives: [],
          swapSuggestions: [],
          futureBuildSuggestions: [],
          gearOriginWarnings: [],
          maxCharacters: 5,
          missionCharacters: true,
          message:
            "This node uses a fixed mission-provided team, so no roster recommendation is needed.",
        }),
      }),
    );

    await page.goto("/analyze/dd-planner");
    await page.getByTestId("dd-selector").selectOption("dd7");
    await page.getByTestId("node-selector").selectOption("A1");
    await page.getByTestId("get-recommendation-btn").click();

    await expect(page.getByTestId("mission-team-message")).toContainText(
      "fixed mission-provided team",
    );
    await expect(page.getByTestId("roster-readiness")).not.toBeVisible();
  });
});
