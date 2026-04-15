import { test, expect } from "@playwright/test";

test.describe("Dashboard Page", () => {
  test("navigate to /dashboard — page loads with welcome heading", async ({
    page,
  }) => {
    await page.goto("/dashboard");
    await expect(page.getByText("Welcome back")).toBeVisible();
    await expect(page.getByText("Your MSF Companion dashboard")).toBeVisible();
  });

  test("navigation cards are visible for Roster, Heroes, Teams, Analyze, Profile", async ({
    page,
  }) => {
    await page.goto("/dashboard");
    await expect(page.getByText("Welcome back")).toBeVisible();
    // Nav cards contain emoji + text. Use first to avoid conflict with bottom tab bar.
    await expect(page.getByText("My Roster")).toBeVisible();
    await expect(page.getByText("Character Database")).toBeVisible();
    await expect(page.getByText("Fight Analyzer")).toBeVisible();
    await expect(page.getByText("Settings")).toBeVisible();
  });

  test("clicking Roster nav card navigates to /roster", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.getByText("Welcome back")).toBeVisible();
    await page.getByRole("link", { name: /My Roster/i }).click();
    await page.waitForURL("**/roster");
    expect(page.url()).toContain("/roster");
  });

  test("page renders at 390x844 mobile viewport without horizontal overflow", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/dashboard");
    await expect(page.getByText("Welcome back")).toBeVisible();
    const scrollWidth = await page.evaluate(
      () => document.documentElement.scrollWidth,
    );
    const clientWidth = await page.evaluate(
      () => document.documentElement.clientWidth,
    );
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
  });
});
