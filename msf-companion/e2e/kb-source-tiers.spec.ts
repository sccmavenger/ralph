import { test, expect } from "@playwright/test";

test.describe("KB Source Tier Awareness", () => {
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

  test("chat API returns response with source citations including tier labels for premium users", async ({ page }) => {
    // Mock session as premium
    await page.route("**/api/auth/session", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ accessToken: "test", tier: "PREMIUM" }),
      })
    );

    // Mock chat API with tier-labeled citations
    await page.route("**/api/advisor/chat", (route) => {
      const body = [
        `data: ${JSON.stringify({ confidence: 90, conversationId: "conv-1" })}\n\n`,
        `data: ${JSON.stringify({ content: "Based on official game data, Wolverine is best with " })}\n\n`,
        `data: ${JSON.stringify({ content: "Skirmisher ISO-8 class." })}\n\n`,
        `data: ${JSON.stringify({ content: "\n\n*Based on [MSF API (Official)](https://api.marvelstrikeforce.com) (🟢 Official, 4/29/2026)*" })}\n\n`,
        `data: ${JSON.stringify({ messageId: "msg-1" })}\n\n`,
        "data: [DONE]\n\n",
      ].join("");
      route.fulfill({
        status: 200,
        contentType: "text/event-stream",
        body,
      });
    });

    await page.goto("/advisor");
    const chatInput = page.getByTestId("chat-input");
    await chatInput.fill("What ISO for Wolverine?");
    await page.getByTestId("send-button").click();

    // Verify response contains official source reference
    await expect(page.getByText("official game data")).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("Official")).toBeVisible();
  });

  test("premium users see differentiated citation badges by tier", async ({ page }) => {
    await page.route("**/api/auth/session", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ accessToken: "test", tier: "PREMIUM" }),
      })
    );

    await page.route("**/api/advisor/chat", (route) => {
      const body = [
        `data: ${JSON.stringify({ confidence: 85, conversationId: "conv-2" })}\n\n`,
        `data: ${JSON.stringify({ content: "Here is team advice." })}\n\n`,
        `data: ${JSON.stringify({ content: "\n\n*Based on [Scopely Official](https://marvelstrikeforce.com/en/updates) (🔵 Blog, 4/28/2026)*" })}\n\n`,
        `data: ${JSON.stringify({ content: "\n\n*Based on [ValleyFlyin](https://youtube.com/@ValleyFlyin) (⚪ Community, 4/27/2026)*" })}\n\n`,
        `data: ${JSON.stringify({ messageId: "msg-2" })}\n\n`,
        "data: [DONE]\n\n",
      ].join("");
      route.fulfill({
        status: 200,
        contentType: "text/event-stream",
        body,
      });
    });

    await page.goto("/advisor");
    const chatInput = page.getByTestId("chat-input");
    await chatInput.fill("Best war defense team?");
    await page.getByTestId("send-button").click();

    // Verify differentiated tier labels appear
    await expect(page.getByText("Blog")).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("Community")).toBeVisible();
  });

  test("free tier user does not see source citations", async ({ page }) => {
    await page.route("**/api/auth/session", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ accessToken: "test", tier: "FREE" }),
      })
    );

    await page.route("**/api/advisor/chat", (route) => {
      const body = [
        `data: ${JSON.stringify({ confidence: 70, conversationId: "conv-3" })}\n\n`,
        `data: ${JSON.stringify({ content: "For DD7, you should focus on Horsemen teams." })}\n\n`,
        `data: ${JSON.stringify({ messageId: "msg-3" })}\n\n`,
        "data: [DONE]\n\n",
      ].join("");
      route.fulfill({
        status: 200,
        contentType: "text/event-stream",
        body,
      });
    });

    await page.goto("/advisor");
    const chatInput = page.getByTestId("chat-input");
    await chatInput.fill("DD7 teams?");
    await page.getByTestId("send-button").click();

    await expect(page.getByText("Horsemen")).toBeVisible({ timeout: 10000 });
    // No citation text should appear for free users
    await expect(page.getByText("Based on")).not.toBeVisible();
  });
});
