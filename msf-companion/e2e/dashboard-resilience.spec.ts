import { expect, test, type Page, type Route } from "@playwright/test";

const roster = [
  {
    id: "hero-one",
    power: 2_000,
    yellowStars: 7,
    traits: ["BIO", "COSMIC"],
  },
  {
    id: "hero-two",
    power: 1_000,
    yellowStars: 5,
    traits: ["TECH"],
  },
];

const catalog = [
  { id: "hero-one", status: "playable" },
  { id: "hero-two", status: "PLAYABLE" },
  { id: "hero-three", status: "playable" },
  { id: "future-hero", status: "preview" },
];

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

async function suppressInstallModal(page: Page) {
  await page.addInitScript(() => {
    Object.defineProperty(window.navigator, "standalone", { value: true });
    const originalMatchMedia = window.matchMedia.bind(window);
    window.matchMedia = (query: string) => {
      if (query === "(display-mode: standalone)") {
        return {
          matches: true,
          media: query,
          addListener: () => {},
          removeListener: () => {},
          addEventListener: () => {},
          removeEventListener: () => {},
          dispatchEvent: () => true,
          onchange: null,
        } as MediaQueryList;
      }
      return originalMatchMedia(query);
    };
  });
}

async function dismissOptionalPrompts(page: Page) {
  for (const label of ["Skip for now", "Skip Tour"]) {
    const control = page.getByText(label, { exact: true });
    if (await control.isVisible({ timeout: 500 }).catch(() => false)) {
      await control.click();
    }
  }
}

interface MockOptions {
  rosterHandler?: (route: Route) => Promise<void> | void;
  catalogHandler?: (route: Route) => Promise<void> | void;
  failFarming?: boolean;
  failBriefing?: boolean;
  failPlanner?: boolean;
  failTower?: boolean;
}

async function mockDashboard(page: Page, options: MockOptions = {}) {
  await suppressInstallModal(page);

  await page.route("**/api/msf/roster", (route) =>
    options.rosterHandler
      ? options.rosterHandler(route)
      : json(route, { data: roster }),
  );
  await page.route("**/api/msf/characters", (route) =>
    options.catalogHandler
      ? options.catalogHandler(route)
      : json(route, { data: catalog }),
  );
  await page.route("**/api/advisor/daily-tip", (route) =>
    json(route, { tip: null }),
  );
  await page.route("**/api/msf/farming/targets", (route) =>
    options.failFarming
      ? json(route, { error: "Farming service is temporarily unavailable." }, 502)
      : json(route, { targets: [], totalCount: 0 }),
  );
  await page.route("**/api/msf/daily-briefing", (route) =>
    options.failBriefing
      ? json(route, {
          freeOffers: [],
          milestones: [],
          summary: {
            freeOfferCount: 0,
            claimableMilestoneCount: 0,
            totalActionItems: 0,
          },
          offersError: "Offers unavailable",
          milestonesError: "Milestones unavailable",
        })
      : json(route, {
          freeOffers: [],
          milestones: [],
          summary: {
            freeOfferCount: 0,
            claimableMilestoneCount: 0,
            totalActionItems: 0,
          },
        }),
  );
  await page.route("**/api/msf/war-meta*", (route) =>
    json(route, { teams: [] }),
  );
  await page.route("**/api/msf/planner/gaps", (route) =>
    options.failPlanner
      ? json(route, { error: "Planner service is temporarily unavailable." }, 502)
      : json(route, []),
  );
  await page.route("**/api/msf/planner/priorities", (route) =>
    json(route, []),
  );
  await page.route("**/api/tower/events", (route) =>
    options.failTower
      ? json(route, { error: "Tower service is temporarily unavailable." }, 502)
      : json(route, { active: false, tower: null }),
  );
}

test.describe("Dashboard resilience", () => {
  test("renders accurate commander stats from independent roster and catalog data", async ({ page }) => {
    await mockDashboard(page);
    await page.goto("/dashboard");
    await dismissOptionalPrompts(page);

    await expect(page.getByRole("heading", { level: 1, name: /Welcome back/ })).toBeVisible();
    await expect(page.getByTestId("dashboard-stat-tcp")).toContainText("3.0K");
    await expect(page.getByTestId("dashboard-stat-roster")).toContainText("2 / 3");
    await expect(page.getByTestId("dashboard-stat-avg-power")).toContainText("1.5K");
    await expect(page.getByTestId("dashboard-stat-completion")).toContainText("67%");
    await expect(page.getByText("Star Level Distribution")).toBeVisible();
    await expect(page.getByText("BIO 1")).toBeVisible();
  });

  test("does not present failed roster data as zero or complete", async ({ page }) => {
    await mockDashboard(page, {
      rosterHandler: (route) =>
        json(route, { error: "Failed to load roster data" }, 502),
    });
    await page.goto("/dashboard");
    await dismissOptionalPrompts(page);

    await expect(page.getByTestId("dashboard-data-error")).toContainText(
      "Failed to load roster data",
    );
    await expect(page.getByTestId("dashboard-stat-tcp")).toContainText("—");
    await expect(page.getByTestId("dashboard-stat-roster")).toContainText("— / 3");
    await expect(page.getByTestId("dashboard-stat-completion")).toContainText("—");
    await expect(page.getByTestId("roster-breakdown-unavailable")).toBeVisible();
    await expect(page.getByText("0 / ?", { exact: true })).toHaveCount(0);
  });

  test("retry recovers failed commander stats without reloading the page", async ({ page }) => {
    let rosterAttempts = 0;
    await mockDashboard(page, {
      rosterHandler: (route) => {
        rosterAttempts += 1;
        return rosterAttempts === 1
          ? json(route, { error: "Temporary roster failure" }, 502)
          : json(route, { data: roster.slice(0, 1) });
      },
    });
    await page.goto("/dashboard");
    await dismissOptionalPrompts(page);

    await expect(page.getByTestId("dashboard-data-error")).toBeVisible();
    await page.getByTestId("dashboard-data-retry").click();

    await expect(page.getByTestId("dashboard-data-error")).toHaveCount(0);
    await expect(page.getByTestId("dashboard-stat-roster")).toContainText("1 / 3");
    expect(rosterAttempts).toBe(2);
  });

  test("widgets distinguish service failures from genuine empty states", async ({ page }) => {
    await mockDashboard(page, {
      failFarming: true,
      failBriefing: true,
      failPlanner: true,
      failTower: true,
    });
    await page.goto("/dashboard");
    await dismissOptionalPrompts(page);

    await expect(page.getByTestId("farming-widget-error")).toBeVisible();
    await expect(page.getByTestId("daily-briefing-widget-warning")).toBeVisible();
    await expect(page.getByTestId("planner-summary-error")).toBeVisible();
    await expect(page.getByTestId("tower-event-error")).toBeVisible();
    await expect(page.getByText("All campaign characters maxed! 🎉")).toHaveCount(0);
    await expect(page.getByText("You're all caught up! ✅")).toHaveCount(0);
    await expect(page.getByText("No upcoming events need preparation")).toHaveCount(0);
  });
});
