import { test, expect } from "@playwright/test";

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Mock all API routes so tests don't depend on live server data */
async function mockAppRoutes(page: import("@playwright/test").Page) {
  // Mock roster API
  await page.route("**/api/msf/roster*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ characters: [], total: 0 }),
    }),
  );
  // Mock inventory API
  await page.route("**/api/msf/inventory*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([]),
    }),
  );
  // Mock planner APIs
  await page.route("**/api/msf/planner/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([]),
    }),
  );
  // Mock player card
  await page.route("**/api/msf/player/card*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: { name: "TestUser", icon: null } }),
    }),
  );
}

// ── Tests ───────────────────────────────────────────────────────────────────────

test.describe("Install App Modal — E2E Tests", () => {
  // TC-001: Modal NOT visible in standalone mode
  test("TC-001: modal not visible in standalone mode", async ({ page }) => {
    await mockAppRoutes(page);

    // Mock standalone detection: navigator.standalone + matchMedia
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "standalone", {
        get: () => true,
        configurable: true,
      });
      const origMatchMedia = window.matchMedia;
      window.matchMedia = function (query: string) {
        if (query === "(display-mode: standalone)") {
          return {
            matches: true,
            media: query,
            onchange: null,
            addListener: () => {},
            removeListener: () => {},
            addEventListener: () => {},
            removeEventListener: () => {},
            dispatchEvent: () => true,
          } as MediaQueryList;
        }
        return origMatchMedia.call(window, query);
      };
    });

    await page.goto("/dashboard");
    await page.waitForTimeout(500);

    // Modal should NOT be visible
    await expect(page.getByTestId("install-app-modal")).not.toBeVisible();
  });

  // TC-002: Modal visible with iOS instructions
  test("TC-002: modal visible with iOS instructions", async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      userAgent:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
      storageState: "./e2e/auth/session.json",
    });
    const page = await context.newPage();
    await mockAppRoutes(page);

    // Ensure NOT standalone
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "standalone", {
        get: () => false,
        configurable: true,
      });
    });

    await page.goto("/dashboard");

    // Modal visible
    await expect(page.getByTestId("install-app-modal")).toBeVisible();
    // App icon visible
    await expect(page.getByTestId("install-app-icon")).toBeVisible();
    // iOS-specific instructions mentioning Share
    const instructions = page.getByTestId("install-instructions");
    await expect(instructions).toContainText("Share");
    // Dismiss button visible
    await expect(page.getByTestId("install-dismiss")).toBeVisible();

    await context.close();
  });

  // TC-003: Modal visible with Android instructions
  test("TC-003: modal visible with Android instructions", async ({
    browser,
  }) => {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      userAgent:
        "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
      storageState: "./e2e/auth/session.json",
    });
    const page = await context.newPage();
    await mockAppRoutes(page);

    await page.goto("/dashboard");

    // Modal visible
    await expect(page.getByTestId("install-app-modal")).toBeVisible();
    // App icon visible
    await expect(page.getByTestId("install-app-icon")).toBeVisible();
    // Android-specific instructions mentioning menu
    const instructions = page.getByTestId("install-instructions");
    await expect(instructions).toContainText(/menu|Install/);
    // Dismiss button visible
    await expect(page.getByTestId("install-dismiss")).toBeVisible();

    await context.close();
  });

  // TC-004: Dismiss button hides the modal
  test("TC-004: dismiss button hides the modal", async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      userAgent:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
      storageState: "./e2e/auth/session.json",
    });
    const page = await context.newPage();
    await mockAppRoutes(page);
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "standalone", {
        get: () => false,
        configurable: true,
      });
    });

    await page.goto("/dashboard");
    await expect(page.getByTestId("install-app-modal")).toBeVisible();

    // Click dismiss
    await page.getByTestId("install-dismiss").click();

    // Modal hidden
    await expect(page.getByTestId("install-app-modal")).not.toBeVisible();

    await context.close();
  });

  // TC-005: Modal reappears after page reload
  test("TC-005: modal reappears after page reload", async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      userAgent:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
      storageState: "./e2e/auth/session.json",
    });
    const page = await context.newPage();
    await mockAppRoutes(page);
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "standalone", {
        get: () => false,
        configurable: true,
      });
    });

    await page.goto("/dashboard");
    await expect(page.getByTestId("install-app-modal")).toBeVisible();

    // Dismiss
    await page.getByTestId("install-dismiss").click();
    await expect(page.getByTestId("install-app-modal")).not.toBeVisible();

    // Reload page — modal should reappear (session-based state)
    await page.reload();
    await expect(page.getByTestId("install-app-modal")).toBeVisible();

    await context.close();
  });

  // TC-006: Modal renders above the bottom tab bar
  test("TC-006: modal renders above the bottom tab bar", async ({
    browser,
  }) => {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      userAgent:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
      storageState: "./e2e/auth/session.json",
    });
    const page = await context.newPage();
    await mockAppRoutes(page);
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "standalone", {
        get: () => false,
        configurable: true,
      });
    });

    await page.goto("/dashboard");
    await expect(page.getByTestId("install-app-modal")).toBeVisible();

    // The modal's z-index (z-50) should be above the tab bar (z-40)
    const modalZ = await page.getByTestId("install-app-modal").evaluate((el) => {
      return parseInt(getComputedStyle(el.parentElement!).zIndex || "0");
    });
    expect(modalZ).toBeGreaterThanOrEqual(50);

    await context.close();
  });

  // TC-007: Android native install button triggers prompt
  test("TC-007: android native install button triggers prompt", async ({
    browser,
  }) => {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      userAgent:
        "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
      storageState: "./e2e/auth/session.json",
    });
    const page = await context.newPage();
    await mockAppRoutes(page);

    await page.goto("/dashboard");

    // Modal should be visible initially with manual instructions
    await expect(page.getByTestId("install-app-modal")).toBeVisible();

    // Now dispatch beforeinstallprompt from the page context
    await page.evaluate(() => {
      const evt = new Event("beforeinstallprompt", { cancelable: true });
      (evt as unknown as { prompt: () => Promise<void> }).prompt = () => {
        (window as unknown as { __installPrompted: boolean }).__installPrompted = true;
        return Promise.resolve();
      };
      (evt as unknown as { userChoice: Promise<{ outcome: string }> }).userChoice = Promise.resolve({ outcome: "accepted" });
      window.dispatchEvent(evt);
    });

    // Wait for the install button to appear
    const installBtn = page.getByTestId("install-action-btn");
    await expect(installBtn).toBeVisible({ timeout: 5000 });
    await expect(installBtn).toContainText("Install");

    // Click install button
    await installBtn.click();

    // Verify prompt was called
    const prompted = await page.evaluate(
      () => (window as unknown as { __installPrompted: boolean }).__installPrompted,
    );
    expect(prompted).toBe(true);

    await context.close();
  });

  // TC-008: Unknown platform shows generic instructions
  test("TC-008: unknown platform shows generic instructions", async ({
    browser,
  }) => {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      userAgent:
        "Mozilla/5.0 (Unknown; U; Linux x86_64) AppleWebKit/537.36",
      storageState: "./e2e/auth/session.json",
    });
    const page = await context.newPage();
    await mockAppRoutes(page);

    await page.goto("/dashboard");
    await expect(page.getByTestId("install-app-modal")).toBeVisible();

    const instructions = page.getByTestId("install-instructions");
    await expect(instructions).toContainText("Add MSF Companion to your home screen");

    await context.close();
  });

  // TC-009: Modal NOT visible when user agent is WebView
  test("TC-009: modal not visible in WebView (FBAN/FBIOS)", async ({
    browser,
  }) => {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      userAgent:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBForIPhone;FBAV/450.0]",
      storageState: "./e2e/auth/session.json",
    });
    const page = await context.newPage();
    await mockAppRoutes(page);

    await page.goto("/dashboard");
    await page.waitForTimeout(500);

    // Modal should NOT be visible in WebView
    await expect(page.getByTestId("install-app-modal")).not.toBeVisible();

    await context.close();
  });

  // TC-010: Escape key dismisses the modal
  test("TC-010: escape key dismisses the modal", async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      userAgent:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
      storageState: "./e2e/auth/session.json",
    });
    const page = await context.newPage();
    await mockAppRoutes(page);
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "standalone", {
        get: () => false,
        configurable: true,
      });
    });

    await page.goto("/dashboard");
    await expect(page.getByTestId("install-app-modal")).toBeVisible();

    // Press Escape
    await page.keyboard.press("Escape");

    // Modal hidden
    await expect(page.getByTestId("install-app-modal")).not.toBeVisible();

    await context.close();
  });

  // TC-011: Backdrop click dismisses the modal
  test("TC-011: backdrop click dismisses the modal", async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      userAgent:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
      storageState: "./e2e/auth/session.json",
    });
    const page = await context.newPage();
    await mockAppRoutes(page);
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "standalone", {
        get: () => false,
        configurable: true,
      });
    });

    await page.goto("/dashboard");
    await expect(page.getByTestId("install-app-modal")).toBeVisible();

    // Click on backdrop (top area, above the modal)
    await page.mouse.click(195, 100);

    // Modal hidden
    await expect(page.getByTestId("install-app-modal")).not.toBeVisible();

    await context.close();
  });
});
