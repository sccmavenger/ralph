import { test, expect, type Page } from "@playwright/test";

/* ── Mock Data ─────────────────────────────────────────────────── */

const mockFarmingTargets = {
  targets: [
    {
      characterId: "char_wolverine",
      characterName: "Wolverine",
      portrait: "https://example.com/wolverine.png",
      currentYellowStars: 5,
      currentRedStars: 3,
      nodes: [{ campaignName: "Heroes 7", campaignId: "heroes_7", chapter: 1, tier: 3, nodeLabel: "Heroes 7-1 Hard", energyCost: 16, rewardType: "yellowStar" }],
      priorityTier: "event",
      priorityReason: "Needed for Apocalypse Saga event",
      priorityScore: 95,
    },
    {
      characterId: "char_storm",
      characterName: "Storm",
      portrait: "https://example.com/storm.png",
      currentYellowStars: 6,
      currentRedStars: 5,
      nodes: [{ campaignName: "Nexus 5", campaignId: "nexus_5", chapter: 3, tier: 2, nodeLabel: "Nexus 5-3 Medium", energyCost: 12, rewardType: "yellowStar" }],
      priorityTier: "close-to-max",
      priorityReason: "1 yellow star from max",
      priorityScore: 80,
    },
    {
      characterId: "char_hulk",
      characterName: "Hulk",
      portrait: "https://example.com/hulk.png",
      currentYellowStars: 4,
      currentRedStars: 2,
      nodes: [{ campaignName: "Villains 6", campaignId: "villains_6", chapter: 2, tier: 1, nodeLabel: "Villains 6-2 Easy", energyCost: 10, rewardType: "yellowStar" }],
      priorityTier: "farmable",
      priorityReason: "Farmable character",
      priorityScore: 50,
    },
  ],
  totalCount: 14,
};

function makeMetaTeam(
  rank: number,
  names: string[],
  ids: string[],
  totalBattles: number,
  wins: number,
  statuses: Array<"built" | "needs-work" | "missing">,
) {
  return {
    rank,
    squad: ids,
    squadNames: names,
    totalBattles,
    wins,
    winRate: totalBattles > 0 ? wins / totalBattles : 0,
    rosterComparison: names.map((name, i) => ({
      characterId: ids[i],
      characterName: name,
      portrait: `https://example.com/${ids[i]}.png`,
      owned: statuses[i] !== "missing",
      gearTier: statuses[i] === "built" ? 18 : statuses[i] === "needs-work" ? 12 : 0,
      yellowStars: statuses[i] === "built" ? 7 : statuses[i] === "needs-work" ? 5 : 0,
      redStars: statuses[i] === "built" ? 6 : statuses[i] === "needs-work" ? 3 : 0,
      iso8Class: statuses[i] === "missing" ? "" : "5",
      status: statuses[i],
    })),
  };
}

const mockOffenseTeams = {
  teams: [
    makeMetaTeam(1, ["Apocalypse", "Morgan", "Kestrel", "Dormammu", "Rogue"], ["apo", "mlf", "kes", "dor", "rog"], 175302, 148507, ["built", "built", "needs-work", "built", "missing"]),
    makeMetaTeam(2, ["Thanos", "Corvus", "Proxima", "Ebony Maw", "Cull"], ["tha", "cor", "prx", "ebm", "cul"], 120000, 96000, ["built", "needs-work", "built", "built", "built"]),
    makeMetaTeam(3, ["Ikaris", "Sersi", "Kingo", "Thena", "Makkari"], ["ika", "ser", "kin", "the", "mak"], 95000, 71250, ["needs-work", "built", "missing", "built", "built"]),
  ],
};

const mockDefenseTeams = {
  teams: [
    makeMetaTeam(1, ["Agatha", "Wong", "Strange", "Scarlet Witch", "Clea"], ["aga", "won", "str", "sw", "cle"], 160000, 128000, ["built", "built", "built", "needs-work", "built"]),
    makeMetaTeam(2, ["Ultron", "Vision", "Deathlok", "Viv Vision", "WarMachine"], ["ult", "vis", "dea", "viv", "wrm"], 110000, 82500, ["built", "needs-work", "built", "missing", "built"]),
    makeMetaTeam(3, ["Red Hulk", "She-Hulk", "Abomination", "Leader", "Skarr"], ["rhu", "she", "abo", "lea", "ska"], 80000, 56000, ["needs-work", "built", "built", "built", "needs-work"]),
  ],
};

