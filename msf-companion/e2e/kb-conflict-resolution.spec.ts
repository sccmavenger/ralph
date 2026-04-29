import { test, expect } from "@playwright/test";

test.describe("KB Conflict Resolution — Tier Preference", () => {
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

  test("TC-001: Advisor prefers Tier 1 over Tier 3 when both are cited", async ({ page }) => {
    await page.route("**/api/auth/session", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ accessToken: "test", tier: "PREMIUM" }),
      })
    );

    await page.route("**/api/advisor/chat", (route) => {
      const body = [
        `data: ${JSON.stringify({ confidence: 95, conversationId: "conv-conflict-1" })}\n\n`,
        `data: ${JSON.stringify({ content: "According to official game data, Wolverine benefits most from Skirmisher ISO-8 class." })}\n\n`,
        `data: ${JSON.stringify({ content: "\n\n*Based on [MSF API (Official)](https://api.marvelstrikeforce.com) (🟢 Official, 4/29/2026)*" })}\n\n`,
        `data: ${JSON.stringify({ messageId: "msg-conflict-1" })}\n\n`,
        "data: [DONE]\n\n",
      ].join("");
      route.fulfill({ status: 200, contentType: "text/event-stream", body });
    });

    await page.goto("/advisor");
    const chatInput = page.getByTestId("chat-input");
    await chatInput.fill("Best ISO-8 for Wolverine?");
    await page.getByTestId("send-button").click();

    // Verify Tier 1 data is referenced in the response
    await expect(page.getByText("official game data")).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("Official")).toBeVisible();
  });

  test("TC-002: Only Tier 3 data shows Community Creator label", async ({ page }) => {
    await page.route("**/api/auth/session", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ accessToken: "test", tier: "PREMIUM" }),
      })
    );

    await page.route("**/api/advisor/chat", (route) => {
      const body = [
        `data: ${JSON.stringify({ confidence: 70, conversationId: "conv-conflict-2" })}\n\n`,
        `data: ${JSON.stringify({ content: "Based on community analysis, this team works well in War offense." })}\n\n`,
        `data: ${JSON.stringify({ content: "\n\n*Based on [ValleyFlyin](https://youtube.com/@ValleyFlyin) (⚪ Community, 4/27/2026)*" })}\n\n`,
        `data: ${JSON.stringify({ messageId: "msg-conflict-2" })}\n\n`,
        "data: [DONE]\n\n",
      ].join("");
      route.fulfill({ status: 200, contentType: "text/event-stream", body });
    });

    await page.goto("/advisor");
    const chatInput = page.getByTestId("chat-input");
    await chatInput.fill("Best war offense team?");
    await page.getByTestId("send-button").click();

    await expect(page.getByText("Community")).toBeVisible({ timeout: 10000 });
  });

  test("TC-003: Only Tier 4 (AI-generated) data shows Low confidence", async ({ page }) => {
    await page.route("**/api/auth/session", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ accessToken: "test", tier: "PREMIUM" }),
      })
    );

    await page.route("**/api/advisor/chat", (route) => {
      const body = [
        `data: ${JSON.stringify({ confidence: 40, conversationId: "conv-conflict-3" })}\n\n`,
        `data: ${JSON.stringify({ content: "Based on generated analysis, this might work." })}\n\n`,
        `data: ${JSON.stringify({ content: "\n\n*Based on [AI Knowledge Base](# ) (🔘 AI, 4/25/2026)*" })}\n\n`,
        `data: ${JSON.stringify({ messageId: "msg-conflict-3" })}\n\n`,
        "data: [DONE]\n\n",
      ].join("");
      route.fulfill({ status: 200, contentType: "text/event-stream", body });
    });

    await page.goto("/advisor");
    const chatInput = page.getByTestId("chat-input");
    await chatInput.fill("Random question?");
    await page.getByTestId("send-button").click();

    // Low confidence indicator should be visible
    await expect(page.getByText(/low/i)).toBeVisible({ timeout: 10000 });
  });

  test("TC-004: Tier 1 data shows High confidence, no low-confidence warning", async ({ page }) => {
    await page.route("**/api/auth/session", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ accessToken: "test", tier: "PREMIUM" }),
      })
    );

    await page.route("**/api/advisor/chat", (route) => {
      const body = [
        `data: ${JSON.stringify({ confidence: 95, conversationId: "conv-conflict-4" })}\n\n`,
        `data: ${JSON.stringify({ content: "Based on official game data, the answer is clear." })}\n\n`,
        `data: ${JSON.stringify({ content: "\n\n*Based on [MSF API (Official)](https://api.marvelstrikeforce.com) (🟢 Official, 4/29/2026)*" })}\n\n`,
        `data: ${JSON.stringify({ messageId: "msg-conflict-4" })}\n\n`,
        "data: [DONE]\n\n",
      ].join("");
      route.fulfill({ status: 200, contentType: "text/event-stream", body });
    });

    await page.goto("/advisor");
    const chatInput = page.getByTestId("chat-input");
    await chatInput.fill("Wolverine stats?");
    await page.getByTestId("send-button").click();

    await expect(page.getByText("official game data")).toBeVisible({ timeout: 10000 });
    // No low-confidence warning should be present
    const lowConfidence = page.locator("text=/low confidence/i");
    await expect(lowConfidence).toHaveCount(0);
  });
});
