import { test, expect } from "@playwright/test";
import { mockPlannerApiRoutes } from "./fixtures/planner-mock-data";

test.describe("Planner Dashboard Summary Widget", () => {
  test("navigate to /dashboard — PlannerSummary widget is visible below the existing dashboard overview", async ({
    page,
  }) => {
    await mockPlannerApiRoutes(page);
    await page.goto("/dashboard", { waitUntil: "networkidle" });
    await page.waitForSelector('[data-testid="planner-summary"]', {
      timeout: 15000,
    });
    const widget = page.locator('[data-testid="planner-summary"]');
    await expect(widget).toBeVisible();
  });

  test("widget shows upcoming events count, overall readiness percentage, and up to 3 priority character entries", async ({
    page,
  }) => {
    await mockPlannerApiRoutes(page);
    await page.goto("/dashboard", { waitUntil: "networkidle" });
    await page.waitForSelector('[data-testid="planner-summary"]', {
      timeout: 15000,
    });

    // Events count
    const eventCount = page.locator(
      '[data-testid="planner-summary-event-count"]',
    );
    await expect(eventCount).toBeVisible();
    const eventText = await eventCount.textContent();
    expect(Number(eventText)).toBeGreaterThan(0);

    // Readiness percentage
    const readiness = page.locator(
      '[data-testid="planner-summary-readiness"]',
    );
    await expect(readiness).toBeVisible();
    const readinessText = await readiness.textContent();
    expect(readinessText).toMatch(/\d+%/);

    // Up to 3 priority entries
    const entries = page.locator(
      '[data-testid="planner-summary-priority-entry"]',
    );
    const count = await entries.count();
    expect(count).toBeGreaterThan(0);
    expect(count).toBeLessThanOrEqual(3);
  });

  test("'View All →' link is visible and navigates to /planner when clicked", async ({
    page,
  }) => {
    await mockPlannerApiRoutes(page);
    await page.goto("/dashboard", { waitUntil: "networkidle" });
    await page.waitForSelector('[data-testid="planner-summary"]', {
      timeout: 15000,
    });

    const link = page.locator('[data-testid="planner-summary-link"]');
    await expect(link).toBeVisible();
    await expect(link).toHaveText("View All →");

    // Click and verify navigation
    await link.click();
    await page.waitForURL("**/planner", { timeout: 10000 });
    expect(page.url()).toContain("/planner");
  });

  test("each priority character in the widget shows a portrait thumbnail and colored dot indicator", async ({
    page,
  }) => {
    await mockPlannerApiRoutes(page);
    await page.goto("/dashboard", { waitUntil: "networkidle" });
    await page.waitForSelector('[data-testid="planner-summary"]', {
      timeout: 15000,
    });

    const entries = page.locator(
      '[data-testid="planner-summary-priority-entry"]',
    );
    const count = await entries.count();
    expect(count).toBeGreaterThan(0);

    for (let i = 0; i < count; i++) {
      const entry = entries.nth(i);

      // Has a portrait thumbnail
      const portrait = entry.locator('[data-testid="priority-portrait"]');
      await expect(portrait).toBeVisible();

      // Has a colored dot indicator
      const dot = entry.locator('[data-testid="priority-dot"]');
      await expect(dot).toBeVisible();
    }
  });

  test("widget doesn't cause the dashboard to crash or show error boundaries", async ({
    page,
  }) => {
    await mockPlannerApiRoutes(page);
    await page.goto("/dashboard", { waitUntil: "networkidle" });

    // The dashboard should render without errors
    // Check that the welcome header is still visible (proves no crash)
    const welcome = page.locator("text=Welcome back");
    await expect(welcome).toBeVisible({ timeout: 15000 });

    // Check PlannerSummary widget loaded (even if no data, skeleton or empty state should render)
    const widget = page.locator('[data-testid="planner-summary"]');
    await expect(widget).toBeVisible({ timeout: 15000 });

    // No error boundaries or unhandled React errors
    const errorBoundary = page.locator("text=Something went wrong");
    await expect(errorBoundary).not.toBeVisible();
  });
});
