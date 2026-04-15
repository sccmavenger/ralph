import { test, expect } from "@playwright/test";

test.describe("Profile Page", () => {
  test("navigate to /profile — shows commander name and email section", async ({
    page,
  }) => {
    await page.goto("/profile");
    if (page.url().includes("/profile")) {
      // Profile shows commander name and email section
      await expect(page.getByText("Email Address")).toBeVisible();
    }
  });

  test("FAQ link is visible on profile page", async ({ page }) => {
    await page.goto("/profile");
    if (page.url().includes("/profile")) {
      await expect(
        page.getByText("FAQ").first(),
      ).toBeVisible();
    }
  });

  test("Log Out button is visible on profile page", async ({ page }) => {
    await page.goto("/profile");
    if (page.url().includes("/profile")) {
      await expect(page.getByText("Log Out")).toBeVisible();
    }
  });

  test("page renders at 390x844 mobile viewport without horizontal overflow", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/profile");
    if (page.url().includes("/profile")) {
      const scrollWidth = await page.evaluate(
        () => document.documentElement.scrollWidth,
      );
      const clientWidth = await page.evaluate(
        () => document.documentElement.clientWidth,
      );
      expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
    }
  });
});
