import { expect, test, type Page } from "@playwright/test";
import { suppressInstallPrompt } from "./helpers/app-page";

const data = [
  { id: "gear-1", name: "Augmented Arcane Powder", category: "Gear", quantity: 128 },
  { id: "gear-2", name: "Augmented Basic Catalyst Part", category: "Gear", quantity: 3240 },
  { id: "ability-1", name: "T4 Ability Material", category: "Ability Materials", quantity: 612 },
  { id: "iso-1", name: "T2 Level 5 Ions", category: "ISO-8 Items", quantity: 156000 },
  { id: "shard-1", name: "Spider-Man Shards", category: "Shards", quantity: 35 },
  { id: "orb-1", name: "Premium Orb Fragments", category: "Orbs", quantity: 2500 },
  { id: "training-1", name: "L4 Training Module", category: "Training Materials", quantity: 90 },
  { id: "currency-1", name: "Raid Credits", category: "Currency", quantity: 14500 },
  { id: "gear-empty", name: "Empty Gear", category: "Gear", quantity: 0 },
  { id: "unlabelled-1", category: "Other", quantity: null },
];

async function prepare(page: Page, payload: unknown = { data }, status = 200) {
  await suppressInstallPrompt(page);
  await page.route("**/api/**", route => route.fulfill({ status: 503, json: { error: "Unused source" } }));
  await page.route("**/api/usage-track", route => route.fulfill({ json: { ok: true } }));
  await page.route("**/api/msf/inventory", route => route.fulfill({ status, json: payload }));
  await page.goto("/inventory");
  await expect(page.getByRole("heading", { level: 1, name: "Inventory", exact: true })).toBeVisible();
  for (const name of ["Skip for now", "Skip Tour"]) {
    const button = page.getByText(name, { exact: true });
    if (await button.isVisible()) await button.click();
  }
  await expect(page.getByRole("button", { name: "Refresh inventory" })).toBeEnabled();
}