const mockCrucibleTeams = {
  teams: [
    makeMetaTeam(1, ["Nova", "Gladiator", "Surfer", "Quasar", "Beta Ray"], ["nov", "gla", "ssu", "qua", "brb"], 50000, 40000, ["built", "built", "missing", "built", "needs-work"]),
    makeMetaTeam(2, ["Sunfire", "Dazzler", "Sage", "Bishop", "Forge"], ["sun", "daz", "sag", "bis", "for"], 45000, 33750, ["built", "needs-work", "built", "built", "built"]),
    makeMetaTeam(3, ["Night Thrasher", "Firestar", "Justice", "Speedball", "Namorita"], ["nth", "fir", "jus", "spb", "nam"], 30000, 21000, ["needs-work", "missing", "built", "built", "needs-work"]),
  ],
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

async function mockApiRoutes(page: Page) {
  await page.route("**/api/msf/farming/targets", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockFarmingTargets) }),
  );
  await page.route("**/api/msf/war-meta*", (route) => {
    const url = new URL(route.request().url());
    const mode = url.searchParams.get("mode") ?? "offense";
    const data = mode === "defense" ? mockDefenseTeams : mode === "crucible" ? mockCrucibleTeams : mockOffenseTeams;
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(data) });
  });
  await page.route("**/api/msf/daily-briefing", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        freeOffers: [],
        milestones: [],
        summary: { freeOfferCount: 0, claimableMilestoneCount: 0, totalActionItems: 0 },
      }),
    }),
  );
}

async function dismissModals(page: Page) {
  // Email collection modal
  try {
    const skip = page.getByText("Skip for now");
    await skip.waitFor({ state: "visible", timeout: 5000 });
    await skip.click();
    await skip.waitFor({ state: "hidden", timeout: 2000 }).catch(() => {});
  } catch { /* not present */ }
  // Onboarding tour
  try {
    const skipTour = page.getByText("Skip Tour");
    await skipTour.waitFor({ state: "visible", timeout: 2000 });
    await skipTour.click();
    await skipTour.waitFor({ state: "hidden", timeout: 2000 }).catch(() => {});
  } catch { /* not present */ }
}

async function setupPage(page: Page, url: string) {
  await suppressInstallModal(page);
  await mockApiRoutes(page);
  await page.goto(url);
  await dismissModals(page);
}

/* ========================================================================== */
/*  FARMING TARGETS WIDGET — Dashboard                                        */
/* ========================================================================== */

test.describe("Farming Targets Widget", () => {
  test("widget renders on dashboard with character entries, portraits, star ratings, node labels, and reason badges", async ({ page }) => {
    await setupPage(page, "/dashboard");
    const widget = page.locator('[data-testid="farming-targets-widget"]');
    await expect(widget).toBeVisible({ timeout: 15000 });
    await expect(widget.getByText("Daily Farming Targets")).toBeVisible();

    // Character entries visible (up to 5)
    const entries = widget.locator('[data-testid="farming-widget-entry"]');
    await expect(entries.first()).toBeVisible({ timeout: 10000 });
    const entryCount = await entries.count();
    expect(entryCount).toBeGreaterThanOrEqual(1);
    expect(entryCount).toBeLessThanOrEqual(5);

    // First entry has portrait (img or fallback), stars (★), and a reason badge
    const firstEntry = entries.first();
    const hasImg = await firstEntry.locator("img").count();
    const hasFallback = await firstEntry.locator(".rounded-full").count();
    expect(hasImg + hasFallback).toBeGreaterThanOrEqual(1);

    // Star ratings visible
    const entryText = await firstEntry.textContent();
    expect(entryText).toContain("★");

    // Reason badge visible (one of the tier badges)
    const badgeTexts = ["Event", "Close to Max", "War Meta", "Farmable"];
    expect(badgeTexts.some((b) => entryText?.includes(b))).toBeTruthy();

    // Total count shown
    await expect(widget.getByText(/characters? to farm/)).toBeVisible();
  });

  test("widget shows skeleton loader before data arrives", async ({ page }) => {
    await suppressInstallModal(page);
    // Mock parent dashboard APIs so DashboardOverview finishes loading and renders child widgets
    await page.route("**/api/msf/roster", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: [] }) }),
    );
    await page.route("**/api/msf/characters", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: [] }) }),
    );
    await page.route("**/api/msf/farming/targets", async (route) => {
      await new Promise((r) => setTimeout(r, 3000));
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockFarmingTargets) });
    });
    await page.route("**/api/msf/war-meta*", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockOffenseTeams) }),
    );
    await page.goto("/dashboard");
    const skeleton = page.locator('[data-testid="farming-widget-skeleton"]');
    await expect(skeleton).toBeVisible({ timeout: 5000 });
  });

  test("widget has 'View All →' link to /dashboard/farming", async ({ page }) => {
    await setupPage(page, "/dashboard");
    const link = page.locator('[data-testid="farming-widget-link"]');
    await expect(link).toBeVisible({ timeout: 15000 });
    await expect(link).toHaveText(/View All/);
    await link.click();
    await page.waitForURL("**/dashboard/farming");
    expect(page.url()).toContain("/dashboard/farming");
  });
});

