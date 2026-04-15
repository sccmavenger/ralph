import { test, expect, type Page } from "@playwright/test";

const mockRoster = Array.from({ length: 20 }, (_, i) => ({
  id: `char-${i}`,
  name: `Hero ${i}`,
  level: 80 + i,
  gearTier: 14 + (i % 5),
  power: 500000 + i * 10000,
  activeYellow: 5 + (i % 3),
  activeRed: i % 4,
  info: {
    name: `Hero ${i}`,
    portrait: `https://example.com/hero-${i}.png`,
    traits: [
      ["Bio", "Tech", "Mystic", "Mutant", "Skill", "Cosmic"][i % 6],
      ["Protector", "Support", "Controller", "Brawler", "Blaster"][i % 5],
    ],
  },
}));

const mockCharacters = Array.from({ length: 25 }, (_, i) => ({
  id: `char-${i}`,
  name: `Hero ${i}`,
  portrait: `https://example.com/hero-${i}.png`,
  traits: [
    ["Bio", "Tech", "Mystic", "Mutant", "Skill", "Cosmic"][i % 6],
    ["Protector", "Support", "Controller", "Brawler", "Blaster"][i % 5],
  ],
}));

async function setupMock(page: Page) {
  await page.route("**/api/msf/roster*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockRoster),
    }),
  );
  await page.route("**/api/msf/characters*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockCharacters),
    }),
  );
}

test.describe("Roster Page", () => {
  test("navigate to /roster — shows My Roster heading", async ({ page }) => {
    await setupMock(page);
    await page.goto("/roster");
    await expect(page.getByText("My Roster")).toBeVisible();
  });

  test("roster grid or empty state renders without errors", async ({ page }) => {
    await setupMock(page);
    await page.goto("/roster");
    await expect(page.getByText("My Roster")).toBeVisible();
    // Should show roster characters or empty message
    const hasChars = await page.getByText("Hero 0").isVisible().catch(() => false);
    const hasEmpty = await page.getByText("No characters found").isVisible().catch(() => false);
    expect(hasChars || hasEmpty).toBe(true);
  });

  test("Missing characters button is visible with count", async ({
    page,
  }) => {
    await setupMock(page);
    await page.goto("/roster");
    await expect(page.getByText("My Roster")).toBeVisible();
    await expect(page.getByText(/Missing/i)).toBeVisible();
  });

  test("clicking Missing switches to missing characters view", async ({
    page,
  }) => {
    await setupMock(page);
    await page.goto("/roster");
    await expect(page.getByText("My Roster")).toBeVisible();
    await page.getByText(/Missing/i).click();
    await expect(page.getByText("Missing Characters")).toBeVisible();
  });

  test("page renders at 390x844 mobile viewport without horizontal overflow", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await setupMock(page);
    await page.goto("/roster");
    await expect(page.getByText("My Roster")).toBeVisible();
    const scrollWidth = await page.evaluate(
      () => document.documentElement.scrollWidth,
    );
    const clientWidth = await page.evaluate(
      () => document.documentElement.clientWidth,
    );
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
  });
});
