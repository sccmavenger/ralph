import { test, expect, type Page } from "@playwright/test";

/* ── Mock Data ─────────────────────────────────────────────────── */

const futureExpiration = Math.floor(Date.now() / 1000) + 86400; // 24h from now

const mockOffers = {
  data: [
    {
      id: "offer_1",
      name: "Wolverine Shard Bundle",
      description: "Get Wolverine shards and gear materials",
      expiration: futureExpiration,
      remainingPurchases: 3,
      choices: [
        {
          id: 1,
          rewards: [
            { itemName: "Wolverine Shards", itemId: "shard_wolverine", quantity: 50 },
            { itemName: "Superior Basic Catalyst", itemId: "cat_basic_sup", quantity: 10 },
          ],
          cost: { itemName: "Power Cores", itemId: "power_cores", quantity: 450 },
        },
      ],
      valueScore: "High Value",
      valueExplanation: "Contains 2 item(s) matching active farming targets. Contains 1 item(s) matching unfilled roster gaps.",
    },
    {
      id: "offer_2",
      name: "Gamma Raid Supplies",
      description: "Raid energy and healing supplies for Gamma raids",
      expiration: futureExpiration + 3600,
      remainingPurchases: 1,
      choices: [
        {
          id: 1,
          rewards: [
            { itemName: "Raid Energy", itemId: "raid_energy", quantity: 120 },
            { itemName: "Raid Health Pack", itemId: "raid_hp", quantity: 5 },
          ],
          cost: { itemName: "Gold", itemId: "gold", quantity: 150000 },
        },
      ],
      valueScore: "Medium Value",
      valueExplanation: "Moderate cost efficiency: 0.8 items per cost unit.",
    },
    {
      id: "offer_3",
      name: "Basic Training Module",
      description: "Basic training materials for new characters",
      expiration: futureExpiration + 7200,
      remainingPurchases: null,
      choices: [
        {
          id: 1,
          rewards: [
            { itemName: "Training Module", itemId: "train_basic", quantity: 100 },
          ],
          cost: { itemName: "Gold", itemId: "gold", quantity: 50000 },
        },
      ],
      valueScore: "Low Value",
      valueExplanation: "No items in this offer match your current roster needs.",
    },
    {
      id: "offer_4",
      name: "Storm Power-Up Pack",
      description: "Power up Storm with shards, gear, and ability mats",
      expiration: null,
      remainingPurchases: 2,
      choices: [
        {
          id: 1,
          rewards: [
            { itemName: "Storm Shards", itemId: "shard_storm", quantity: 30 },
            { itemName: "Superior Miasma", itemId: "gear_miasma", quantity: 5 },
          ],
          cost: { itemName: "Power Cores", itemId: "power_cores", quantity: 675 },
        },
      ],
      valueScore: "High Value",
      valueExplanation: "Contains 1 item(s) matching unfilled roster gaps. High cost efficiency: 7.0 items per cost unit.",
    },
  ],
};

const emptyOffers = { data: [] };

/* ── Helpers ────────────────────────────────────────────────────── */

async function suppressInstallModal(page: Page) {
  await page.addInitScript(() => {
    Object.defineProperty(window.navigator, "standalone", { value: true });
    const origMatchMedia = window.matchMedia.bind(window);
    window.matchMedia = (query: string) => {
      if (query === "(display-mode: standalone)") {
        return { matches: true, media: query, addListener: () => {}, removeListener: () => {}, addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => true, onchange: null } as MediaQueryList;
      }
      return origMatchMedia(query);
    };
  });
}

async function mockDashboardApis(page: Page) {
  await page.route("**/api/msf/farming/targets", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ targets: [], totalCount: 0 }) }),
  );
  await page.route("**/api/msf/war-meta*", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ teams: [] }) }),
  );
}

async function mockOffersApi(page: Page, data = mockOffers) {
  await page.route("**/api/msf/offers", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(data) }),
  );
}

async function dismissModals(page: Page) {
  try {
    const skip = page.getByText("Skip for now");
    await skip.waitFor({ state: "visible", timeout: 5000 });
    await skip.click();
    await skip.waitFor({ state: "hidden", timeout: 2000 }).catch(() => {});
  } catch { /* not present */ }
  try {
    const skipTour = page.getByText("Skip Tour");
    await skipTour.waitFor({ state: "visible", timeout: 2000 });
    await skipTour.click();
    await skipTour.waitFor({ state: "hidden", timeout: 2000 }).catch(() => {});
  } catch { /* not present */ }
}

async function setupDashboard(page: Page) {
  await suppressInstallModal(page);
  await mockDashboardApis(page);
  await mockOffersApi(page);
  await page.goto("/dashboard");
  await dismissModals(page);
}

