import { test, expect, type Page } from "@playwright/test";

/* ── Mock Data ─────────────────────────────────────────────────── */

const NOW_SECONDS = Math.floor(Date.now() / 1000);

const mockDailyBriefingFull = {
  freeOffers: [
    {
      id: "offer-1",
      name: "Daily Free Energy",
      description: "Free energy refill",
      expiration: NOW_SECONDS + 7200, // 2 hours from now
      remainingPurchases: 1,
      rewards: [
        { itemName: "Campaign Energy", itemId: "energy-1", icon: "https://example.com/energy.png", quantity: 50 },
      ],
      art: "https://example.com/energy-art.png",
      chain: null,
      webBonusRewards: [],
    },
    {
      id: "offer-2",
      name: "Free Orb Fragments",
      description: "Daily orb fragment pack",
      expiration: NOW_SECONDS + 86400 * 2, // 2 days from now
      remainingPurchases: 1,
      rewards: [
        { itemName: "Premium Orb Fragments", itemId: "orb-frag-1", icon: "https://example.com/orb.png", quantity: 2000 },
      ],
      art: null,
      chain: { id: "chain-daily", index: 3 },
      webBonusRewards: [],
    },
    {
      id: "offer-3",
      name: "Web Exclusive Pack",
      description: "Bonus for web claims",
      expiration: NOW_SECONDS + 86400, // 1 day from now
      remainingPurchases: null,
      rewards: [
        { itemName: "Gold", itemId: "gold-1", icon: "https://example.com/gold.png", quantity: 100000 },
      ],
      art: "https://example.com/web-art.png",
      chain: null,
      webBonusRewards: [
        { itemName: "Strike Points", itemId: "BFYB-CUR", icon: "https://example.com/sp.png", quantity: 2000 },
      ],
    },
  ],
  milestones: [
    {
      id: "ms-1",
      name: "Daily Objectives",
      startTime: NOW_SECONDS - 86400,
      endTime: NOW_SECONDS + 86400,
      milestoneType: "solo",
      brackets: [
        {
          points: 8,
          goal: 40,
          completedTier: 2,
          goalTier: 3,
          claimableTiers: [1, 2],
        },
      ],
      tiers: [
        { tier: 1, rewards: [{ itemName: "T4 Ability Materials", itemId: "t4-mat", icon: "https://example.com/t4.png", quantity: 5 }] },
        { tier: 2, rewards: [{ itemName: "Gold", itemId: "gold-ms", icon: "https://example.com/gold.png", quantity: 50000 }] },
        { tier: 3, rewards: [{ itemName: "Premium Orb", itemId: "prem-orb", icon: "https://example.com/porb.png", quantity: 1 }] },
      ],
      scoring: {
        methods: [{ description: "Open Orbs", points: 40 }],
        cappedScorings: [
          {
            cap: 10000,
            soFar: 5000,
            methods: [{ description: "Open Orbs", points: 40 }],
          },
        ],
      },
    },
    {
      id: "ms-2",
      name: "Alliance Raid Season",
      startTime: NOW_SECONDS - 86400 * 3,
      endTime: NOW_SECONDS + 86400 * 4,
      milestoneType: "alliance",
      brackets: [
        {
          points: 150,
          goal: 200,
          completedTier: 5,
          goalTier: 6,
          claimableTiers: [],
        },
      ],
      tiers: [
        { tier: 6, rewards: [{ itemName: "Raid Credits", itemId: "raid-cred", icon: "https://example.com/raid.png", quantity: 500 }] },
      ],
      scoring: null,
    },
  ],
  summary: {
    freeOfferCount: 3,
    claimableMilestoneCount: 1,
    totalActionItems: 4,
  },
};

const mockDailyBriefingEmpty = {
  freeOffers: [],
  milestones: [],
  summary: { freeOfferCount: 0, claimableMilestoneCount: 0, totalActionItems: 0 },
};

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

async function mockApiRoutes(page: Page, briefingData: typeof mockDailyBriefingFull = mockDailyBriefingFull) {
  await page.route("**/api/msf/farming/targets", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ targets: [], totalCount: 0 }) }),
  );
  await page.route("**/api/msf/war-meta*", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ teams: [] }) }),
  );
  await page.route("**/api/msf/daily-briefing", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(briefingData) }),
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

async function setupPage(page: Page, url: string, briefingData?: typeof mockDailyBriefingFull) {
  await suppressInstallModal(page);
  await mockApiRoutes(page, briefingData);
  await page.goto(url);
  await dismissModals(page);
}

/* ========================================================================== */
/*  TC-001: Widget renders on dashboard with actionable item count            */
/* ========================================================================== */

