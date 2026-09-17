import { expect, test, type Page } from "@playwright/test";
import { suppressInstallPrompt } from "./helpers/app-page";

async function prepare(page: Page, href = "/dashboard") {
  await suppressInstallPrompt(page);
  // Navigation must work even when a page's game data is unavailable. No live
  // player API calls or mutations are needed to exercise the shared layout.
  await page.route("**/api/**", (route) => route.fulfill({
    status: 503,
    json: { error: "Game data unavailable in navigation test" },
  }));
  await page.route("**/api/usage-track", (route) => route.fulfill({ json: { ok: true } }));
  await page.route("**/api/msf/daily-briefing", (route) => route.fulfill({
    json: { freeOffers: [], milestones: [] },
  }));
  await page.route("**/api/msf/wallet", (route) => route.fulfill({
    json: { exists: false, gold: null, cores: null, confirmedAt: null },
  }));
  await page.goto(href);
  await page.addStyleTag({ content: "nextjs-portal { display: none; }" });
  await expect(page.getByRole("navigation", { name: "Main navigation" })).toBeVisible();
  for (const name of ["Skip for now", "Skip Tour"]) {
    const button = page.getByText(name, { exact: true });
    if (await button.isVisible()) await button.click();
  }
}

async function expectSameNavigation(page: Page) {
  const nav = page.getByRole("navigation", { name: "Main navigation" });
  await expect(nav.getByRole("link")).toHaveText(["Today", "Roster", "Resources", "Planner"]);
  await expect(nav.getByRole("button")).toHaveText(["More"]);
  return nav;
}

test("bottom navigation stays identical while moving between primary pages", async ({ page }) => {
  test.setTimeout(90_000);
  await prepare(page);
  for (const [label, href] of [
    ["Roster", "/roster"],
    ["Resources", "/inventory"],
    ["Planner", "/planner"],
    ["Today", "/dashboard"],
  ]) {
    const nav = await expectSameNavigation(page);
    await nav.getByRole("link", { name: label, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`${href}$`));
    await expect(nav.getByRole("link", { name: label, exact: true })).toHaveAttribute("aria-current", "page");
    await expect(nav.locator("[aria-current]")).toHaveCount(1);
    await expectSameNavigation(page);
  }
});

test("More preserves secondary routes, active state, and native dialog focus", async ({ page }) => {
  test.setTimeout(60_000);
  await prepare(page);
  const nav = await expectSameNavigation(page);
  const more = nav.getByRole("button", { name: "More", exact: true });
  await more.click();
  const dialog = page.getByRole("dialog", { name: "Your toolkit" });
  await expect(dialog.getByRole("button", { name: "Close", exact: true })).toBeFocused();
  await expect(more).toHaveAttribute("aria-expanded", "true");
  for (const [label, href] of [
    ["Heroes", "/heroes"], ["Teams", "/teams"], ["Analyze", "/analyze"],
    ["AI Advisor", "/advisor"], ["Profile", "/profile"], ["FAQ", "/faq"],
  ]) {
    await expect(dialog.getByRole("link", { name: label, exact: true })).toHaveAttribute("href", href);
  }
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(more).toBeFocused();
  await expect(more).toHaveAttribute("aria-expanded", "false");
  await more.click();
  await dialog.getByRole("link", { name: "AI Advisor", exact: true }).click();
  await expect(page).toHaveURL(/\/advisor$/);
  await expect(dialog).not.toBeVisible();
  await expectSameNavigation(page);
  await expect(more).toHaveAttribute("aria-current", "true");
  await more.click();
  await expect(dialog.getByRole("link", { name: "AI Advisor", exact: true })).toHaveAttribute("aria-current", "page");
  await page.goBack();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(dialog).not.toBeVisible();
  await expect(nav.getByRole("link", { name: "Today", exact: true })).toHaveAttribute("aria-current", "page");
});

test("nested routes keep the correct section selected", async ({ page }) => {
  test.setTimeout(60_000);
  await prepare(page, "/dashboard/daily-briefing");
  const nav = await expectSameNavigation(page);
  await expect(nav.getByRole("link", { name: "Today", exact: true })).toHaveAttribute("aria-current", "page");
  await page.goto("/analyze/farming");
  await page.addStyleTag({ content: "nextjs-portal { display: none; }" });
  await expectSameNavigation(page);
  await expect(nav.getByRole("button", { name: "More", exact: true })).toHaveAttribute("aria-current", "true");
  await nav.getByRole("button", { name: "More", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Your toolkit" }).getByRole("link", { name: "Analyze", exact: true })).toHaveAttribute("aria-current", "page");
});

test("More waits for hydration before accepting the first tap", async ({ page }) => {
  await page.route("**/_next/static/**/*.js*", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 250));
    await route.continue();
  });
  await prepare(page, "/analyze/farming");
  const more = page.getByRole("navigation", { name: "Main navigation" }).getByRole("button", { name: "More", exact: true });
  await more.click();
  await expect(page.getByRole("dialog", { name: "Your toolkit" })).toBeVisible();
  await expect(more).toHaveAttribute("aria-expanded", "true");
});

test("the same five touch targets fit small and large phone widths", async ({ page }) => {
  await prepare(page);
  for (const width of [320, 390, 402, 440]) {
    await page.setViewportSize({ width, height: 874 });
    const nav = await expectSameNavigation(page);
    const bounds = await nav.boundingBox();
    expect(bounds?.x).toBe(0);
    expect(bounds?.width).toBe(width);
    for (const target of await nav.locator("a, button").all()) {
      const box = await target.boundingBox();
      expect(box?.width).toBeGreaterThanOrEqual(44);
      expect(box?.height).toBeGreaterThanOrEqual(44);
    }
  }
});