async function setupOffersPage(page: Page, data = mockOffers) {
  await suppressInstallModal(page);
  await mockOffersApi(page, data);
  await page.goto("/dashboard/offers");
  await dismissModals(page);
}

/* ========================================================================== */
/*  OFFERS WIDGET — Dashboard                                                 */
/* ========================================================================== */

test.describe("Offers Widget", () => {
  test("widget renders on dashboard with offer names, value badges, and explanations", async ({ page }) => {
    await setupDashboard(page);
    const widget = page.locator('[data-testid="offers-widget"]');
    await expect(widget).toBeVisible({ timeout: 15000 });

    // Title visible
    await expect(widget.getByText("Active Offers")).toBeVisible();

    // Shows up to 3 offers
    const offerNames = ["Wolverine Shard Bundle", "Gamma Raid Supplies", "Basic Training Module"];
    for (const name of offerNames) {
      await expect(widget.getByText(name)).toBeVisible();
    }

    // Value badges visible
    await expect(widget.getByText("High Value").first()).toBeVisible();
    await expect(widget.getByText("Medium Value")).toBeVisible();
    await expect(widget.getByText("Low Value")).toBeVisible();
  });

  test("widget shows green explanation for matched offers and gray text for unmatched", async ({ page }) => {
    await setupDashboard(page);
    const widget = page.locator('[data-testid="offers-widget"]');
    await expect(widget).toBeVisible({ timeout: 15000 });

    // High Value offer should have green explanation with 💡
    await expect(widget.getByText(/matching active farming targets/)).toBeVisible();

    // Low Value offer should have "Not matched" text
    await expect(widget.getByText("Not matched to your current goals")).toBeVisible();
  });

  test("widget shows skeleton loader while loading", async ({ page }) => {
    await suppressInstallModal(page);
    await mockDashboardApis(page);
    await page.route("**/api/msf/offers", async (route) => {
      await new Promise((r) => setTimeout(r, 3000));
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockOffers) });
    });
    await page.goto("/dashboard");
    const skeleton = page.locator('[data-testid="offers-widget-skeleton"]');
    await expect(skeleton).toBeVisible({ timeout: 5000 });
  });

  test("widget has 'View All →' link to /dashboard/offers", async ({ page }) => {
    await setupDashboard(page);
    const link = page.locator('[data-testid="offers-widget-link"]');
    await expect(link).toBeVisible({ timeout: 15000 });
    await expect(link).toHaveText(/View All/);
    await link.click();
    await page.waitForURL("**/dashboard/offers");
    expect(page.url()).toContain("/dashboard/offers");
  });

  test("widget shows empty state when no offers", async ({ page }) => {
    await suppressInstallModal(page);
    await mockDashboardApis(page);
    await mockOffersApi(page, emptyOffers);
    await page.goto("/dashboard");
    await dismissModals(page);
    const widget = page.locator('[data-testid="offers-widget"]');
    await expect(widget).toBeVisible({ timeout: 15000 });
    await expect(widget.getByText("No active offers")).toBeVisible();
  });
});

/* ========================================================================== */
/*  OFFERS FULL PAGE                                                          */
/* ========================================================================== */