test.describe("Daily Briefing Widget", () => {
  test("TC-001: widget renders with actionable item count and preview items", async ({ page }) => {
    await setupPage(page, "/dashboard");
    const widget = page.locator('[data-testid="daily-briefing-widget"]');
    await expect(widget).toBeVisible({ timeout: 15000 });
    await expect(widget.getByText("Daily Briefing")).toBeVisible();

    // Summary count in accent color
    await expect(widget.locator(".text-2xl").getByText("4")).toBeVisible();

    // Preview items with icons
    const imgs = widget.locator("img");
    const imgCount = await imgs.count();
    expect(imgCount).toBeGreaterThanOrEqual(1);

    // View All link
    const link = widget.locator('[data-testid="daily-briefing-widget-link"]');
    await expect(link).toBeVisible();
    await expect(link).toHaveText(/View All/);
  });

  /* TC-002: Countdown timer */
  test("TC-002: widget shows countdown timer for expiring free offers", async ({ page }) => {
    await setupPage(page, "/dashboard");
    const widget = page.locator('[data-testid="daily-briefing-widget"]');
    await expect(widget).toBeVisible({ timeout: 15000 });

    // Should show a countdown matching "Xh Ym" or "Xd Yh" pattern
    const widgetText = await widget.textContent();
    expect(widgetText).toMatch(/\d+[hd]\s+\d+[mh]/);
  });

  /* TC-003: Empty state */
  test("TC-003: widget shows empty state when no actionable items", async ({ page }) => {
    await setupPage(page, "/dashboard", mockDailyBriefingEmpty);
    const widget = page.locator('[data-testid="daily-briefing-widget"]');
    await expect(widget).toBeVisible({ timeout: 15000 });
    await expect(widget.getByText(/all caught up/i)).toBeVisible();
  });

  /* TC-004: Skeleton loader */
  test("TC-004: widget shows skeleton loader while data loads", async ({ page }) => {
    await suppressInstallModal(page);
    await page.route("**/api/msf/roster", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: [] }) }),
    );
    await page.route("**/api/msf/characters", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: [] }) }),
    );
    await page.route("**/api/msf/farming/targets", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ targets: [], totalCount: 0 }) }),
    );
    await page.route("**/api/msf/war-meta*", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ teams: [] }) }),
    );
    await page.route("**/api/msf/daily-briefing", async (route) => {
      await new Promise((r) => setTimeout(r, 3000));
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockDailyBriefingFull) });
    });
    await page.goto("/dashboard");
    const skeleton = page.locator('[data-testid="daily-briefing-widget-skeleton"]');
    await expect(skeleton).toBeVisible({ timeout: 5000 });
  });

  /* TC-005: View All navigation */
  test("TC-005: View All → navigates to full page", async ({ page }) => {
    await setupPage(page, "/dashboard");
    const link = page.locator('[data-testid="daily-briefing-widget-link"]');
    await expect(link).toBeVisible({ timeout: 15000 });
    await link.click();
    await page.waitForURL("**/dashboard/daily-briefing");
    expect(page.url()).toContain("/dashboard/daily-briefing");
  });
});

/* ========================================================================== */
/*  Full Page Tests                                                           */
/* ========================================================================== */

