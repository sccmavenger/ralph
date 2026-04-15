import { test, expect } from "@playwright/test";

test.describe("Advisor Freemium Gating", () => {
  test.beforeEach(async ({ page }) => {
    // Suppress install app modal
    await page.addInitScript(() => {
      Object.defineProperty(window.navigator, "standalone", { value: true });
      const origMatchMedia = window.matchMedia.bind(window);
      window.matchMedia = (query: string) => {
        if (query === "(display-mode: standalone)") {
          return {
            matches: true,
            media: query,
            addEventListener: () => {},
            removeEventListener: () => {},
            addListener: () => {},
            removeListener: () => {},
            onchange: null,
            dispatchEvent: () => true,
          } as MediaQueryList;
        }
        return origMatchMedia(query);
      };
    });
  });

  test("free user asks 3 questions and receives answers", async ({ page }) => {
    let questionCount = 0;
    await page.route("**/api/advisor/chat", (route) => {
      questionCount++;
      const encoder = new TextEncoder();
      const body = encoder.encode(
        `data: ${JSON.stringify({ confidence: 70 })}\n\ndata: ${JSON.stringify({ content: `Answer ${questionCount}` })}\n\ndata: [DONE]\n\n`
      );
      return route.fulfill({
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
        body: Buffer.from(body),
      });
    });

    await page.route("**/api/advisor/conversations", (route) => {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ conversations: [] }),
      });
    });

    await page.goto("/advisor");

    for (let i = 1; i <= 3; i++) {
      await page.getByTestId("chat-input").fill(`Question ${i}`);
      await page.getByTestId("send-button").click();
      await expect(page.getByText(`Answer ${i}`)).toBeVisible();
    }
  });

  test("free user 4th question shows upgrade prompt", async ({ page }) => {
    let questionCount = 0;
    await page.route("**/api/advisor/chat", (route) => {
      questionCount++;
      if (questionCount > 3) {
        return route.fulfill({
          status: 429,
          contentType: "application/json",
          body: JSON.stringify({
            error:
              "You've used all 3 free questions today. Upgrade to Premium for unlimited AI advice!",
            code: "DAILY_LIMIT_EXCEEDED",
            retryable: false,
          }),
        });
      }
      const encoder = new TextEncoder();
      const body = encoder.encode(
        `data: ${JSON.stringify({ confidence: 70 })}\n\ndata: ${JSON.stringify({ content: `Answer ${questionCount}` })}\n\ndata: [DONE]\n\n`
      );
      return route.fulfill({
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
        body: Buffer.from(body),
      });
    });

    await page.route("**/api/advisor/conversations", (route) => {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ conversations: [] }),
      });
    });

    await page.goto("/advisor");

    // Ask 3 questions
    for (let i = 1; i <= 3; i++) {
      await page.getByTestId("chat-input").fill(`Question ${i}`);
      await page.getByTestId("send-button").click();
      await expect(page.getByText(`Answer ${i}`)).toBeVisible();
    }

    // 4th question triggers upgrade prompt
    await page.getByTestId("chat-input").fill("Question 4");
    await page.getByTestId("send-button").click();

    await expect(page.getByTestId("upgrade-prompt")).toBeVisible();
  });

  test("upgrade prompt has a CTA linking to subscribe page", async ({
    page,
  }) => {
    await page.route("**/api/advisor/chat", (route) => {
      return route.fulfill({
        status: 429,
        contentType: "application/json",
        body: JSON.stringify({
          error: "Daily limit exceeded",
          code: "DAILY_LIMIT_EXCEEDED",
          retryable: false,
        }),
      });
    });

    await page.route("**/api/advisor/conversations", (route) => {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ conversations: [] }),
      });
    });

    await page.goto("/advisor");
    await page.getByTestId("chat-input").fill("Test question");
    await page.getByTestId("send-button").click();

    const cta = page.getByTestId("upgrade-cta");
    await expect(cta).toBeVisible();
    await expect(cta).toHaveAttribute("href", "/subscribe");
    await expect(cta).toContainText("Upgrade to Premium");
  });

  test("free user does NOT see conversation sidebar", async ({ page }) => {
    await page.route("**/api/advisor/conversations", (route) => {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ conversations: [] }),
      });
    });

    await page.goto("/advisor");
    await page.setViewportSize({ width: 375, height: 812 });

    // Sidebar should not exist in the DOM for free users
    await expect(page.getByTestId("conversation-sidebar")).toHaveCount(0);
    await expect(page.getByTestId("sidebar-toggle")).toHaveCount(0);
  });

  test("free user responses do NOT contain source citations", async ({
    page,
  }) => {
    await page.route("**/api/advisor/chat", (route) => {
      const encoder = new TextEncoder();
      const body = encoder.encode(
        `data: ${JSON.stringify({ confidence: 70 })}\n\ndata: ${JSON.stringify({ content: "Here is some generic advice about team building." })}\n\ndata: [DONE]\n\n`
      );
      return route.fulfill({
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
        body: Buffer.from(body),
      });
    });

    await page.route("**/api/advisor/conversations", (route) => {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ conversations: [] }),
      });
    });

    await page.goto("/advisor");
    await page.getByTestId("chat-input").fill("Best team?");
    await page.getByTestId("send-button").click();

    await expect(
      page.getByText("generic advice about team building")
    ).toBeVisible();
    // Should NOT contain "Based on" source citations
    await expect(page.getByText("Based on")).toHaveCount(0);
  });

  test("upgrade prompt is friendly and not punitive", async ({ page }) => {
    await page.route("**/api/advisor/chat", (route) => {
      return route.fulfill({
        status: 429,
        contentType: "application/json",
        body: JSON.stringify({
          error: "Daily limit exceeded",
          code: "DAILY_LIMIT_EXCEEDED",
        }),
      });
    });

    await page.route("**/api/advisor/conversations", (route) => {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ conversations: [] }),
      });
    });

    await page.goto("/advisor");
    await page.getByTestId("chat-input").fill("Test");
    await page.getByTestId("send-button").click();

    const prompt = page.getByTestId("upgrade-prompt");
    await expect(prompt).toBeVisible();
    await expect(prompt).toContainText("Upgrade to Premium");
    // Should not contain error-like language
    await expect(prompt).not.toContainText("Error");
    await expect(prompt).not.toContainText("denied");
  });
});
