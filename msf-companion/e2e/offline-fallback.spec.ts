import { test, expect } from "@playwright/test";

test.describe("Offline Fallback", () => {
  test.beforeEach(async ({ page }) => {
    // Suppress install app modal
    await page.addInitScript(() => {
      Object.defineProperty(window.navigator, "standalone", { value: true });
      const origMatchMedia = window.matchMedia.bind(window);
      window.matchMedia = (query: string) => {
        if (query === "(display-mode: standalone)") {
          return { matches: true, media: query, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => true } as MediaQueryList;
        }
        return origMatchMedia(query);
      };
    });
  });

  test("when AI returns 503, fallback page is shown", async ({ page }) => {
    // Mock chat API returning 503
    await page.route("**/api/advisor/chat", async (route) => {
      await route.fulfill({ status: 503, body: "Service Unavailable" });
    });

    // Mock fallback API
    await page.route("**/api/advisor/fallback", async (route) => {
      await route.fulfill({
        status: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topTeams: [
            { name: "Eternals", reason: "Top raid team", priority: 1 },
            { name: "Darkhold", reason: "Crucible champions", priority: 2 },
          ],
          farmingPriorities: [
            { character: "Kestrel", location: "Nexus 7-3", reason: "Versatile" },
          ],
          eventRecommendations: [
            { event: "Blitz", recommendation: "Rotate top teams" },
          ],
          generatedAt: new Date().toISOString(),
        }),
      });
    });

    await page.goto("/advisor");
    await page.getByTestId("chat-input").fill("What team should I build?");
    await page.getByTestId("send-button").click();

    // Fallback banner should appear
    await expect(page.getByTestId("fallback-banner")).toBeVisible();
    await expect(page.getByText("temporarily unavailable")).toBeVisible();

    // Fallback content should be visible
    await expect(page.getByTestId("fallback-content")).toBeVisible();
    await expect(page.getByText("Eternals")).toBeVisible();
    await expect(page.getByText("Kestrel")).toBeVisible();
  });

  test("fallback content includes team recommendations and farming priorities", async ({ page }) => {
    await page.route("**/api/advisor/chat", async (route) => {
      await route.fulfill({ status: 503, body: "Service Unavailable" });
    });

    await page.route("**/api/advisor/fallback", async (route) => {
      await route.fulfill({
        status: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topTeams: [
            { name: "Eternals", reason: "Top raid team", priority: 1 },
          ],
          farmingPriorities: [
            { character: "Gladiator", location: "Campaign 8-6", reason: "Raid essential" },
          ],
          eventRecommendations: [],
          generatedAt: new Date().toISOString(),
        }),
      });
    });

    await page.goto("/advisor");
    await page.getByTestId("chat-input").fill("Test");
    await page.getByTestId("send-button").click();

    await expect(page.getByText("Top Teams to Build")).toBeVisible();
    await expect(page.getByText("Farming Priorities")).toBeVisible();
    await expect(page.getByText("Gladiator")).toBeVisible();
  });

  test("fallback page renders correctly on mobile viewport", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });

    await page.route("**/api/advisor/chat", async (route) => {
      await route.fulfill({ status: 503, body: "Service Unavailable" });
    });

    await page.route("**/api/advisor/fallback", async (route) => {
      await route.fulfill({
        status: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topTeams: [{ name: "Eternals", reason: "Best", priority: 1 }],
          farmingPriorities: [{ character: "Kestrel", location: "N7-3", reason: "Good" }],
          eventRecommendations: [],
          generatedAt: new Date().toISOString(),
        }),
      });
    });

    await page.goto("/advisor");
    await page.getByTestId("chat-input").fill("Test");
    await page.getByTestId("send-button").click();

    await expect(page.getByTestId("fallback-content")).toBeVisible();

    const body = page.locator("body");
    const scrollWidth = await body.evaluate((el) => el.scrollWidth);
    const clientWidth = await body.evaluate((el) => el.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
  });
});
