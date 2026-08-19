import { test, expect, type Page } from "@playwright/test";

const makeCharacter = (index: number) => ({
  id: `char-${index}`,
  name: `Character ${index}`,
  portrait: "",
  power: 100_000 + index,
  level: 100,
  gearTier: 19,
  yellowStars: 7,
  redStars: 7,
  traits: ["Bio", "Hero", "Avengers", index === 1 ? "Support" : "Brawler"],
  abilityKit: {
    basic: null,
    special: null,
    ultimate: null,
    passive: null,
  },
  stats: {
    health: 100_000,
    damage: 10_000,
    armor: 5_000,
    focus: 5_000,
    resist: 5_000,
    speed: 100,
    critChance: 0.1,
    critDamageBonus: 1.3,
    dodgeChance: 0,
    blockChance: 0,
    blockAmount: 0,
    accuracy: 1,
  },
});

const roster = Array.from({ length: 6 }, (_, index) => makeCharacter(index + 1));

async function suppressBlockingOverlays(page: Page) {
  await page.route("**/api/commander/onboarding", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "{}" }),
  );
  await page.addLocatorHandler(
    page.getByRole("button", { name: "Skip Tour" }),
    async (button) => button.click(),
  );
  await page.addInitScript(() => {
    Object.defineProperty(window.navigator, "standalone", { value: true });
    Object.defineProperty(window, "matchMedia", {
      value: (query: string) => ({
        matches: query === "(display-mode: standalone)",
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }),
    });
  });
}

async function mockHealthyRoutes(page: Page) {
  await page.route("**/api/msf/team-builder/roster", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: roster }),
    }),
  );
  await page.route("**/api/msf/team-builder/meta", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: [] }),
    }),
  );
}

test.describe("Teams Page", () => {
  test.beforeEach(async ({ page }) => {
    await suppressBlockingOverlays(page);
    await mockHealthyRoutes(page);
  });

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

  for (const width of [320, 360, 390]) {
    test(`five team slots stay inside the card and do not overlap at ${width}px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 844 });
      await page.goto("/teams");

      const slots = page.locator("[data-testid^='team-slot-']");
      await expect(slots).toHaveCount(5);
      const boxes = await slots.evaluateAll((elements) =>
        elements.map((element) => {
          const rect = element.getBoundingClientRect();
          return { left: rect.left, right: rect.right, width: rect.width };
        }),
      );

      expect(boxes[0].left).toBeGreaterThanOrEqual(0);
      expect(boxes.at(-1)?.right).toBeLessThanOrEqual(width + 0.5);
      for (let index = 1; index < boxes.length; index += 1) {
        expect(boxes[index].left).toBeGreaterThanOrEqual(boxes[index - 1].right);
        expect(boxes[index].width).toBeGreaterThan(0);
      }
    });
  }

  test("roster failure is visible and Retry recovers", async ({ page }) => {
    let rosterRequests = 0;
    let metaRequests = 0;
    await page.route("**/api/msf/team-builder/roster", (route) => {
      rosterRequests += 1;
      if (rosterRequests === 1) {
        return route.fulfill({
          status: 502,
          contentType: "application/json",
          body: JSON.stringify({ error: "Roster service is temporarily unavailable" }),
        });
      }
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: roster }),
      });
    });
    await page.route("**/api/msf/team-builder/meta", (route) => {
      metaRequests += 1;
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: [] }),
      });
    });

    await page.goto("/teams");
    await expect(page.locator("p[role='alert']")).toContainText(
      "Roster service is temporarily unavailable",
    );
    expect(metaRequests).toBe(0);

    await page.getByRole("button", { name: "Retry" }).click();
    await expect(page.getByTestId("team-count")).toContainText("Team (0/5)");
    expect(rosterRequests).toBe(2);
    expect(metaRequests).toBe(1);
  });

  test("an empty roster response is treated as an error instead of a blank builder", async ({
    page,
  }) => {
    await page.route("**/api/msf/team-builder/roster", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: [] }),
      }),
    );

    await page.goto("/teams");
    await expect(page.locator("p[role='alert']")).toContainText(
      "No playable characters were returned for your roster",
    );
    await expect(page.getByTestId("team-count")).toHaveCount(0);
  });

  test("meta failure leaves manual building available and never claims a team is unique", async ({
    page,
  }) => {
    await page.route("**/api/msf/team-builder/meta", (route) =>
      route.fulfill({
        status: 502,
        contentType: "application/json",
        body: JSON.stringify({ error: "Meta service unavailable" }),
      }),
    );

    await page.goto("/teams");
    await expect(page.getByRole("status")).toContainText("Meta data is unavailable");
    await expect(page.getByTestId("prebuilt-toggle")).toBeDisabled();
    await expect(page.getByTestId("prebuilt-toggle")).toContainText(
      "Recommendations Unavailable",
    );

    await page.getByTestId("team-add-btn").click();
    for (let index = 1; index <= 5; index += 1) {
      await page.getByTestId(`roster-char-char-${index}`).click();
    }
    await page.getByTestId("roster-confirm-btn").click();

    await expect(page.getByTestId("team-count")).toContainText("Team (5/5)");
    await expect(page.getByTestId("analysis-meta")).toContainText(
      "Meta comparison is unavailable",
    );
    await expect(page.getByTestId("analysis-meta")).not.toContainText("Unique Team");
  });
});
