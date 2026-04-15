import { test as setup, expect } from "@playwright/test";
import { sealData } from "iron-session";
import fs from "fs";
import path from "path";

const authFile = path.join(__dirname, "auth", "session.json");
const tokensFile = path.join(__dirname, "auth", "tokens.json");

/**
 * Global setup: Create an authenticated Playwright session using captured tokens.
 *
 * First-time setup:
 *   1. Log in at http://localhost:3000 in your browser
 *   2. Visit http://localhost:3000/api/e2e/capture
 *   3. Save the JSON response to e2e/auth/tokens.json
 *
 * The setup seals the tokens into an iron-session cookie and saves
 * the storage state for all subsequent tests to reuse.
 */
setup("authenticate via captured tokens", async ({ browser }) => {
  // Read captured tokens
  if (!fs.existsSync(tokensFile)) {
    throw new Error(
      "Missing e2e/auth/tokens.json. Log in at http://localhost:3000, " +
        "then visit http://localhost:3000/api/e2e/capture and save the JSON to e2e/auth/tokens.json"
    );
  }

  const tokens = JSON.parse(fs.readFileSync(tokensFile, "utf8"));

  if (!tokens.accessToken || !tokens.refreshToken) {
    throw new Error("tokens.json is missing accessToken or refreshToken. Re-capture from /api/e2e/capture");
  }

  // Read SESSION_SECRET from .env
  const envPath = path.join(__dirname, "..", ".env");
  const envContent = fs.readFileSync(envPath, "utf8");
  const secretMatch = envContent.match(/SESSION_SECRET="([^"]+)"/);
  if (!secretMatch) {
    throw new Error("SESSION_SECRET not found in .env");
  }
  const sessionSecret = secretMatch[1];

  // Seal the session data into an iron-session cookie value.
  // Always set tokenExpiresAt to 1 hour in the future so that the server-side
  // layout (getValidAccessToken) doesn't redirect to /api/auth/refresh before
  // the page even loads. The actual access token may still be expired at the
  // MSF API level — route handler errors will surface in the tests themselves.
  const sealed = await sealData(
    {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      tokenExpiresAt: Date.now() + 3600000,
      scopelyId: tokens.scopelyId,
    },
    { password: sessionSecret }
  );

  // Create a browser context with the session cookie
  const context = await browser.newContext();
  await context.addCookies([
    {
      name: "msf-session",
      value: sealed,
      domain: "localhost",
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);

  // Verify the session works by loading the dashboard
  const page = await context.newPage();
  await page.goto("/dashboard", { waitUntil: "networkidle", timeout: 15000 });

  const url = page.url();
  if (url.includes("/api/auth") || url.includes("hydra") || url.includes("scopely")) {
    throw new Error(
      "Session token expired (redirected to OAuth). Re-capture: log in at http://localhost:3000, " +
        "then visit /api/e2e/capture and update e2e/auth/tokens.json"
    );
  }

  // Also detect redirect to landing page (session destroyed)
  const pathname = new URL(url).pathname;
  if (pathname === "/") {
    throw new Error(
      "Session token expired (redirected to landing page). Re-capture: log in at http://localhost:3000, " +
        "then visit /api/e2e/capture and update e2e/auth/tokens.json"
    );
  }

  expect(url).toContain("localhost:3000");

  // Save the storage state for all test files
  await context.storageState({ path: authFile });
  await context.close();
});
