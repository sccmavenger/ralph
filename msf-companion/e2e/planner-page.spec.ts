import { test, expect } from "@playwright/test";
import { mockPlannerApiRoutes } from "./fixtures/planner-mock-data";

test.describe("Planner Page", () => {
  test("navigate to /planner — page loads and shows 'Investment Planner' heading", async ({
    page,
  }) => {
    await mockPlannerApiRoutes(page);
    await page.goto("/planner", { waitUntil: "networkidle" });
    const heading = page.locator("h2", { hasText: "Investment Planner" });
    await expect(heading).toBeVisible();
  });

  test("Planner link is visible in the bottom navigation bar", async ({
    page,
  }) => {
    await mockPlannerApiRoutes(page);
    await page.goto("/planner", { waitUntil: "networkidle" });
    const plannerLink = page.locator("nav a", { hasText: "Planner" });
    await expect(plannerLink).toBeVisible();
  });

  test("Page loads without JS errors", async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));

    await mockPlannerApiRoutes(page);
    await page.goto("/planner", { waitUntil: "networkidle" });

    // Ensure no JS errors occurred
    expect(errors.length).toBe(0);
  });

  test("'Last updated' timestamp text is visible on the page", async ({
    page,
  }) => {
    await mockPlannerApiRoutes(page);
    await page.goto("/planner", { waitUntil: "networkidle" });
    // Wait for data to load
    await page.waitForSelector('[data-testid="last-updated"]', {
      timeout: 15000,
    });
    const lastUpdated = page.locator('[data-testid="last-updated"]');
    await expect(lastUpdated).toBeVisible();
    const text = await lastUpdated.textContent();
    expect(text).toContain("Last updated:");
  });

  test("page renders correctly at 390x844 mobile viewport (no horizontal overflow)", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await mockPlannerApiRoutes(page);
    await page.goto("/planner", { waitUntil: "networkidle" });

    // Check no horizontal overflow
    const scrollWidth = await page.evaluate(
      () => document.documentElement.scrollWidth,
    );
    const clientWidth = await page.evaluate(
      () => document.documentElement.clientWidth,
    );
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1); // Allow 1px tolerance
  });
});
