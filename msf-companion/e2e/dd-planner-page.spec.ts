import { test, expect, type Page } from "@playwright/test";

const mockDDList = [
  { id: "dd7", name: "Dark Dimension 7", nodeCount: 13, ddCompletion: null },
  { id: "dd8", name: "Dark Dimension 8", nodeCount: 13, ddCompletion: null },
];

const mockDD7Detail = {
  id: "dd7",
  name: "Dark Dimension 7",
  ddCompletion: null,
  nodes: [
    { roomId: "A1", name: "City Node 1", isBoss: false, sectionName: "City" },
    { roomId: "A2", name: "City Node 2", isBoss: false, sectionName: "City" },
    { roomId: "B1", name: "Global Boss", isBoss: true, sectionName: "Global" },
  ],
};

const mockDD8Detail = {
  id: "dd8",
  name: "Dark Dimension 8",
  ddCompletion: null,
  nodes: [
    { roomId: "C1", name: "Hero Node 1", isBoss: false, sectionName: "City Hero" },
  ],
};

async function setupMockRoutes(page: Page) {
  await page.route("**/api/msf/planner/dd/dd7", (route) => {
    if (route.request().url().includes("/dd7/")) return route.fallback();
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockDD7Detail),
    });
  });

  await page.route("**/api/msf/planner/dd/dd8", (route) => {
    if (route.request().url().includes("/dd8/")) return route.fallback();
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockDD8Detail),
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

test.describe("DD Planner Page", () => {
  test("DD selector is visible and lists at least one DD", async ({ page }) => {
    await setupMockRoutes(page);
    await page.goto("/analyze/dd-planner");
    await page.waitForSelector('[data-testid="dd-selector"]');
    const options = await page.locator('[data-testid="dd-selector"] option').count();
    // At least placeholder + 1 DD
    expect(options).toBeGreaterThanOrEqual(2);
    await expect(page.getByText("DD Planner")).toBeVisible();
  });

  test("Select a DD — node selector appears showing nodes in order with total count", async ({
    page,
  }) => {
    await setupMockRoutes(page);
    await page.goto("/analyze/dd-planner");
    await page.waitForSelector('[data-testid="dd-selector"]');
    await page.locator('[data-testid="dd-selector"]').selectOption("dd7");
    await page.waitForSelector('[data-testid="node-selector"]');
    // Should show 3 nodes
    await expect(page.getByText("3 nodes", { exact: true })).toBeVisible();
    // Node names appear inside dropdown options
    const options = await page.locator('[data-testid="node-selector"] option').allTextContents();
    const joined = options.join("||");
    expect(joined).toContain("City Node 1");
    expect(joined).toContain("City Node 2");
    expect(joined).toContain("Global Boss");
  });

  test("Select a node — node is visually highlighted without page reload", async ({
    page,
  }) => {
    await setupMockRoutes(page);
    await page.goto("/analyze/dd-planner");
    await page.waitForSelector('[data-testid="dd-selector"]');
    await page.locator('[data-testid="dd-selector"]').selectOption("dd7");
    await page.waitForSelector('[data-testid="node-selector"]');

    await page.locator('[data-testid="node-selector"]').selectOption("A1");

    // Selected node indicator should appear
    await expect(page.getByText("Selected node:")).toBeVisible();
    await expect(page.getByText("City Node 1").last()).toBeVisible();
  });

  test("Page renders at 390x844 mobile viewport without horizontal overflow", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await setupMockRoutes(page);
    await page.goto("/analyze/dd-planner");
    await page.waitForSelector('[data-testid="dd-selector"]');

    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
  });

  test("Switch DD — previous node selection is cleared", async ({ page }) => {
    await setupMockRoutes(page);
    await page.goto("/analyze/dd-planner");
    await page.waitForSelector('[data-testid="dd-selector"]');

    // Select DD7 and a node
    await page.locator('[data-testid="dd-selector"]').selectOption("dd7");
    await page.waitForSelector('[data-testid="node-selector"]');
    await page.locator('[data-testid="node-selector"]').selectOption("A1");
    await expect(page.getByText("Selected node:")).toBeVisible();

    // Switch to DD8
    await page.locator('[data-testid="dd-selector"]').selectOption("dd8");
    await page.waitForSelector('[data-testid="node-selector"]');

    // Previous selection should be cleared
    await expect(page.getByText("Selected node:")).not.toBeVisible();
    // DD8 node should be visible in dropdown options
    const options = await page.locator('[data-testid="node-selector"] option').allTextContents();
    expect(options.join("||")).toContain("Hero Node 1");
  });
});
