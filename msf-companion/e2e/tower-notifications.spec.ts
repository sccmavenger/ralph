import { test, expect, type Page } from "@playwright/test";

async function dismissModals(page: Page) {
  const skipBtn = page.getByText("Skip for now");
  if (await skipBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await skipBtn.click();
    await page.waitForTimeout(500);
  }
  const skipTour = page.getByText("Skip Tour");
  if (await skipTour.isVisible({ timeout: 1000 }).catch(() => false)) {
    await skipTour.click();
    await page.waitForTimeout(500);
  }
  const installDismiss = page.locator("[data-testid='install-dismiss']");
  if (await installDismiss.isVisible({ timeout: 1000 }).catch(() => false)) {
    await installDismiss.click();
    await page.waitForTimeout(500);
  }
}

test.describe("Tower Notification Preferences", () => {
  test("notification preference toggle visible in profile", async ({ page }) => {
    await page.goto("/profile");
    await dismissModals(page);

    const prefSection = page.locator("[data-testid='notification-preferences']");
    await expect(prefSection).toBeVisible({ timeout: 10000 });
    await expect(prefSection).toContainText("Tower event notifications");

    const toggle = page.locator("[data-testid='tower-notifications-toggle']");
    await expect(toggle).toBeVisible();
  });

  test("notification toggle is functional", async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.removeItem("tower-notifications");
    });
    await page.goto("/profile");
    await dismissModals(page);

    const toggle = page.locator("[data-testid='tower-notifications-toggle']");
    await expect(toggle).toBeVisible({ timeout: 10000 });

    // Should be checked by default
    await expect(toggle).toBeChecked();

    // Uncheck it
    await toggle.uncheck();
    await expect(toggle).not.toBeChecked();

    // Verify localStorage was updated
    const stored = await page.evaluate(() => localStorage.getItem("tower-notifications"));
    expect(stored).toBe("false");
  });
});
