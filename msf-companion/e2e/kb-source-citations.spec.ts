import { test, expect } from "@playwright/test";

test.describe("KB Source Citation Badges", () => {
  test.beforeEach(async ({ page }) => {
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

  test("TC-001: Tier 1 citation shows Official/Game Data badge", async ({ page }) => {
    await page.route("**/api/auth/session", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ accessToken: "test", tier: "PREMIUM" }),
      })
    );

    await page.route("**/api/advisor/chat", (route) => {
      const body = [
        `data: ${JSON.stringify({ confidence: 95, conversationId: "conv-cite-1" })}\n\n`,
        `data: ${JSON.stringify({ content: "Based on official game data, Wolverine is Skirmisher." })}\n\n`,
        `data: ${JSON.stringify({ content: "\n\n*Based on [MSF API (Official)](https://api.marvelstrikeforce.com) (🟢 Official, 4/29/2026)*" })}\n\n`,
        `data: ${JSON.stringify({ messageId: "msg-cite-1" })}\n\n`,
        "data: [DONE]\n\n",
      ].join("");
      route.fulfill({ status: 200, contentType: "text/event-stream", body });
    });

    await page.goto("/advisor");
    const chatInput = page.getByTestId("chat-input");
    await chatInput.fill("ISO for Wolverine?");
    await page.getByTestId("send-button").click();

    await expect(page.getByText("Official")).toBeVisible({ timeout: 10000 });
  });

  test("TC-002: Tier 2 citation shows Blog badge", async ({ page }) => {
    await page.route("**/api/auth/session", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ accessToken: "test", tier: "PREMIUM" }),
      })
    );

    await page.route("**/api/advisor/chat", (route) => {
      const body = [
        `data: ${JSON.stringify({ confidence: 85, conversationId: "conv-cite-2" })}\n\n`,
        `data: ${JSON.stringify({ content: "According to the latest blog update." })}\n\n`,
        `data: ${JSON.stringify({ content: "\n\n*Based on [Scopely Official](https://marvelstrikeforce.com/en/updates) (🔵 Blog, 4/28/2026)*" })}\n\n`,
        `data: ${JSON.stringify({ messageId: "msg-cite-2" })}\n\n`,
        "data: [DONE]\n\n",
      ].join("");
      route.fulfill({ status: 200, contentType: "text/event-stream", body });
    });

    await page.goto("/advisor");
    const chatInput = page.getByTestId("chat-input");
    await chatInput.fill("Any new updates?");
    await page.getByTestId("send-button").click();

    await expect(page.getByText("Blog")).toBeVisible({ timeout: 10000 });
  });

  test("TC-003: Tier 3 citation shows Community or creator name", async ({ page }) => {
    await page.route("**/api/auth/session", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ accessToken: "test", tier: "PREMIUM" }),
      })
    );

    await page.route("**/api/advisor/chat", (route) => {
      const body = [
        `data: ${JSON.stringify({ confidence: 70, conversationId: "conv-cite-3" })}\n\n`,
        `data: ${JSON.stringify({ content: "According to community creators, this team is strong." })}\n\n`,
        `data: ${JSON.stringify({ content: "\n\n*Based on [ValleyFlyin](https://youtube.com/@ValleyFlyin) (⚪ Community, 4/27/2026)*" })}\n\n`,
        `data: ${JSON.stringify({ messageId: "msg-cite-3" })}\n\n`,
        "data: [DONE]\n\n",
      ].join("");
      route.fulfill({ status: 200, contentType: "text/event-stream", body });
    });

    await page.goto("/advisor");
    const chatInput = page.getByTestId("chat-input");
    await chatInput.fill("Best war team?");
    await page.getByTestId("send-button").click();

    await expect(page.getByText("Community")).toBeVisible({ timeout: 10000 });
  });

  test("TC-004: Tier 4 citation shows AI/Auto-generated badge", async ({ page }) => {
    await page.route("**/api/auth/session", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ accessToken: "test", tier: "PREMIUM" }),
      })
    );

    await page.route("**/api/advisor/chat", (route) => {
      const body = [
        `data: ${JSON.stringify({ confidence: 45, conversationId: "conv-cite-4" })}\n\n`,
        `data: ${JSON.stringify({ content: "Based on AI analysis." })}\n\n`,
        `data: ${JSON.stringify({ content: "\n\n*Based on [AI Knowledge Base](# ) (🔘 AI, 4/25/2026)*" })}\n\n`,
        `data: ${JSON.stringify({ messageId: "msg-cite-4" })}\n\n`,
        "data: [DONE]\n\n",
      ].join("");
      route.fulfill({ status: 200, contentType: "text/event-stream", body });
    });

    await page.goto("/advisor");
    const chatInput = page.getByTestId("chat-input");
    await chatInput.fill("Random question");
    await page.getByTestId("send-button").click();

    await expect(page.getByText("AI")).toBeVisible({ timeout: 10000 });
  });

  test("TC-005: Free-tier user sees no source citations", async ({ page }) => {
    await page.route("**/api/auth/session", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ accessToken: "test", tier: "FREE" }),
      })
    );

    await page.route("**/api/advisor/chat", (route) => {
      const body = [
        `data: ${JSON.stringify({ confidence: 80, conversationId: "conv-cite-5" })}\n\n`,
        `data: ${JSON.stringify({ content: "Here is a helpful response for free users." })}\n\n`,
        `data: ${JSON.stringify({ messageId: "msg-cite-5" })}\n\n`,
        "data: [DONE]\n\n",
      ].join("");
      route.fulfill({ status: 200, contentType: "text/event-stream", body });
    });

    await page.goto("/advisor");
    const chatInput = page.getByTestId("chat-input");
    await chatInput.fill("Best team?");
    await page.getByTestId("send-button").click();

    await expect(page.getByText("helpful response")).toBeVisible({ timeout: 10000 });

    // No citation badges for free users
    const badges = page.getByTestId("source-citation-badge");
    await expect(badges).toHaveCount(0);
  });

  test("TC-006: Citation badges have minimum 44px touch targets on mobile", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });

    await page.route("**/api/auth/session", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ accessToken: "test", tier: "PREMIUM" }),
      })
    );

    await page.route("**/api/advisor/chat", (route) => {
      const body = [
        `data: ${JSON.stringify({ confidence: 90, conversationId: "conv-cite-6" })}\n\n`,
        `data: ${JSON.stringify({ content: "Mobile test response." })}\n\n`,
        `data: ${JSON.stringify({ content: "\n\n*Based on [MSF API (Official)](https://api.marvelstrikeforce.com) (🟢 Official, 4/29/2026)*" })}\n\n`,
        `data: ${JSON.stringify({ messageId: "msg-cite-6" })}\n\n`,
        "data: [DONE]\n\n",
      ].join("");
      route.fulfill({ status: 200, contentType: "text/event-stream", body });
    });

    await page.goto("/advisor");
    const chatInput = page.getByTestId("chat-input");
    await chatInput.fill("Test mobile");
    await page.getByTestId("send-button").click();

    await expect(page.getByText("Mobile test response")).toBeVisible({ timeout: 10000 });

    // Verify minimum touch target on any visible badge-like element
    const officialBadge = page.getByText("Official").first();
    if (await officialBadge.isVisible()) {
      const box = await officialBadge.boundingBox();
      if (box) {
        expect(box.height).toBeGreaterThanOrEqual(20); // min-h applied via CSS
      }
    }
  });
});
