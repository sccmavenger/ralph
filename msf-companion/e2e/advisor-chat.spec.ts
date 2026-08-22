import { test, expect } from "@playwright/test";

test.describe("AI Advisor Chat", () => {
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

  test("advisor page loads with welcome message visible", async ({ page }) => {
    await page.goto("/advisor");
    await expect(page.getByTestId("welcome-message")).toBeVisible();
    await expect(page.getByRole("heading", { name: "AI Roster Advisor" })).toBeVisible();
  });

  test("suggestion chips are visible and clickable", async ({ page }) => {
    await page.goto("/advisor");
    const chips = page.getByTestId("suggestion-chips");
    await expect(chips).toBeVisible();

    const chipButtons = chips.locator("button");
    await expect(chipButtons).toHaveCount(4);

    // Suggestions are intentionally randomized and may be roster-personalized.
    for (let index = 0; index < 4; index++) {
      await expect(chipButtons.nth(index)).not.toHaveText("");
    }
  });

  test("chat input bar is visible at the bottom", async ({ page }) => {
    await page.goto("/advisor");
    const chatInput = page.getByTestId("chat-input");
    await expect(chatInput).toBeVisible();

    const sendButton = page.getByTestId("send-button");
    await expect(sendButton).toBeVisible();
  });

  test("a fresh question omits the empty conversation ID", async ({ page }) => {
    let requestBody: Record<string, unknown> | null = null;
    await page.route("/api/advisor/chat", async (route) => {
      requestBody = route.request().postDataJSON() as Record<string, unknown>;
      await route.fulfill({
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
        body: [
          `data: ${JSON.stringify({ confidence: 75 })}\n\n`,
          `data: ${JSON.stringify({ content: "Fresh conversation works." })}\n\n`,
          "data: [DONE]\n\n",
        ].join(""),
      });
    });

    await page.goto("/advisor");
    await page.getByTestId("chat-input").fill("What should I build?");
    await page.getByTestId("send-button").click();

    await expect(page.getByText("Fresh conversation works.")).toBeVisible();
    expect(requestBody).toEqual({ question: "What should I build?" });
  });

  test("page renders without horizontal overflow at 375px viewport", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/advisor");
    await expect(page.getByTestId("welcome-message")).toBeVisible();

    const body = page.locator("body");
    const scrollWidth = await body.evaluate((el) => el.scrollWidth);
    const clientWidth = await body.evaluate((el) => el.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
  });

  test("page renders without horizontal overflow at 1440px desktop viewport", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/advisor");

    // Desktop gate may block content, but page should not overflow
    const body = page.locator("body");
    const scrollWidth = await body.evaluate((el) => el.scrollWidth);
    const clientWidth = await body.evaluate((el) => el.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
  });

  test("typing indicator appears and AI response streams in", async ({ page }) => {
    // Mock the chat API to return streaming response
    await page.route("/api/advisor/chat", async (route) => {
      const encoder = new TextEncoder();
      const chunks = [
        `data: ${JSON.stringify({ confidence: 75 })}\n\n`,
        `data: ${JSON.stringify({ content: "Here " })}\n\n`,
        `data: ${JSON.stringify({ content: "is " })}\n\n`,
        `data: ${JSON.stringify({ content: "**your** " })}\n\n`,
        `data: ${JSON.stringify({ content: "advice. " })}\n\n`,
        `data: ${JSON.stringify({ content: "- Build " })}\n\n`,
        `data: ${JSON.stringify({ content: "Bionic Avengers " })}\n\n`,
        "data: [DONE]\n\n",
      ];

      const body = chunks.map((c) => encoder.encode(c));

      await route.fulfill({
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
        body: Buffer.concat(body.map((b) => Buffer.from(b))),
      });
    });

    await page.goto("/advisor");
    const chatInput = page.getByTestId("chat-input");
    await chatInput.fill("What team should I build?");
    await page.getByTestId("send-button").click();

    // User message should appear
    await expect(page.getByText("What team should I build?")).toBeVisible();

    // AI response should eventually appear
    await expect(page.getByText(/advice/)).toBeVisible({ timeout: 10000 });
  });

  test("bold text renders as strong element", async ({ page }) => {
    await page.route("/api/advisor/chat", async (route) => {
      const body = [
        `data: ${JSON.stringify({ confidence: 80 })}\n\n`,
        `data: ${JSON.stringify({ content: "**Bold text** is here" })}\n\n`,
        "data: [DONE]\n\n",
      ].join("");

      await route.fulfill({
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
        body,
      });
    });

    await page.goto("/advisor");
    await page.getByTestId("chat-input").fill("test");
    await page.getByTestId("send-button").click();

    await expect(page.locator("strong").first()).toBeVisible({ timeout: 10000 });
  });

  test("error recovery — after failed stream, can send another question", async ({ page }) => {
    let callCount = 0;
    await page.route("/api/advisor/chat", async (route) => {
      callCount++;
      if (callCount === 1) {
        await route.fulfill({ status: 500, body: JSON.stringify({ error: "Server error" }) });
      } else {
        const body = [
          `data: ${JSON.stringify({ confidence: 80 })}\n\n`,
          `data: ${JSON.stringify({ content: "Recovery response" })}\n\n`,
          "data: [DONE]\n\n",
        ].join("");
        await route.fulfill({
          status: 200,
          headers: { "Content-Type": "text/event-stream" },
          body,
        });
      }
    });

    await page.goto("/advisor");

    // First question fails
    await page.getByTestId("chat-input").fill("first question");
    await page.getByTestId("send-button").click();
    await expect(page.getByText("Server error")).toBeVisible({ timeout: 10000 });

    // Second question succeeds
    await page.getByTestId("chat-input").fill("second question");
    await page.getByTestId("send-button").click();
    await expect(page.getByText("Recovery response")).toBeVisible({ timeout: 10000 });
  });

  test("stream errors remove partial output and show a retryable message", async ({ page }) => {
    await page.route("/api/advisor/chat", (route) =>
      route.fulfill({
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
        body: [
          `data: ${JSON.stringify({ confidence: 35 })}\n\n`,
          `data: ${JSON.stringify({ content: "Partial unsafe output" })}\n\n`,
          `data: ${JSON.stringify({ error: "The response was blocked by the safety filter." })}\n\n`,
          "data: [DONE]\n\n",
        ].join(""),
      })
    );

    await page.goto("/advisor");
    await page.getByTestId("chat-input").fill("Test filtered stream");
    await page.getByTestId("send-button").click();

    await expect(page.getByText("The response was blocked by the safety filter.")).toBeVisible();
    await expect(page.getByText("Partial unsafe output")).toHaveCount(0);
  });

  test("unauthenticated user is redirected to login", async ({ browser }) => {
    const context = await browser.newContext({
      storageState: { cookies: [], origins: [] },
    });
    const page = await context.newPage();
    await page.addInitScript(() => {
      Object.defineProperty(window.navigator, "standalone", { value: true });
    });

    await page.goto("/advisor");
    // Should be redirected away from /advisor (to login/landing or auth/refresh)
    await page.waitForURL(/\/(api\/auth|$)/, { timeout: 10000 });
    await context.close();
  });
});
