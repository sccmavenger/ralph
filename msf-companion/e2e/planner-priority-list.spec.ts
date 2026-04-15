import { test, expect } from "@playwright/test";
import { mockPlannerApiRoutes } from "./fixtures/planner-mock-data";

test.describe("Planner Priority List", () => {
  test("navigate to /planner — PriorityList section renders with 'Top Investments' heading", async ({
    page,
  }) => {
    await mockPlannerApiRoutes(page);
    await page.goto("/planner", { waitUntil: "networkidle" });
    await page.waitForSelector('[data-testid="priority-list"]', {
      timeout: 15000,
    });
    const heading = page.locator("h3", { hasText: "Top Investments" });
    await expect(heading).toBeVisible();
  });

  test("each priority entry shows rank number, character name, and at least one event tag/pill", async ({
    page,
  }) => {
    await mockPlannerApiRoutes(page);
    await page.goto("/planner", { waitUntil: "networkidle" });
    await page.waitForSelector('[data-testid="priority-entry"]', {
      timeout: 15000,
    });

    const entries = page.locator('[data-testid="priority-entry"]');
    const count = await entries.count();
    expect(count).toBeGreaterThan(0);

    for (let i = 0; i < count; i++) {
      const entry = entries.nth(i);

      // Rank number is visible
      const rankText = await entry.locator("span").first().textContent();
      expect(Number(rankText?.trim())).toBeGreaterThan(0);

      // Character name is visible (the first <p> with truncate)
      const name = entry.locator("p.truncate");
      await expect(name).toBeVisible();
      const nameText = await name.textContent();
      expect(nameText?.trim().length).toBeGreaterThan(0);

      // At least one event tag/pill
      const tags = entry.locator('[data-testid="event-tag"]');
      const tagCount = await tags.count();
      expect(tagCount).toBeGreaterThanOrEqual(1);
    }
  });

  test("priority entries show gear tier progression text (e.g. 'T12 → T16' format)", async ({
    page,
  }) => {
    await mockPlannerApiRoutes(page);
    await page.goto("/planner", { waitUntil: "networkidle" });
    await page.waitForSelector('[data-testid="priority-entry"]', {
      timeout: 15000,
    });

    const gearTexts = page.locator('[data-testid="gear-progression"]');
    const count = await gearTexts.count();
    expect(count).toBeGreaterThan(0);

    for (let i = 0; i < count; i++) {
      const text = await gearTexts.nth(i).textContent();
      // Should match pattern like "T14 → T16"
      expect(text).toMatch(/T\d+\s*→\s*T\d+/);
    }
  });

  test("entries are visually ordered by rank (rank 1 appears before rank 2 in the DOM)", async ({
    page,
  }) => {
    await mockPlannerApiRoutes(page);
    await page.goto("/planner", { waitUntil: "networkidle" });
    await page.waitForSelector('[data-testid="priority-entry"]', {
      timeout: 15000,
    });

    const entries = page.locator('[data-testid="priority-entry"]');
    const count = await entries.count();
    expect(count).toBeGreaterThanOrEqual(2);

    // Collect ranks in DOM order
    const ranks: number[] = [];
    for (let i = 0; i < count; i++) {
      const rankText = await entries
        .nth(i)
        .locator("span")
        .first()
        .textContent();
      ranks.push(Number(rankText?.trim()));
    }

    // Verify ascending rank order (1, 2, 3...)
    for (let i = 1; i < ranks.length; i++) {
      expect(ranks[i]).toBeGreaterThan(ranks[i - 1]);
    }
  });
});
