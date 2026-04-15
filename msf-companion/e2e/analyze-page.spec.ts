import { test, expect } from "@playwright/test";

test.describe("Analyze Page", () => {
  test("navigate to /analyze — shows Fight Analyzer heading", async ({
    page,
  }) => {
    await page.goto("/analyze");
    await expect(page.getByText("Fight Analyzer")).toBeVisible();
    await expect(
      page.getByText("Select a game mode and node"),
    ).toBeVisible();
  });

  test("Dark Dimension mode card is visible and clickable", async ({
    page,
  }) => {
    await page.goto("/analyze");
    await expect(page.getByText("Fight Analyzer")).toBeVisible();
    await expect(page.getByText("Dark Dimension")).toBeVisible();
    await page.getByText("Dark Dimension").click();
    await page.waitForURL("**/analyze/dd-planner");
    expect(page.url()).toContain("/analyze/dd-planner");
  });

  test("Raids and Campaigns mode cards are visible but disabled", async ({
    page,
  }) => {
    await page.goto("/analyze");
    await expect(page.getByText("Fight Analyzer")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Raids" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Campaigns" })).toBeVisible();
    // They should have reduced opacity (coming soon)
    const raidsCard = page.getByRole("heading", { name: "Raids" }).locator("..");
    const opacity = await raidsCard.evaluate(
      (el) => window.getComputedStyle(el).opacity,
    );
    expect(parseFloat(opacity)).toBeLessThan(1);
  });

  test("'More modes coming soon' text is visible", async ({ page }) => {
    await page.goto("/analyze");
    await expect(page.getByText("More modes coming soon")).toBeVisible();
  });

  test("page renders at 390x844 mobile viewport without horizontal overflow", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/analyze");
    await expect(page.getByText("Fight Analyzer")).toBeVisible();
    const scrollWidth = await page.evaluate(
      () => document.documentElement.scrollWidth,
    );
    const clientWidth = await page.evaluate(
      () => document.documentElement.clientWidth,
    );
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
  });
});
