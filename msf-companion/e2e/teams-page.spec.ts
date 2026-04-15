import { test, expect } from "@playwright/test";

test.describe("Teams Page", () => {
  test("navigate to /teams — shows Team Builder heading", async ({ page }) => {
    await page.goto("/teams");
    await expect(page.getByRole("heading", { name: "Team Builder" })).toBeVisible();
  });

  test("Team count shows 0/5 initially", async ({ page }) => {
    await page.goto("/teams");
    await expect(page.getByRole("heading", { name: "Team Builder" })).toBeVisible();
    await expect(page.getByTestId("team-count")).toContainText("Team (0/5)");
  });

  test("mode selector is visible with All Modes default", async ({
    page,
  }) => {
    await page.goto("/teams");
    await expect(page.getByTestId("mode-selector")).toBeVisible();
    await expect(page.getByTestId("mode-chip-all")).toBeVisible();
  });

  test("page renders at 390x844 mobile viewport without horizontal overflow", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/teams");
    await expect(page.getByRole("heading", { name: "Team Builder" })).toBeVisible();
    const scrollWidth = await page.evaluate(
      () => document.documentElement.scrollWidth,
    );
    const clientWidth = await page.evaluate(
      () => document.documentElement.clientWidth,
    );
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
  });
});