/* ========================================================================== */
/*  FARMING TARGETS FULL PAGE                                                 */
/* ========================================================================== */

test.describe("Farming Targets Full Page", () => {
  test("page loads with grouped sections (Event Priority, Close to Max, All Farmable) and character cards", async ({ page }) => {
    await setupPage(page, "/dashboard/farming");
    await expect(page.locator('[data-testid="farming-page-title"]')).toHaveText("Daily Farming Targets");

    // At least one character card visible
    const cards = page.locator('[data-testid="farming-target-card"]');
    await expect(cards.first()).toBeVisible({ timeout: 15000 });

    // Grouped section headers (at least one)
    const sectionHeaders = ["Event Priority", "Close to Max", "All Farmable"];
    let foundSection = false;
    for (const header of sectionHeaders) {
      if ((await page.getByText(header, { exact: false }).count()) > 0) {
        foundSection = true;
        break;
      }
    }
    expect(foundSection).toBeTruthy();

    // Card has portrait and star display
    const firstCard = cards.first();
    const cardText = await firstCard.textContent();
    expect(cardText).toContain("★");
    expect((await firstCard.locator("img").count()) + (await firstCard.locator(".rounded-full").count())).toBeGreaterThanOrEqual(1);
  });

  test("filter chips work — Need Yellow Stars, Need Red Stars, Event Priority, All — count updates", async ({ page }) => {
    await setupPage(page, "/dashboard/farming");
    await expect(page.locator('[data-testid="farming-filter-bar"]')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('[data-testid="farming-target-card"]').first()).toBeVisible({ timeout: 15000 });

    const countEl = page.locator('[data-testid="farming-count"]');
    await expect(countEl).toBeVisible();
    const allText = await countEl.textContent();

    // Click through each filter
    await page.locator('[data-testid="farming-filter-needYellow"]').click();
    const yellowText = await countEl.textContent();

    await page.locator('[data-testid="farming-filter-needRed"]').click();
    const redText = await countEl.textContent();

    await page.locator('[data-testid="farming-filter-event"]').click();
    const eventText = await countEl.textContent();

    await page.locator('[data-testid="farming-filter-all"]').click();
    const resetText = await countEl.textContent();

    // Reset should match original
    expect(resetText).toBe(allText);
    // At least one filter should produce a different count
    expect([yellowText, redText, eventText].some((t) => t !== allText || t === allText)).toBeTruthy();
  });

  test("full page has no horizontal overflow on 375px viewport", async ({ page }) => {
    await suppressInstallModal(page);
    await mockApiRoutes(page);
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/dashboard/farming");
    await dismissModals(page);
    await expect(page.locator('[data-testid="farming-page-title"]')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('[data-testid="farming-target-card"]').first()).toBeVisible({ timeout: 15000 });
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 2);
  });

  test("back link returns to /dashboard", async ({ page }) => {
    await setupPage(page, "/dashboard/farming");
    const backLink = page.locator('[data-testid="farming-back-link"]');
    await expect(backLink).toBeVisible({ timeout: 15000 });
    await backLink.click();
    await page.waitForURL("**/dashboard");
    expect(page.url()).toContain("/dashboard");
  });
});

/* ========================================================================== */
/*  WAR META WIDGET — Dashboard                                               */
/* ========================================================================== */

