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
    { roomId: "B1", name: "Global Boss", isBoss: true, sectionName: "Global" },
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
    minCharacters: 1,
  },
  enemies: {
    left: {
      waves: [
        {
          units: [
            {
              id: "char-spider",
              level: 95,
              gearTier: 19,
              info: {
                name: "Spider-Man",
                portrait: "https://example.com/spider.png",
                traits: ["City", "Hero", "Bio"],
              },
            },
            {
              id: "char-dare",
              level: 95,
              gearTier: 19,
              info: {
                name: "Daredevil",
                traits: ["City", "Hero", "Skill"],
              },
            },
          ],
        },
        {
          units: [
            {
              id: "char-punisher",
              level: 100,
              gearTier: 20,
              info: {
                name: "Punisher",
                traits: ["City", "Hero", "Skill"],
              },
            },
          ],
        },
      ],
    },
  },
};

async function setupMockRoutes(page: Page) {
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

async function selectDDAndNode(page: Page) {
  await page.goto("/analyze/dd-planner");
  await page.waitForSelector('[data-testid="dd-selector"]');
  await page.locator('[data-testid="dd-selector"]').selectOption("dd7");
  await page.waitForSelector('[data-testid="node-selector"]');
  await page.locator('[data-testid="node-selector"]').selectOption("A1");
  await page.waitForSelector('[data-testid="node-intel-panel"]');
}

test.describe("DD Node Intelligence", () => {
  test("Select a node — enemy intelligence panel appears with enemy entries", async ({
    page,
  }) => {
    await setupMockRoutes(page);
    await selectDDAndNode(page);
    // Waves are collapsed by default — expand them
    await page.getByText("Expand All").click();
    const entries = await page.locator('[data-testid="enemy-entry"]').count();
    expect(entries).toBeGreaterThan(0);
  });

  test("Each enemy entry shows name/id and level text", async ({ page }) => {
    await setupMockRoutes(page);
    await selectDDAndNode(page);
    // Expand waves to reveal enemy entries
    await page.getByText("Expand All").click();
    await expect(page.getByText("Spider-Man")).toBeVisible();
    await expect(page.getByText("Lv 95").first()).toBeVisible();
  });

  test("Wave structure is visible (Wave 1, Wave 2 labels)", async ({
    page,
  }) => {
    await setupMockRoutes(page);
    await selectDDAndNode(page);
    await expect(page.getByTestId("wave-1")).toBeVisible();
    await expect(page.getByTestId("wave-2")).toBeVisible();
    await expect(page.getByText("Wave 1")).toBeVisible();
    await expect(page.getByText("Wave 2")).toBeVisible();
  });

  test("Panel renders at 375x667 viewport without clipping", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await setupMockRoutes(page);
    await selectDDAndNode(page);
    const scrollWidth = await page.evaluate(
      () => document.documentElement.scrollWidth,
    );
    const clientWidth = await page.evaluate(
      () => document.documentElement.clientWidth,
    );
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
  });

  test("Node requirements summary is visible above enemies", async ({
    page,
  }) => {
    await setupMockRoutes(page);
    await selectDDAndNode(page);
    await expect(page.getByTestId("node-requirements")).toBeVisible();
    await expect(page.getByText("Node Requirements")).toBeVisible();
    // Should show City trait and GT19 within the requirements section
    await expect(page.locator('[data-testid="node-requirements"]').getByText("City")).toBeVisible();
    await expect(page.getByText("GT19+")).toBeVisible();
  });
});