test.describe("Offers Full Page", () => {
  test("page loads with all offer cards showing name, value badge, description, cost, and rewards", async ({ page }) => {
    await setupOffersPage(page);

    // Title
    await expect(page.getByRole("heading", { name: "Active Offers" })).toBeVisible({ timeout: 15000 });
    await expect(page.getByText("4 offers available")).toBeVisible();

    // All 4 offer cards present
    for (const offer of mockOffers.data) {
      const card = page.locator(`[data-testid="offer-card-${offer.id}"]`);
      await expect(card).toBeVisible();

      // Offer name
      await expect(card.getByText(offer.name)).toBeVisible();

      // Value badge
      await expect(card.getByText(offer.valueScore)).toBeVisible();

      // Reward items visible (check count of reward rows)
      const totalRewards = offer.choices.reduce((sum, c) => sum + c.rewards.length, 0);
      const rewardElements = card.locator(".space-y-1 .flex.justify-between");
      expect(await rewardElements.count()).toBe(totalRewards);
    }
  });

  test("value explanations are visible without clicking — green for matched, gray for unmatched", async ({ page }) => {
    await setupOffersPage(page);

    // Wait for page to load
    await expect(page.getByText("Active Offers")).toBeVisible({ timeout: 15000 });

    // High Value offer shows green explanation
    const highValueCard = page.locator('[data-testid="offer-card-offer_1"]');
    const explanation = highValueCard.locator('[data-testid="offer-explanation"]');
    await expect(explanation).toBeVisible();
    await expect(explanation).toContainText("matching active farming targets");
    await expect(explanation).toContainText("matching unfilled roster gaps");

    // Low Value offer shows gray "No items" text
    const lowValueCard = page.locator('[data-testid="offer-card-offer_3"]');
    const lowExplanation = lowValueCard.locator('[data-testid="offer-explanation"]');
    await expect(lowExplanation).toBeVisible();
    await expect(lowExplanation).toContainText("No items in this offer match your current roster needs");
  });

  test("search filters offers by name", async ({ page }) => {
    await setupOffersPage(page);
    await expect(page.getByText("Active Offers")).toBeVisible({ timeout: 15000 });

    const search = page.locator('[data-testid="offers-search"]');
    await expect(search).toBeVisible();

    // Search for "Wolverine"
    await search.fill("Wolverine");

    // Only Wolverine card should be visible
    await expect(page.locator('[data-testid="offer-card-offer_1"]')).toBeVisible();
    await expect(page.locator('[data-testid="offer-card-offer_2"]')).not.toBeVisible();
    await expect(page.locator('[data-testid="offer-card-offer_3"]')).not.toBeVisible();
    await expect(page.locator('[data-testid="offer-card-offer_4"]')).not.toBeVisible();
  });

  test("search filters offers by reward item name", async ({ page }) => {
    await setupOffersPage(page);
    await expect(page.getByText("Active Offers")).toBeVisible({ timeout: 15000 });

    const search = page.locator('[data-testid="offers-search"]');

    // Search for a specific reward name
    await search.fill("Raid Energy");

    // Only Gamma Raid Supplies should appear
    await expect(page.locator('[data-testid="offer-card-offer_2"]')).toBeVisible();
    await expect(page.locator('[data-testid="offer-card-offer_1"]')).not.toBeVisible();
    await expect(page.locator('[data-testid="offer-card-offer_3"]')).not.toBeVisible();
  });

  test("search filters offers by description text", async ({ page }) => {
    await setupOffersPage(page);
    await expect(page.getByText("Active Offers")).toBeVisible({ timeout: 15000 });

    const search = page.locator('[data-testid="offers-search"]');

    // Search for description text
    await search.fill("Gamma raids");

    await expect(page.locator('[data-testid="offer-card-offer_2"]')).toBeVisible();
    await expect(page.locator('[data-testid="offer-card-offer_1"]')).not.toBeVisible();
  });

  test("clearing search shows all offers again", async ({ page }) => {
    await setupOffersPage(page);
    await expect(page.getByText("Active Offers")).toBeVisible({ timeout: 15000 });

    const search = page.locator('[data-testid="offers-search"]');
    await search.fill("Wolverine");

    // Only 1 visible
    await expect(page.locator('[data-testid="offer-card-offer_2"]')).not.toBeVisible();

    // Clear search
    await search.fill("");

    // All 4 visible again
    for (const offer of mockOffers.data) {
      await expect(page.locator(`[data-testid="offer-card-${offer.id}"]`)).toBeVisible();
    }
  });

  test("search with no matches shows no cards", async ({ page }) => {
    await setupOffersPage(page);
    await expect(page.getByText("Active Offers")).toBeVisible({ timeout: 15000 });

    const search = page.locator('[data-testid="offers-search"]');
    await search.fill("xyznonexistent");

    // No offer cards visible
    for (const offer of mockOffers.data) {
      await expect(page.locator(`[data-testid="offer-card-${offer.id}"]`)).not.toBeVisible();
    }
  });

  test("page shows empty state when no offers available", async ({ page }) => {
    await setupOffersPage(page, emptyOffers);
    await expect(page.getByRole("heading", { name: "Active Offers" })).toBeVisible({ timeout: 15000 });
    await expect(page.getByText("No active offers right now")).toBeVisible();
  });

  test("page shows skeleton while loading", async ({ page }) => {
    await suppressInstallModal(page);
    await page.route("**/api/msf/offers", async (route) => {
      await new Promise((r) => setTimeout(r, 3000));
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockOffers) });
    });
    await page.goto("/dashboard/offers");
    const skeleton = page.locator('[data-testid="offers-page-skeleton"]');
    await expect(skeleton).toBeVisible({ timeout: 5000 });
  });

  test("back link returns to /dashboard", async ({ page }) => {
    await setupOffersPage(page);
    const backLink = page.getByText("← Back to Dashboard");
    await expect(backLink).toBeVisible({ timeout: 15000 });
    await backLink.click();
    await page.waitForURL("**/dashboard");
    expect(page.url()).toContain("/dashboard");
  });

  test("no horizontal overflow on 375px viewport", async ({ page }) => {
    await suppressInstallModal(page);
    await mockOffersApi(page);
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/dashboard/offers");
    await dismissModals(page);
    await expect(page.getByText("Active Offers")).toBeVisible({ timeout: 15000 });
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 2);
  });
});
