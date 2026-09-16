import { test, expect, type Page } from "@playwright/test";

const NOW = Date.now();
const sample = {
  freeOffers: [
    { id: "gold", name: "Daily Free Claim", expiration: NOW / 1000 + 7200, remainingPurchases: 1, rewards: [{ itemName: "Gold", quantity: 100000 }] },
    { id: "energy", name: "Campaign Energy", expiration: NOW / 1000 + 14400, remainingPurchases: 1, rewards: [{ itemName: "Energy", quantity: 80 }] },
    { id: "unknown", name: "Bonus Pack", expiration: null, remainingPurchases: 1, rewards: [] },
  ],
  milestones: [{ id: "milestone", name: "Daily Objectives", brackets: [{ claimableTiers: [1, 2, 3] }] }],
};

async function prepare(page: Page, briefing: unknown = sample, status = 200) {
  await page.addInitScript(() => Object.defineProperty(navigator, "standalone", { value: true }));
  await page.clock.install({ time: NOW });
  await page.route("**/api/msf/daily-briefing", route => route.fulfill({ status, json: briefing }));
  await page.route("**/api/msf/wallet", route => route.fulfill({ json: { exists: true, gold: 2400000, cores: 1450, confirmedAt: new Date(NOW).toISOString() } }));
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { level: 1, name: "Here's what matters today" })).toBeVisible();
  for (const name of ["Skip for now", "Skip Tour"]) {
    const button = page.getByText(name, { exact: true });
    if (await button.isVisible()) await button.click();
  }
  await expect(page.getByRole("button", { name: "Refresh rewards" })).toBeEnabled();
}

for (const width of [320, 390, 402, 440]) {
  test(`H + G resource layout fits ${width}px phone viewport`, async ({ page }) => {
    await page.setViewportSize({ width, height: 874 });
    let rosterRequests = 0;
    await page.route("**/api/msf/roster", route => { rosterRequests++; return route.fulfill({ json: { data: [] } }); });
    await prepare(page);
    await expect(page.getByTestId("daily-briefing-widget")).toContainText("100K Gold");
    await expect(page.getByTestId("dashboard-collect").locator("strong")).toHaveText("4");
    await expect(page.getByTestId("wallet-strip")).toContainText("2.4M");
    await expect(page.getByRole("link", { name: /PLAN.*Next upgrade/ })).toHaveAttribute("href", "/planner");
    await expect(page.getByRole("link", { name: /FARM.*Find sources/ })).toHaveAttribute("href", "/analyze/farming");
    await expect(page.getByRole("link", { name: /CHECK.*Inventory/ })).toHaveAttribute("href", "/inventory");
    expect(rosterRequests).toBe(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    const tiles = await page.getByRole("navigation", { name: "Resource tools" }).boundingBox();
    expect(tiles?.width).toBeLessThan(width);
    if (width === 402 || width === 440) {
      await page.addStyleTag({ content: "nextjs-portal { display: none; }" });
      await page.screenshot({ path: `../artifacts/dashboard-review/hg-local-${width}px.png`, fullPage: true });
    }
  });
}

test("reviews rewards inline without a paywall and closes with focus restored", async ({ page }) => {
  await prepare(page);
  await page.getByRole("button", { name: "Review offer", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Available rewards" })).toBeFocused();
  await expect(page.getByText("Expiry not provided", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Daily Objectives" })).toBeVisible();
  await page.getByRole("button", { name: "Close rewards" }).click();
  await expect(page.getByTestId("dashboard-collect")).toBeFocused();
  await expect(page).toHaveURL(/\/dashboard$/);
});

test("a live deadline removes the expired offer and updates collect count", async ({ page }) => {
  await prepare(page, { freeOffers: [{ ...sample.freeOffers[0], expiration: NOW / 1000 + 60 }], milestones: [] });
  await expect(page.getByTestId("reward-countdown")).toHaveText("1m left");
  await page.clock.fastForward(61_000);
  await expect(page.getByTestId("reward-countdown")).toHaveCount(0);
  await expect(page.getByTestId("dashboard-collect").locator("strong")).toHaveText("0");
  await expect(page.getByText("No opportunities reported")).toBeVisible();
});

test("partial and failed data remain unknown, and retry recovers", async ({ page }) => {
  await prepare(page, { ...sample, milestonesError: "Unavailable" });
  await expect(page.getByTestId("dashboard-collect").locator("strong")).toHaveText("3+");
  await expect(page.getByTestId("daily-briefing-widget-warning")).toBeVisible();
  await page.route("**/api/msf/daily-briefing", route => route.fulfill({ status: 502, json: { error: "Unavailable" } }));
  await page.getByRole("button", { name: "Refresh rewards" }).click();
  await expect(page.getByTestId("dashboard-collect").locator("strong")).toHaveText("—");
  await expect(page.getByText("Rewards temporarily unavailable")).toBeVisible();
  await page.route("**/api/msf/daily-briefing", route => route.fulfill({ json: sample }));
  await page.getByRole("button", { name: "Refresh rewards" }).click();
  await expect(page.getByTestId("dashboard-collect").locator("strong")).toHaveText("4");
});

test("wallet updates use the existing sheet and reflect the saved values", async ({ page }) => {
  await prepare(page);
  let saved: unknown;
  await page.route("**/api/msf/wallet", route => {
    saved = route.request().postDataJSON();
    return route.fulfill({ json: { ...saved as object, confirmedAt: new Date(NOW).toISOString() } });
  });
  await page.getByRole("button", { name: "Update", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Enter your balances" });
  await dialog.getByRole("textbox", { name: "Gold", exact: true }).fill("3000000");
  await dialog.getByRole("textbox", { name: "Power Cores" }).fill("2000");
  await dialog.getByRole("button", { name: /Save/ }).click();
  await expect(dialog).toHaveCount(0);
  expect(saved).toEqual({ gold: 3000000, cores: 2000 });
  await expect(page.getByTestId("wallet-strip")).toContainText("3M");
});

test("More provides accessible secondary navigation and closes with Escape", async ({ page }) => {
  await prepare(page);
  await page.getByRole("button", { name: "More", exact: true }).click();
  const menu = page.getByRole("dialog", { name: "Your toolkit" });
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("link", { name: "FAQ" })).toHaveAttribute("href", "/faq");
  await expect(menu.getByRole("button", { name: "Close", exact: true })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(menu).not.toBeVisible();
  await expect(page.getByRole("button", { name: "More", exact: true })).toBeFocused();
});

test("wallet failure offers retry instead of inventing zero balances", async ({ page }) => {
  await prepare(page);
  await page.route("**/api/msf/wallet", route => route.fulfill({ status: 502, json: { error: "Offline" } }));
  await page.reload();
  await expect(page.getByTestId("wallet-load-error")).toBeVisible();
  await expect(page.getByTestId("wallet-value-gold")).toHaveCount(0);
  await page.route("**/api/msf/wallet", route => route.fulfill({ json: { exists: false, gold: null, cores: null, confirmedAt: null } }));
  await page.getByTestId("wallet-load-error").getByRole("button", { name: "Try again" }).click();
  await expect(page.getByTestId("wallet-add-prompt")).toBeVisible();
});

test("desktop retains the original QR screen", async ({ page }) => {
  await prepare(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(page.getByRole("img", { name: "Scan to visit MSF Companion on mobile" })).toBeVisible();
  await expect(page.getByText("Scan with your phone's camera")).toBeVisible();
  await expect(page.getByTestId("resource-dashboard")).toHaveCount(0);
});