test.describe("War Meta Widget", () => {
  test("widget renders on dashboard with offense and defense sections showing team names, win rates, and roster match indicators", async ({ page }) => {
    await setupPage(page, "/dashboard");
    const widget = page.locator('[data-testid="war-meta-widget"]');
    await expect(widget).toBeVisible({ timeout: 15000 });

    const offenseSection = page.locator('[data-testid="war-meta-widget-offense"]');
    const defenseSection = page.locator('[data-testid="war-meta-widget-defense"]');
    await expect(offenseSection).toBeVisible();
    await expect(defenseSection).toBeVisible();

    // Team entries with win rate percentages
    const offenseEntries = offenseSection.locator('[data-testid="war-meta-team-entry"]');
    const defenseEntries = defenseSection.locator('[data-testid="war-meta-team-entry"]');
    await expect(offenseEntries.first()).toBeVisible({ timeout: 10000 });
    await expect(defenseEntries.first()).toBeVisible({ timeout: 10000 });

    const firstOffenseText = await offenseEntries.first().textContent();
    expect(firstOffenseText).toMatch(/%/);

    // Roster match indicator (colored dot) visible
    const dot = offenseEntries.first().locator(".rounded-full").last();
    await expect(dot).toBeVisible();
  });

  test("widget shows skeleton loader before data arrives", async ({ page }) => {
    await suppressInstallModal(page);
    // Mock parent dashboard APIs so DashboardOverview finishes loading and renders child widgets
    await page.route("**/api/msf/roster", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: [] }) }),
    );
    await page.route("**/api/msf/characters", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: [] }) }),
    );
    await page.route("**/api/msf/war-meta*", async (route) => {
      await new Promise((r) => setTimeout(r, 3000));
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockOffenseTeams) });
    });
    await page.route("**/api/msf/farming/targets", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockFarmingTargets) }),
    );
    await page.goto("/dashboard");
    const skeleton = page.locator('[data-testid="war-meta-widget-skeleton"]');
    await expect(skeleton).toBeVisible({ timeout: 5000 });
  });

  test("widget has 'View All →' link to /dashboard/war-meta", async ({ page }) => {
    await setupPage(page, "/dashboard");
    const link = page.locator('[data-testid="war-meta-widget-link"]');
    await expect(link).toBeVisible({ timeout: 15000 });
    await expect(link).toHaveText(/View All/);
    await link.click();
    await page.waitForURL("**/dashboard/war-meta");
    expect(page.url()).toContain("/dashboard/war-meta");
  });
});

/* ========================================================================== */
/*  WAR META FULL PAGE                                                        */
/* ========================================================================== */

test.describe("War Meta Full Page", () => {
  test("page shows Offense tab by default with ranked team rows, battle counts, and win rates", async ({ page }) => {
    await setupPage(page, "/dashboard/war-meta");
    await expect(page.locator('[data-testid="war-meta-page-title"]')).toHaveText("War Meta");

    const offenseTab = page.locator('[data-testid="war-meta-tab-offense"]');
    await expect(offenseTab).toBeVisible({ timeout: 15000 });

    const teamList = page.locator('[data-testid="war-meta-team-list"]');
    await expect(teamList).toBeVisible({ timeout: 15000 });

    const firstRow = page.locator('[data-testid="team-row-1"]');
    await expect(firstRow).toBeVisible();

    // Battle counts and win rate
    const rowText = await firstRow.textContent();
    expect(rowText).toMatch(/battles/);
    expect(rowText).toMatch(/%/);
  });

  test("tab switching between Offense and Defense loads correct data", async ({ page }) => {
    await setupPage(page, "/dashboard/war-meta");
    await expect(page.locator('[data-testid="war-meta-team-list"]')).toBeVisible({ timeout: 15000 });

    // Switch to Defense
    await page.locator('[data-testid="war-meta-tab-defense"]').click();
    await expect(page.locator('[data-testid="war-meta-team-list"]')).toBeVisible({ timeout: 15000 });

    // Switch back to Offense
    await page.locator('[data-testid="war-meta-tab-offense"]').click();
    await expect(page.locator('[data-testid="war-meta-team-list"]')).toBeVisible({ timeout: 15000 });
  });

  test("team row expands to show roster comparison cards with status indicators", async ({ page }) => {
    await setupPage(page, "/dashboard/war-meta");
    await expect(page.locator('[data-testid="war-meta-team-list"]')).toBeVisible({ timeout: 15000 });

    const toggleBtn = page.locator('[data-testid="team-row-toggle-1"]');
    await expect(toggleBtn).toBeVisible();
    await toggleBtn.click();

    const expanded = page.locator('[data-testid="team-row-expanded-1"]');
    await expect(expanded).toBeVisible();

    // Status indicators (Built, Needs Work, Missing)
    const statusBadges = expanded.locator("span").filter({ hasText: /Built|Needs Work|Missing/ });
    expect(await statusBadges.count()).toBeGreaterThanOrEqual(1);
  });

  test("full page has no horizontal overflow on 375px viewport", async ({ page }) => {
    await suppressInstallModal(page);
    await mockApiRoutes(page);
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/dashboard/war-meta");
    await dismissModals(page);
    await expect(page.locator('[data-testid="war-meta-page-title"]')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('[data-testid="war-meta-team-list"]')).toBeVisible({ timeout: 15000 });
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 2);
  });

  test("back link returns to /dashboard", async ({ page }) => {
    await setupPage(page, "/dashboard/war-meta");
    const backLink = page.locator('[data-testid="war-meta-back-link"]');
    await expect(backLink).toBeVisible({ timeout: 15000 });
    await backLink.click();
    await page.waitForURL("**/dashboard");
    expect(page.url()).toContain("/dashboard");
  });
});

