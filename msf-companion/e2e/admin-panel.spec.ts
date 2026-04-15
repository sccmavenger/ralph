import { test, expect } from "@playwright/test";
import { sealData } from "iron-session";
import fs from "fs";
import path from "path";

// ── Helpers ──────────────────────────────────────────────────────────────────

interface TestCommander {
  id: string;
  scopelyId: string;
  displayName: string | null;
  email: string | null;
  subscriptionTier: string;
  disabled: boolean;
}

function getEnvVar(name: string): string {
  const envPath = path.join(__dirname, "..", ".env");
  const envContent = fs.readFileSync(envPath, "utf8");
  const match = envContent.match(new RegExp(`${name}="([^"]+)"`));
  if (!match) throw new Error(`${name} not found in .env`);
  return match[1];
}

async function getAdminSessionCookie(): Promise<string> {
  const secret = getEnvVar("ADMIN_SESSION_SECRET");
  return sealData({ isAdmin: true }, { password: secret, ttl: 86400 });
}

async function setAdminSession(
  context: import("@playwright/test").BrowserContext
) {
  const sealed = await getAdminSessionCookie();
  await context.addCookies([
    {
      name: "admin-session",
      value: sealed,
      domain: "localhost",
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
}

async function seedTestCommanders(
  request: import("@playwright/test").APIRequestContext
): Promise<TestCommander[]> {
  const res = await request.post("/api/e2e/admin-seed");
  expect(res.ok()).toBe(true);
  const data = await res.json();
  return data.commanders;
}

async function cleanupTestCommanders(
  request: import("@playwright/test").APIRequestContext
) {
  await request.delete("/api/e2e/admin-seed");
}

function findCommander(
  commanders: TestCommander[],
  scopelySuffix: string
): TestCommander {
  const found = commanders.find((c) =>
    c.scopelyId.endsWith(scopelySuffix)
  );
  if (!found) throw new Error(`Test commander not found: ${scopelySuffix}`);
  return found;
}

// ── Tests ────────────────────────────────────────────────────────────────────

test.describe("Admin Panel E2E Tests", () => {
  // TC-001: Admin login with correct password → redirects to /admin/dashboard
  test("TC-001: admin login with correct password", async ({ page }) => {
    const adminPassword = getEnvVar("ADMIN_PASSWORD");

    await page.goto("/admin");
    await expect(page.locator("h1")).toContainText("Admin Panel");

    await page.locator("#admin-password").fill(adminPassword);
    await page.locator('button[type="submit"]').click();

    await page.waitForURL("**/admin/dashboard", { timeout: 10000 });
    await expect(page.locator('[data-testid="admin-commander-table"]')).toBeVisible({ timeout: 10000 });
  });

  // TC-002: Admin login with wrong password → stays on /admin with error
  test("TC-002: admin login with wrong password", async ({ page }) => {
    await page.goto("/admin");

    await page.locator("#admin-password").fill("wrong-password-123");
    await page.locator('button[type="submit"]').click();

    // Should stay on /admin and show error
    const errorAlert = page.locator('p[role="alert"]');
    await expect(errorAlert).toBeVisible();
    await expect(errorAlert).toContainText("Invalid password");
    expect(page.url()).toContain("/admin");
    expect(page.url()).not.toContain("/dashboard");
  });

  // TC-003: Unauthenticated access to /admin/dashboard → redirects to /admin
  test("TC-003: unauthenticated /admin/dashboard redirects to /admin", async ({
    page,
  }) => {
    // Clear any admin cookies
    await page.context().clearCookies({
      name: "admin-session",
    });

    await page.goto("/admin/dashboard");

    // Should redirect to /admin login
    await page.waitForURL("**/admin", { timeout: 10000 });
    expect(page.url()).toMatch(/\/admin$/);
    await expect(page.locator("#admin-password")).toBeVisible();
  });

  // TC-004 through TC-008 require seeded test commanders
  test.describe("Commander management", () => {
    let commanders: TestCommander[];

    test.beforeAll(async ({ request }) => {
      commanders = await seedTestCommanders(request);
    });

    test.afterAll(async ({ request }) => {
      await cleanupTestCommanders(request);
    });

    test.beforeEach(async ({ page }) => {
      await setAdminSession(page.context());
    });

    // TC-004: Commander table displays commanders with correct columns
    test("TC-004: commander table displays with correct columns", async ({
      page,
    }) => {
      await page.goto("/admin/dashboard");
      await expect(
        page.locator('[data-testid="admin-commander-table"]')
      ).toBeVisible();

      // Verify column headers
      const headers = page.locator(
        '[data-testid="admin-commander-table"] thead th'
      );
      const headerTexts = await headers.allTextContents();
      expect(headerTexts).toContain("Display Name");
      expect(headerTexts).toContain("Scopely ID");
      expect(headerTexts).toContain("Email");
      expect(headerTexts).toContain("Tier");
      expect(headerTexts).toContain("Last Login");
      expect(headerTexts).toContain("Status");
      expect(headerTexts).toContain("Actions");

      // Verify test commander rows exist
      const activeFree = findCommander(commanders, "active-free");
      await expect(
        page.locator(
          `[data-testid="admin-commander-row-${activeFree.id}"]`
        )
      ).toBeVisible();

      // Verify count label includes commander count
      await expect(page.locator("text=/\\d+ Commander/")).toBeVisible();
    });

    // TC-005: Search filter narrows table results by display name
    test("TC-005: search filter narrows results", async ({ page }) => {
      await page.goto("/admin/dashboard");
      await expect(
        page.locator('[data-testid="admin-commander-table"]')
      ).toBeVisible();

      const searchInput = page.locator('[data-testid="admin-search"]');
      await searchInput.fill("TestCommander Premium");

      // Premium commander row should be visible
      const premium = findCommander(commanders, "premium");
      await expect(
        page.locator(
          `[data-testid="admin-commander-row-${premium.id}"]`
        )
      ).toBeVisible();

      // Active Free commander should be filtered out (different name)
      const activeFree = findCommander(commanders, "active-free");
      await expect(
        page.locator(
          `[data-testid="admin-commander-row-${activeFree.id}"]`
        )
      ).not.toBeVisible();

      // Clear search
      await searchInput.clear();

      // All test commanders should be visible again
      await expect(
        page.locator(
          `[data-testid="admin-commander-row-${activeFree.id}"]`
        )
      ).toBeVisible();
    });

    // TC-006: Disable button changes to Enable and status updates to Disabled
    test("TC-006: disable and enable commander", async ({ page }) => {
      await page.goto("/admin/dashboard");
      await expect(
        page.locator('[data-testid="admin-commander-table"]')
      ).toBeVisible();

      const activeFree = findCommander(commanders, "active-free");
      const row = page.locator(
        `[data-testid="admin-commander-row-${activeFree.id}"]`
      );

      // Should show Active status and Disable button
      await expect(
        page.locator(`[data-testid="admin-status-badge-${activeFree.id}"]`)
      ).toContainText("Active");
      const disableBtn = page.locator(
        `[data-testid="admin-toggle-disable-${activeFree.id}"]`
      );
      await expect(disableBtn).toContainText("Disable");

      // Accept the confirmation dialog
      page.once("dialog", (dialog) => dialog.accept());
      await disableBtn.click();

      // Should update to Disabled status and Enable button
      await expect(
        page.locator(`[data-testid="admin-status-badge-${activeFree.id}"]`)
      ).toContainText("Disabled");
      const enableBtn = page.locator(
        `[data-testid="admin-toggle-disable-${activeFree.id}"]`
      );
      await expect(enableBtn).toContainText("Enable");

      // Re-enable the commander
      await enableBtn.click();
      await expect(
        page.locator(`[data-testid="admin-status-badge-${activeFree.id}"]`)
      ).toContainText("Active");
      await expect(
        page.locator(
          `[data-testid="admin-toggle-disable-${activeFree.id}"]`
        )
      ).toContainText("Disable");
    });

    // TC-007: Grant Premium / Revoke Premium toggles the tier badge
    test("TC-007: toggle premium tier", async ({ page }) => {
      await page.goto("/admin/dashboard");
      await expect(
        page.locator('[data-testid="admin-commander-table"]')
      ).toBeVisible();

      const activeFree = findCommander(commanders, "active-free");

      // Should show FREE tier badge and "Grant Premium" button
      await expect(
        page.locator(`[data-testid="admin-tier-badge-${activeFree.id}"]`)
      ).toContainText("FREE");
      const grantBtn = page.locator(
        `[data-testid="admin-toggle-tier-${activeFree.id}"]`
      );
      await expect(grantBtn).toContainText("Grant Premium");

      // Grant Premium
      await grantBtn.click();

      // Should update to PREMIUM tier badge
      await expect(
        page.locator(`[data-testid="admin-tier-badge-${activeFree.id}"]`)
      ).toContainText("PREMIUM");
      const revokeBtn = page.locator(
        `[data-testid="admin-toggle-tier-${activeFree.id}"]`
      );
      await expect(revokeBtn).toContainText("Revoke Premium");

      // Revoke Premium — needs confirmation
      page.once("dialog", (dialog) => dialog.accept());
      await revokeBtn.click();

      await expect(
        page.locator(`[data-testid="admin-tier-badge-${activeFree.id}"]`)
      ).toContainText("FREE");
    });

    // TC-008: Delete commander removes the row from the table
    test("TC-008: delete commander removes row", async ({ page }) => {
      await page.goto("/admin/dashboard");
      await expect(
        page.locator('[data-testid="admin-commander-table"]')
      ).toBeVisible();

      const noEmail = findCommander(commanders, "no-email");
      const row = page.locator(
        `[data-testid="admin-commander-row-${noEmail.id}"]`
      );
      await expect(row).toBeVisible();

      // Accept the confirmation dialog
      page.once("dialog", (dialog) => dialog.accept());
      const deleteBtn = page.locator(
        `[data-testid="admin-delete-${noEmail.id}"]`
      );
      await deleteBtn.click();

      // Row should disappear
      await expect(row).not.toBeVisible();
    });
  });

  // TC-009: Admin logout clears session and redirects to /admin
  test("TC-009: admin logout clears session", async ({ page }) => {
    await setAdminSession(page.context());
    await page.goto("/admin/dashboard");
    await expect(
      page.locator('[data-testid="admin-commander-table"]')
    ).toBeVisible({ timeout: 10000 });

    // Click Log Out button
    await page.locator('button:has-text("Log Out")').click();

    // Should redirect to /admin login page
    await page.waitForURL("**/admin", { timeout: 10000 });
    expect(page.url()).toMatch(/\/admin$/);
    await expect(page.locator("#admin-password")).toBeVisible();

    // Verify session is cleared — going back to dashboard should redirect
    await page.goto("/admin/dashboard");
    await page.waitForURL("**/admin", { timeout: 10000 });
    expect(page.url()).toMatch(/\/admin$/);
  });

  // TC-010: Disabled user accessing /dashboard sees blocked message
  test("TC-010: disabled user sees blocked message on dashboard", async ({
    page,
    request,
  }) => {
    // Seed a disabled commander
    const commanders = await seedTestCommanders(request);
    const disabledCommander = findCommander(commanders, "disabled");

    // Create a user session for the disabled commander
    const sessionSecret = getEnvVar("SESSION_SECRET");
    const sealed = await sealData(
      {
        accessToken: "fake-access-token",
        refreshToken: "fake-refresh-token",
        tokenExpiresAt: Date.now() + 3600000,
        scopelyId: disabledCommander.scopelyId,
      },
      { password: sessionSecret }
    );

    await page.context().addCookies([
      {
        name: "msf-session",
        value: sealed,
        domain: "localhost",
        path: "/",
        httpOnly: true,
        sameSite: "Lax",
      },
    ]);

    // Fake standalone mode to prevent install modal
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
            dispatchEvent: () => false,
          } as MediaQueryList;
        }
        return origMatchMedia.call(window, query);
      };
    });

    // Navigate to /dashboard — should see disabled message
    await page.goto("/dashboard");
    await expect(
      page.locator("text=Your account has been disabled")
    ).toBeVisible();

    // Clean up
    await cleanupTestCommanders(request);
  });
});
