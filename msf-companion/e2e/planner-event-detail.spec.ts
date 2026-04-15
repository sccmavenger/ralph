import { test, expect } from "@playwright/test";
import { mockPlannerApiRoutes } from "./fixtures/planner-mock-data";

test.describe("Planner Event Detail", () => {
  test("with no event selected, shows 'Select an event above to see details'", async ({
    page,
  }) => {
    await mockPlannerApiRoutes(page);
    await page.goto("/planner", { waitUntil: "networkidle" });
    await page.waitForSelector('[data-testid="event-detail"]', {
      timeout: 15000,
    });
    const prompt = page.locator("text=Select an event above to see details");
    await expect(prompt).toBeVisible();
  });

  test("click an event card — EventDetail section shows event name and character tiles", async ({
    page,
  }) => {
    await mockPlannerApiRoutes(page);
    await page.goto("/planner", { waitUntil: "networkidle" });
    await page.waitForSelector('[data-testid="event-card"]', {
      timeout: 15000,
    });

    // Click the first event card
    const firstCard = page.locator('[data-testid="event-card"]').first();
    const eventName = await firstCard
      .locator("span")
      .first()
      .textContent();
    await firstCard.click();

    // Wait for detail to render
    await page.waitForTimeout(500);

    // Event detail should show the event name
    const detail = page.locator('[data-testid="event-detail"]');
    const detailText = await detail.textContent();
    expect(detailText).toContain(eventName?.trim());

    // Character tiles should be visible
    const tiles = page.locator('[data-testid="character-tile"]');
    const tileCount = await tiles.count();
    expect(tileCount).toBeGreaterThan(0);
  });

  test("character tiles show portrait images and gear tier text", async ({
    page,
  }) => {
    await mockPlannerApiRoutes(page);
    await page.goto("/planner", { waitUntil: "networkidle" });
    await page.waitForSelector('[data-testid="event-card"]', {
      timeout: 15000,
    });

    await page.locator('[data-testid="event-card"]').first().click();
    await page.waitForTimeout(500);

    const tiles = page.locator('[data-testid="character-tile"]');
    const count = await tiles.count();
    expect(count).toBeGreaterThan(0);

    // Check first few tiles have portrait (img element) or placeholder
    const firstTile = tiles.first();
    const hasImg = (await firstTile.locator("img").count()) > 0;
    const hasPlaceholder =
      (await firstTile.locator("div.rounded-full").count()) > 0;
    expect(hasImg || hasPlaceholder).toBe(true);

    // Check gear tier text (T followed by number)
    const tileText = await firstTile.textContent();
    expect(tileText).toMatch(/T\d/);
  });

  test("locked/unowned characters show LOCKED badge with greyscale styling", async ({
    page,
  }) => {
    await mockPlannerApiRoutes(page);
    await page.goto("/planner", { waitUntil: "networkidle" });
    await page.waitForSelector('[data-testid="event-card"]', {
      timeout: 15000,
    });

    // Click each event card until we find one with a LOCKED character
    const cards = page.locator('[data-testid="event-card"]');
    const count = await cards.count();

    let foundLocked = false;
    for (let i = 0; i < count; i++) {
      await cards.nth(i).click();
      await page.waitForTimeout(500);

      const locked = page.locator(
        '[data-testid="character-tile"] >> text=LOCKED',
      );
      const lockedCount = await locked.count();
      if (lockedCount > 0) {
        foundLocked = true;

        // Check parent tile has greyscale style
        const tile = page
          .locator('[data-testid="character-tile"]')
          .filter({ hasText: "LOCKED" })
          .first();
        const classes = await tile.getAttribute("class");
        expect(classes).toContain("grayscale");
        break;
      }
    }

    // Mock data includes an unowned Phoenix character, so we expect LOCKED
    expect(foundLocked).toBe(true);
  });

  test("Cost to Ready summary section is visible when event is selected", async ({
    page,
  }) => {
    await mockPlannerApiRoutes(page);
    await page.goto("/planner", { waitUntil: "networkidle" });
    await page.waitForSelector('[data-testid="event-card"]', {
      timeout: 15000,
    });

    await page.locator('[data-testid="event-card"]').first().click();
    await page.waitForTimeout(500);

    const costSummary = page.locator('[data-testid="cost-summary"]');
    await expect(costSummary).toBeVisible();
    const text = await costSummary.textContent();
    expect(text).toContain("Cost to Ready");
  });
});