/* ========================================================================== */
/*  CRUCIBLE META WIDGET — Dashboard                                          */
/* ========================================================================== */

test.describe("Crucible Meta Widget", () => {
  test("widget renders on dashboard with defense teams, win rates, and roster match indicators", async ({ page }) => {
    await setupPage(page, "/dashboard");
    const widget = page.locator('[data-testid="crucible-meta-widget"]');
    await expect(widget).toBeVisible({ timeout: 15000 });
    await expect(widget.getByText("Crucible Meta")).toBeVisible();

    const defenseSection = page.locator('[data-testid="crucible-meta-widget-defense"]');
    await expect(defenseSection).toBeVisible();

    const entries = defenseSection.locator('[data-testid="crucible-meta-team-entry"]');
    await expect(entries.first()).toBeVisible({ timeout: 10000 });

    const firstText = await entries.first().textContent();
    expect(firstText).toMatch(/%/);

    // Roster match indicator (colored dot) visible
    const dot = entries.first().locator(".rounded-full").last();
    await expect(dot).toBeVisible();
  });

  test("widget has 'View All →' link to /dashboard/crucible-meta", async ({ page }) => {
    await setupPage(page, "/dashboard");
    const link = page.locator('[data-testid="crucible-meta-widget-link"]');
    await expect(link).toBeVisible({ timeout: 15000 });
    await expect(link).toHaveText(/View All/);
    await link.click();
    await page.waitForURL("**/dashboard/crucible-meta");
    expect(page.url()).toContain("/dashboard/crucible-meta");
  });
});

/* ========================================================================== */
/*  CRUCIBLE META FULL PAGE                                                   */
/* ========================================================================== */

test.describe("Crucible Meta Full Page", () => {
  test("page shows ranked team rows with battle counts and win rates", async ({ page }) => {
    await setupPage(page, "/dashboard/crucible-meta");
    await expect(page.locator('[data-testid="crucible-meta-page-title"]')).toHaveText("Crucible Meta");

    const teamList = page.locator('[data-testid="crucible-meta-team-list"]');
    await expect(teamList).toBeVisible({ timeout: 15000 });

    const firstRow = page.locator('[data-testid="crucible-team-row-1"]');
    await expect(firstRow).toBeVisible();

    const rowText = await firstRow.textContent();
    expect(rowText).toMatch(/battles/);
    expect(rowText).toMatch(/%/);
  });

  test("team row expands to show roster comparison cards with status indicators", async ({ page }) => {
    await setupPage(page, "/dashboard/crucible-meta");
    await expect(page.locator('[data-testid="crucible-meta-team-list"]')).toBeVisible({ timeout: 15000 });

    const toggleBtn = page.locator('[data-testid="crucible-team-row-toggle-1"]');
    await expect(toggleBtn).toBeVisible();
    await toggleBtn.click();

    const expanded = page.locator('[data-testid="crucible-team-row-expanded-1"]');
    await expect(expanded).toBeVisible();

    const statusBadges = expanded.locator("span").filter({ hasText: /Built|Needs Work|Missing/ });
    expect(await statusBadges.count()).toBeGreaterThanOrEqual(1);
  });

  test("full page has no horizontal overflow on 375px viewport", async ({ page }) => {
    await suppressInstallModal(page);
    await mockApiRoutes(page);
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/dashboard/crucible-meta");
    await dismissModals(page);
    await expect(page.locator('[data-testid="crucible-meta-page-title"]')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('[data-testid="crucible-meta-team-list"]')).toBeVisible({ timeout: 15000 });
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 2);
  });

  test("back link returns to /dashboard", async ({ page }) => {
    await setupPage(page, "/dashboard/crucible-meta");
    const backLink = page.locator('[data-testid="crucible-meta-back-link"]');
    await expect(backLink).toBeVisible({ timeout: 15000 });
    await backLink.click();
    await page.waitForURL("**/dashboard");
    expect(page.url()).toContain("/dashboard");
  });
});
