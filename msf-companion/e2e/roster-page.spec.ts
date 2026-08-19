import { test, expect, type Page, type Route } from "@playwright/test";

const mockRoster = Array.from({ length: 20 }, (_, i) => ({
  id: `char-${i}`,
  name: `Hero ${i}`,
  level: 80 + i,
  gearTier: 14 + (i % 5),
  power: 500_000 + i * 10_000,
  yellowStars: 5 + (i % 3),
  redStars: i % 4,
  portrait: `https://example.com/hero-${i}.png`,
  playable: true,
  traits: [
    ["Bio", "Tech", "Mystic", "Mutant", "Skill", "Cosmic"][i % 6],
    ["Protector", "Support", "Controller", "Brawler", "Blaster"][i % 5],
  ],
}));

const mockCharacters = Array.from({ length: 25 }, (_, i) => ({
  id: `char-${i}`,
  name: `Hero ${i}`,
  portrait: `https://example.com/hero-${i}.png`,
  status: "playable",
  traits: [
    ["Bio", "Tech", "Mystic", "Mutant", "Skill", "Cosmic"][i % 6],
    ["Protector", "Support", "Controller", "Brawler", "Blaster"][i % 5],
  ],
}));

interface MockOptions {
  catalogFailure?: boolean;
  rosterFailureCount?: number;
  roster?: typeof mockRoster;
}

async function setupMock(page: Page, options: MockOptions = {}) {
  let rosterRequests = 0;

  // Dismissing onboarding should never mutate the real test account.
  await page.route("**/api/commander/onboarding", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "{}" }),
  );
  await page.route("https://example.com/**", (route) => route.abort());

  await page.route("**/api/msf/roster*", (route) => {
    rosterRequests++;
    if (rosterRequests <= (options.rosterFailureCount ?? 0)) {
      return route.fulfill({
        status: 502,
        contentType: "application/json",
        body: JSON.stringify({ error: "Injected roster failure" }),
      });
    }
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: options.roster ?? mockRoster }),
    });
  });

  await page.route("**/api/msf/characters", (route: Route) => {
    if (options.catalogFailure) {
      return route.fulfill({
        status: 502,
        contentType: "application/json",
        body: JSON.stringify({ error: "Injected catalog failure" }),
      });
    }
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: mockCharacters }),
    });
  });

  await page.route("**/api/msf/characters/**", (route: Route) => {
    const id = new URL(route.request().url()).pathname.split("/").pop() ?? "unknown";
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: {
          id,
          name: `Hero ${id.replace("char-", "")}`,
          traits: ["Bio", "Blaster"],
        },
      }),
    });
  });

  return { getRosterRequests: () => rosterRequests };
}

async function dismissOverlays(page: Page) {
  const skipTour = page.getByRole("button", { name: "Skip Tour" });
  if (await skipTour.isVisible().catch(() => false)) {
    await skipTour.click();
  }

  const closeInstall = page.getByRole("button", {
    name: "Close install prompt",
  });
  if (await closeInstall.isVisible().catch(() => false)) {
    await closeInstall.click();
  }
}

async function openRoster(page: Page) {
  await page.goto("/roster");
  await dismissOverlays(page);

  await expect(page.getByRole("heading", { name: "My Roster" })).toBeVisible();
}

test.describe("Roster Page", () => {
  test("renders real response contracts and fetches the roster once", async ({
    page,
  }) => {
    const requests = await setupMock(page);
    await openRoster(page);

    await expect(page.getByText("20 of 25 playable characters")).toBeVisible();
    await expect(page.getByRole("button", { name: /Hero 0/ })).toBeVisible();
    await expect(page.getByRole("button", { name: "Missing (5)" })).toBeVisible();
    expect(requests.getRosterRequests()).toBe(1);
  });

  test("moves between roster, missing, and detail views without losing state", async ({
    page,
  }) => {
    await setupMock(page);
    await openRoster(page);

    await page.getByRole("button", { name: "Missing (5)" }).click();
    await expect(
      page.getByRole("heading", { name: "Missing Characters" }),
    ).toBeVisible();
    await expect(page.getByText("5 playable characters you haven't unlocked")).toBeVisible();
    await expect(page.getByRole("button", { name: /Hero 20/ })).toBeVisible();

    await page.getByRole("button", { name: /Hero 20/ }).click();
    await expect(page.getByRole("heading", { name: "Hero 20" })).toBeVisible();
    await page.getByRole("button", { name: "← Back" }).click();
    await expect(
      page.getByRole("heading", { name: "Missing Characters" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "← My Roster" }).click();
    await expect(page.getByText("20 of 25 playable characters")).toBeVisible();
  });

  test("keeps the owned roster usable when the game catalog fails", async ({
    page,
  }) => {
    await setupMock(page, { catalogFailure: true });
    await openRoster(page);

    await expect(page.getByText("20 of ? playable characters")).toBeVisible();
    await expect(
      page.getByRole("alert").filter({
        hasText: "Character catalog unavailable",
      }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Missing (?)" })).toBeDisabled();
    await expect(page.getByRole("button", { name: /Hero 0/ })).toBeVisible();
    await expect(
      page.getByText("You've unlocked every playable character!"),
    ).toHaveCount(0);
  });

  test("recovers from a transient roster failure", async ({ page }) => {
    const requests = await setupMock(page, { rosterFailureCount: 1 });
    await page.goto("/roster");
    await dismissOverlays(page);

    await expect(page.getByText("Injected roster failure")).toBeVisible();
    await page.getByRole("button", { name: "Retry" }).click();
    await expect(page.getByText("20 of 25 playable characters")).toBeVisible();
    expect(requests.getRosterRequests()).toBe(2);
  });

  test("handles an empty owned roster without confusing it with catalog failure", async ({
    page,
  }) => {
    await setupMock(page, { roster: [] });
    await openRoster(page);

    await expect(page.getByText("0 of 25 playable characters")).toBeVisible();
    await expect(page.getByText("No characters found in your roster.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Missing (25)" })).toBeEnabled();
  });

  test("has no horizontal overflow across narrow mobile viewports", async ({
    page,
  }) => {
    await setupMock(page);

    for (const width of [320, 360, 390]) {
      await page.setViewportSize({ width, height: 844 });
      await openRoster(page);

      const dimensions = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      expect(dimensions.scrollWidth, `${width}px viewport`).toBeLessThanOrEqual(
        dimensions.clientWidth + 1,
      );

      const firstRow = await Promise.all(
        [19, 18, 17, 16].map((id) =>
          page.getByRole("button", { name: new RegExp(`Hero ${id}`) }).boundingBox(),
        ),
      );
      for (let index = 1; index < firstRow.length; index++) {
        const previous = firstRow[index - 1];
        const current = firstRow[index];
        expect(previous).not.toBeNull();
        expect(current).not.toBeNull();
        expect(
          (previous?.x ?? 0) + (previous?.width ?? 0),
          `${width}px tiles ${index} and ${index + 1} overlap`,
        ).toBeLessThanOrEqual(current?.x ?? 0);
      }
    }
  });
});
