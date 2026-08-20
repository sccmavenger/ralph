import { test, expect } from "@playwright/test";

async function suppressInstallModal(page: import("@playwright/test").Page) {
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

test.beforeEach(async ({ page }) => {
  await suppressInstallModal(page);
});

test.describe("Dashboard Page", () => {
  test("navigate to /dashboard — page loads with welcome heading", async ({
    page,
  }) => {
    await page.goto("/dashboard");
    await expect(page.getByText("Welcome back")).toBeVisible();
    await expect(page.getByText("Your MSF Companion dashboard")).toBeVisible();
  });

  test("navigation cards are visible for Roster, Heroes, Teams, Analyze, Profile", async ({
    page,
  }) => {
    await page.goto("/dashboard");
    await expect(page.getByText("Welcome back")).toBeVisible();
    // Nav cards contain emoji + text. Use first to avoid conflict with bottom tab bar.
    await expect(page.getByTestId("dashboard-nav-my-roster")).toBeVisible();
    await expect(page.getByTestId("dashboard-nav-character-database")).toBeVisible();
    await expect(page.getByTestId("dashboard-nav-team-builder")).toBeVisible();
    await expect(page.getByTestId("dashboard-nav-fight-analyzer")).toBeVisible();
    await expect(page.getByTestId("dashboard-nav-commander-profile")).toBeVisible();
  });

  test("clicking Roster nav card navigates to /roster", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.getByText("Welcome back")).toBeVisible();
    await page.getByRole("link", { name: /My Roster/i }).click();
    await page.waitForURL("**/roster");
    expect(page.url()).toContain("/roster");
  });

  test("page renders at 390x844 mobile viewport without horizontal overflow", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/dashboard");
    await expect(page.getByText("Welcome back")).toBeVisible();
    const scrollWidth = await page.evaluate(
      () => document.documentElement.scrollWidth,
    );
    const clientWidth = await page.evaluate(
      () => document.documentElement.clientWidth,
    );
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
  });
});
