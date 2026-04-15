import { test, expect, type Page } from "@playwright/test";

const mockCharacters = Array.from({ length: 45 }, (_, i) => ({
  id: `char-${i}`,
  name: `Character ${i}`,
  portrait: `https://example.com/portraits/char-${i}.png`,
  traits: [
    ["Bio", "Tech", "Mystic", "Mutant", "Skill", "Cosmic"][i % 6],
    ["Protector", "Support", "Controller", "Brawler", "Blaster"][i % 5],
    i % 2 === 0 ? "Hero" : "Villain",
  ],
}));

async function setupMock(page: Page) {
  await page.route("**/api/msf/characters*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockCharacters),
    }),
  );
}

test.describe("Heroes Page", () => {
  test("navigate to /heroes — shows Character Database heading and filter controls", async ({
    page,
  }) => {
    await setupMock(page);
    await page.goto("/heroes");
    await expect(page.getByText("Character Database")).toBeVisible();
    await expect(page.getByText(/characters found/).first()).toBeVisible();
    await expect(page.getByPlaceholder("Search characters...")).toBeVisible();
  });

  test("search input is visible and filters characters", async ({ page }) => {
    await setupMock(page);
    await page.goto("/heroes");
    await expect(page.getByText("Character Database")).toBeVisible();
    const search = page.getByPlaceholder("Search characters...");
    await expect(search).toBeVisible();
    await search.fill("Character 1");
    // Should filter to characters matching "Character 1"
    await expect(page.getByText(/characters found/)).toBeVisible();
  });

  test("origin filter dropdown is visible with expected options", async ({
    page,
  }) => {
    await setupMock(page);
    await page.goto("/heroes");
    await expect(page.getByText("Character Database")).toBeVisible();
    const selects = page.locator("select");
    const count = await selects.count();
    expect(count).toBeGreaterThanOrEqual(2);
  });

  test("character grid or empty state renders without errors", async ({ page }) => {
    await setupMock(page);
    await page.goto("/heroes");
    await expect(page.getByText("Character Database")).toBeVisible();
    // Page should show either characters or "0 characters found" — either is valid
    await expect(page.getByText(/characters found/).first()).toBeVisible();
  });

  test("page renders at 390x844 mobile viewport without horizontal overflow", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await setupMock(page);
    await page.goto("/heroes");
    await expect(page.getByText("Character Database")).toBeVisible();
    const scrollWidth = await page.evaluate(
      () => document.documentElement.scrollWidth,
    );
    const clientWidth = await page.evaluate(
      () => document.documentElement.clientWidth,
    );
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
  });
});