for (const width of [320, 390, 402, 440]) {
  test(`inventory resource layout fits ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 874 });
    await prepare(page);
    await expect(page.getByTestId("inventory-in-stock")).toHaveText("8+");
    await expect(page.getByTestId("inventory-item")).toHaveCount(10);
    await expect(page.getByRole("navigation", { name: "Main navigation" }).getByRole("link", { name: "Resources", exact: true })).toHaveAttribute("aria-current", "page");
    await expect(page.getByRole("link", { name: /Plan upgrades/ })).toHaveAttribute("href", "/planner");
    await expect(page.getByRole("link", { name: /Find resources/ })).toHaveAttribute("href", "/analyze/farming");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    if (width === 402) {
      await page.addStyleTag({ content: "nextjs-portal { display: none; }" });
      await page.screenshot({ path: "../artifacts/inventory-review/inventory-402px.png" });
      await page.getByTestId("inventory-item").nth(4).scrollIntoViewIfNeeded();
      await page.screenshot({ path: "../artifacts/inventory-review/inventory-items-402px.png" });
    }
  });
}

test("category, search, stock and sort controls combine correctly", async ({ page }) => {
  await prepare(page);
  await page.getByRole("button", { name: "Gear category", exact: true }).click();
  await expect(page.getByTestId("inventory-item")).toHaveCount(3);
  await page.getByRole("checkbox", { name: "In stock only" }).check();
  await expect(page.getByTestId("inventory-item")).toHaveCount(2);
  await page.getByRole("combobox", { name: "Sort inventory" }).selectOption("quantity-desc");
  await expect(page.getByTestId("inventory-item").first()).toContainText("3,240");
  await page.getByRole("searchbox", { name: "Search inventory" }).fill("ARCANE augmented");
  await expect(page.getByTestId("inventory-item")).toHaveCount(1);
  await page.getByRole("searchbox").fill("not an item");
  await expect(page.getByText("No matching resources", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Clear filters", exact: true }).click();
  await expect(page.getByTestId("inventory-item")).toHaveCount(10);
  await expect(page.getByRole("searchbox")).toBeFocused();
  await page.getByRole("searchbox").fill("currency-1");
  await expect(page.getByTestId("inventory-item")).toHaveCount(1);
  await expect(page.getByTestId("inventory-item")).toContainText("Raid Credits");
});

test("unknown quantity and unnamed items are not presented as zero", async ({ page }) => {
  await prepare(page);
  await expect(page.getByTestId("inventory-item").filter({ hasText: "unlabelled-1" })).toContainText("Not reported");
  await expect(page.getByTestId("inventory-item").filter({ hasText: "unlabelled-1" })).toContainText("Item name not provided");
  await expect(page.getByTestId("inventory-item").filter({ hasText: "Empty Gear" })).toContainText("None on hand");
  await page.getByRole("checkbox", { name: "In stock only" }).check();
  await expect(page.getByTestId("inventory-item")).toHaveCount(8);
});

test("all unreported balances keep summary stock unknown", async ({ page }) => {
  await prepare(page, { data: [{ id: "unknown", name: "Unknown balance", category: "Gear", quantity: null }] });
  await expect(page.getByTestId("inventory-in-stock")).toHaveText("—");
  await expect(page.getByText("1 balance not reported. Stock count is incomplete.")).toBeVisible();
});

for (const status of [401, 403]) {
  test(`inventory access error ${status} offers a recovery path`, async ({ page }) => {
    await prepare(page, { error: "Access unavailable" }, status);
    const error = page.getByTestId("inventory-error");
    await expect(error).toBeVisible();
    await expect(error.getByRole("link")).toHaveAttribute("href", status === 401 ? "/api/auth/login" : "/subscribe");
  });
}

test("failed refresh keeps previous snapshot clearly marked, retry recovers", async ({ page }) => {
  await prepare(page);
  await page.route("**/api/msf/inventory", route => route.fulfill({ status: 502, json: { error: "Offline" } }));
  await page.getByRole("button", { name: "Refresh inventory" }).click();
  await expect(page.getByTestId("inventory-error")).toContainText("Showing your last successful load");
  await expect(page.getByTestId("inventory-item")).toHaveCount(10);
  await page.route("**/api/msf/inventory", route => route.fulfill({ json: { data: data.slice(0, 1) } }));
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(page.getByTestId("inventory-error")).toHaveCount(0);
  await expect(page.getByTestId("inventory-item")).toHaveCount(1);
});

test("malformed responses differ from a valid empty inventory", async ({ page }) => {
  await prepare(page, {});
  await expect(page.getByTestId("inventory-error")).toBeVisible();
  await expect(page.getByTestId("inventory-in-stock")).toHaveText("—");
  await expect(page.getByTestId("inventory-empty")).toHaveCount(0);
  await page.route("**/api/msf/inventory", route => route.fulfill({ json: { data: [] } }));
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(page.getByText("No items reported yet")).toBeVisible();
  await expect(page.getByTestId("inventory-in-stock")).toHaveText("0");
});

test("long catalogs load in batches and filters reset the visible batch", async ({ page }) => {
  const manyItems = Array.from({ length: 85 }, (_, i) => ({ id: `gear-${i}`, name: `Gear ${i}`, category: "Gear", quantity: i }));
  await prepare(page, { data: manyItems });
  await expect(page.getByTestId("inventory-item")).toHaveCount(40);
  await page.getByRole("button", { name: /Show 40 more/ }).click();
  await expect(page.getByTestId("inventory-item")).toHaveCount(80);
  await expect(page.getByTestId("inventory-item").nth(40)).toBeFocused();
  await page.getByRole("searchbox").fill("Gear 84");
  await expect(page.getByTestId("inventory-item")).toHaveCount(1);
  await page.getByRole("button", { name: "Clear search" }).click();
  await expect(page.getByTestId("inventory-item")).toHaveCount(40);
});
