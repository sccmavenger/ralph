import { test, expect } from "@playwright/test";

test.describe("KB Degradation — Partial Pipeline Failure", () => {
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

  test("TC-001: Advisor works with only youtube-transcript sources (API sync down)", async ({ page }) => {
    await page.route("**/api/auth/session", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ accessToken: "test", tier: "PREMIUM" }),
      })
    );

    await page.route("**/api/advisor/chat", (route) => {
      const body = [
        `data: ${JSON.stringify({ confidence: 65, conversationId: "conv-degrade-1" })}\n\n`,
        `data: ${JSON.stringify({ content: "Based on community analysis from content creators, this team is recommended." })}\n\n`,
        `data: ${JSON.stringify({ content: "\n\n*Based on [ValleyFlyin](https://youtube.com/@ValleyFlyin) (⚪ Community, 4/27/2026)*" })}\n\n`,
        `data: ${JSON.stringify({ messageId: "msg-degrade-1" })}\n\n`,
        "data: [DONE]\n\n",
      ].join("");
      route.fulfill({ status: 200, contentType: "text/event-stream", body });
    });

    await page.goto("/advisor");
    const chatInput = page.getByTestId("chat-input");
    await chatInput.fill("Best team to build?");
    await page.getByTestId("send-button").click();

    await expect(page.getByText("community analysis")).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("Community")).toBeVisible();
  });

  test("TC-002: Advisor responds with general knowledge when 0 search results (all syncs failed)", async ({ page }) => {
    await page.route("**/api/auth/session", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ accessToken: "test", tier: "PREMIUM" }),
      })
    );

    await page.route("**/api/advisor/chat", (route) => {
      const body = [
        `data: ${JSON.stringify({ confidence: 30, conversationId: "conv-degrade-2" })}\n\n`,
        `data: ${JSON.stringify({ content: "I don't have specific data available right now, but based on general knowledge, I can suggest focusing on meta teams." })}\n\n`,
        `data: ${JSON.stringify({ messageId: "msg-degrade-2" })}\n\n`,
        "data: [DONE]\n\n",
      ].join("");
      route.fulfill({ status: 200, contentType: "text/event-stream", body });
    });

    await page.goto("/advisor");
    const chatInput = page.getByTestId("chat-input");
    await chatInput.fill("What should I build?");
    await page.getByTestId("send-button").click();

    await expect(page.getByText("general knowledge")).toBeVisible({ timeout: 10000 });
    // Low confidence indicator
    await expect(page.getByText(/low/i)).toBeVisible({ timeout: 5000 });
  });

  test("TC-003: Admin KB health shows 'Never' for un-synced source without crashing", async ({ page }) => {
    await page.route("**/api/admin/session", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ isAdmin: true }),
      })
    );

    await page.route("**/api/admin/kb-health", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          totalDocuments: 150,
          documentsBySourceType: { "youtube-transcript": 100, "api-game-data": 50 },
          documentsByTier: { "1": 50, "3": 100 },
          lastSyncTimestamps: {
            "api-game-data": "2026-04-29T05:00:00Z",
            "official-blog": "2026-04-28T07:00:00Z",
            "youtube-transcript": "2026-04-27T12:00:00Z",
            "reddit-post": null,
            "ai-generated": "2026-04-26T03:00:00Z",
          },
          staleDocuments: 5,
        }),
      })
    );

    // Also mock the other admin endpoints to prevent errors
    await page.route("**/api/admin/ai-stats", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          questionsToday: 10,
          questionsThisWeek: 50,
          topQuestions: [],
          gaps: { open: 2, resolved: 5 },
          tokenUsage: { today: 1000, thisWeek: 5000, estimatedMonthlyCost: 5.0 },
          feedback: { positive: 8, negative: 2 },
          avgConfidence: 80,
        }),
      })
    );

    await page.route("**/api/admin/ingest", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          documentCount: 150,
          creators: ["ValleyFlyin"],
          searchConfigured: true,
          refreshState: null,
        }),
      })
    );

    await page.goto("/admin/ai-dashboard");

    // Wait for KB health section to load
    await expect(page.getByTestId("kb-health")).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId("kb-last-sync")).toBeVisible();

    // Verify "Never" is shown for reddit-post
    await expect(page.getByText("Never")).toBeVisible();
  });

  test("TC-004: No citation section rendered when sourceCitations is empty", async ({ page }) => {
    await page.route("**/api/auth/session", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ accessToken: "test", tier: "PREMIUM" }),
      })
    );

    await page.route("**/api/advisor/chat", (route) => {
      const body = [
        `data: ${JSON.stringify({ confidence: 80, conversationId: "conv-degrade-4" })}\n\n`,
        `data: ${JSON.stringify({ content: "Here is a general response with no citations." })}\n\n`,
        `data: ${JSON.stringify({ messageId: "msg-degrade-4" })}\n\n`,
        "data: [DONE]\n\n",
      ].join("");
      route.fulfill({ status: 200, contentType: "text/event-stream", body });
    });

    await page.goto("/advisor");
    const chatInput = page.getByTestId("chat-input");
    await chatInput.fill("Tell me something");
    await page.getByTestId("send-button").click();

    await expect(page.getByText("general response")).toBeVisible({ timeout: 10000 });

    // No citation container should be rendered
    const citationContainer = page.getByTestId("source-citations-container");
    await expect(citationContainer).toHaveCount(0);
  });
});