test.describe("Daily Briefing Full Page", () => {
  /* TC-006: Free offers with icons, names, quantities, and countdowns */
  test("TC-006: full page shows free offers with icons, names, quantities, and countdowns", async ({ page }) => {
    await setupPage(page, "/dashboard/daily-briefing");

    // Page title
    const title = page.locator('[data-testid="daily-briefing-page-title"]');
    await expect(title).toBeVisible({ timeout: 15000 });
    await expect(title).toHaveText("Daily Briefing");

    // Free Offers heading
    await expect(page.getByText("Free Offers")).toBeVisible();

    // Offer names visible
    await expect(page.getByText("Daily Free Energy")).toBeVisible();
    await expect(page.getByText("Free Orb Fragments")).toBeVisible();

    // Offer cards have reward icons (img elements)
    const imgs = page.locator("section").first().locator("img");
    const imgCount = await imgs.count();
    expect(imgCount).toBeGreaterThanOrEqual(1);

    // Reward quantities visible
    await expect(page.getByText("×50").first()).toBeVisible();
    await expect(page.getByText("×2000").first()).toBeVisible();

    // Countdown text
    const pageText = await page.textContent("body");
    expect(pageText).toMatch(/\d+[hd]\s+\d+[mh]\s+left/);

    // Chain offer shows step badge
    await expect(page.getByText("Step 3")).toBeVisible();

    // Offers sorted by soonest expiration — Daily Free Energy (2h) should come before others
    const offerNames = await page.locator("section").first().locator(".text-sm.font-bold").allTextContents();
    expect(offerNames[0]).toBe("Daily Free Energy");
  });

  /* TC-007: Milestone progress with bars and claimable tier alerts */
  test("TC-007: full page shows milestone progress with bars and claimable tier alerts", async ({ page }) => {
    await setupPage(page, "/dashboard/daily-briefing");

    // Milestone Progress heading
    await expect(page.getByText("Milestone Progress")).toBeVisible({ timeout: 15000 });

    // Claimable milestone badge
    await expect(page.getByText(/2 rewards to claim/)).toBeVisible();

    // Progress bar exists (a filled div inside a track div — check for the rounded-full accent bar)
    const progressTrack = page.locator(".rounded-full.overflow-hidden");
    const trackCount = await progressTrack.count();
    expect(trackCount).toBeGreaterThanOrEqual(1);

    // Points text
    await expect(page.getByText("8 / 40 points")).toBeVisible();

    // Next tier reward icon
    const milestoneSection = page.locator("section").nth(1);
    const milestoneImgs = milestoneSection.locator("img");
    expect(await milestoneImgs.count()).toBeGreaterThanOrEqual(1);

    // Solo/Alliance badges
    await expect(page.getByText("Solo", { exact: true })).toBeVisible();
    await expect(page.getByText("Alliance", { exact: true })).toBeVisible();
  });

  /* TC-008: Empty state for both sections */
  test("TC-008: full page shows empty state when no briefing items", async ({ page }) => {
    await setupPage(page, "/dashboard/daily-briefing", mockDailyBriefingEmpty);

    await expect(page.locator('[data-testid="daily-briefing-page-title"]')).toBeVisible({ timeout: 15000 });
    await expect(page.getByText("No free offers available right now")).toBeVisible();
    await expect(page.getByText("No active milestones")).toBeVisible();
  });

  /* TC-009: Back link returns to dashboard */
  test("TC-009: back link returns to dashboard", async ({ page }) => {
    await setupPage(page, "/dashboard/daily-briefing");
    const backLink = page.locator('[data-testid="daily-briefing-back-link"]');
    await expect(backLink).toBeVisible({ timeout: 15000 });
    await backLink.click();
    await page.waitForURL("**/dashboard");
    expect(page.url()).toContain("/dashboard");
  });

  /* TC-010: No horizontal overflow on 375px viewport */
  test("TC-010: full page has no horizontal overflow on 375px viewport", async ({ page }) => {
    await suppressInstallModal(page);
    await mockApiRoutes(page);
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/dashboard/daily-briefing");
    await dismissModals(page);
    await expect(page.locator('[data-testid="daily-briefing-page-title"]')).toBeVisible({ timeout: 15000 });

    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 2);
  });

  /* TC-011: Partial API failure */
  test("TC-011: API route returns partial data when one upstream call fails", async ({ page }) => {
    await suppressInstallModal(page);
    await page.route("**/api/msf/daily-briefing", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          freeOffers: mockDailyBriefingFull.freeOffers,
          milestones: [],
          milestonesError: "Events API returned 500",
          summary: { freeOfferCount: 3, claimableMilestoneCount: 0, totalActionItems: 3 },
        }),
      }),
    );
    await page.goto("/dashboard/daily-briefing");
    await dismissModals(page);

    // Free offers should still render
    await expect(page.getByText("Daily Free Energy")).toBeVisible({ timeout: 15000 });
    // Milestones section shows empty (or error could be shown)
    await expect(page.getByText("Milestone Progress")).toBeVisible();
  });

  /* TC-013: Countdown timers tick down in real-time */
  test("TC-013: countdown timers tick down in real-time", async ({ page }) => {
    await suppressInstallModal(page);

    // Use a fixed expiration that we can track
    const fixedExpiration = Math.floor(Date.now() / 1000) + 7200; // exactly 2h from now
    const briefingWithFixedTime = {
      ...mockDailyBriefingFull,
      freeOffers: [
        {
          ...mockDailyBriefingFull.freeOffers[0],
          expiration: fixedExpiration,
        },
      ],
    };

    await mockApiRoutes(page, briefingWithFixedTime);

    // Install clock for time manipulation
    await page.clock.install({ time: new Date() });
    await page.goto("/dashboard/daily-briefing");
    await dismissModals(page);

    await expect(page.locator('[data-testid="daily-briefing-page-title"]')).toBeVisible({ timeout: 15000 });

    // Get initial countdown text
    const countdownLocator = page.getByText(/\d+h \d+m left/);
    await expect(countdownLocator).toBeVisible({ timeout: 5000 });
    const initialText = await countdownLocator.textContent();

    // Advance time by 61 seconds to trigger the setInterval
    await page.clock.fastForward(61000);

    // Wait a moment for React to re-render
    await page.waitForTimeout(500);

    // The countdown should have changed (decremented by ~1 minute)
    const updatedText = await page.getByText(/\d+h \d+m left/).textContent();
    expect(updatedText).not.toBe(initialText);
  });

  /* TC-014a: Web bonus badge */
  test("TC-014a: full page shows web bonus badge for offers with web-exclusive rewards", async ({ page }) => {
    await setupPage(page, "/dashboard/daily-briefing");

    // Web bonus badge visible on the third offer
    await expect(page.getByText("🌐 Web Bonus!")).toBeVisible({ timeout: 15000 });

    // Bonus reward name visible
    await expect(page.getByText("Strike Points")).toBeVisible();
  });

  /* TC-014b: Scoring cap progress */
  test("TC-014b: full page shows scoring cap progress for capped milestones", async ({ page }) => {
    await setupPage(page, "/dashboard/daily-briefing");

    // Daily cap progress text
    await expect(page.getByText("5,000 / 10,000")).toBeVisible({ timeout: 15000 });

    // Scoring method description
    await expect(page.getByText("Open Orbs").first()).toBeVisible();
  });
});
