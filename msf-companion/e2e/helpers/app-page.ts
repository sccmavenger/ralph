import type { Page } from "@playwright/test";

/** Keep feature tests focused on the page under test, not the PWA install flow. */
export async function suppressInstallPrompt(page: Page): Promise<void> {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "standalone", {
      configurable: true,
      get: () => true,
    });
  });
}
