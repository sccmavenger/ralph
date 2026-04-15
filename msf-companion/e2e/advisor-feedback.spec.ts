import { test, expect } from "@playwright/test";

test.describe("AI Advisor Feedback Buttons", () => {
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

  test("thumbs up and thumbs down buttons appear below AI response", async ({ page }) => {
    // Mock the chat API to return a streaming response with a messageId
    await page.route("**/api/advisor/chat", async (route) => {
      const body = [
        `data: ${JSON.stringify({ confidence: 80, conversationId: "conv-1" })}\n\n`,
        `data: ${JSON.stringify({ content: "Here is my advice about teams." })}\n\n`,
        `data: ${JSON.stringify({ messageId: "msg-server-1" })}\n\n`,
        "data: [DONE]\n\n",
      ].join("");
      await route.fulfill({
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
        body,
      });
    });

    await page.goto("/advisor");
    await page.getByTestId("chat-input").fill("What team should I build?");
    await page.getByTestId("send-button").click();

    // Wait for response to appear
    await expect(page.getByText("Here is my advice about teams.")).toBeVisible();

    // Feedback buttons should be visible
    const feedbackButtons = page.getByTestId("feedback-buttons");
    await expect(feedbackButtons).toBeVisible();
    await expect(page.getByTestId("thumbs-up-btn")).toBeVisible();
    await expect(page.getByTestId("thumbs-down-btn")).toBeVisible();
  });

  test("clicking thumbs up highlights it and disables thumbs down", async ({ page }) => {
    await page.route("**/api/advisor/chat", async (route) => {
      const body = [
        `data: ${JSON.stringify({ confidence: 80, conversationId: "conv-1" })}\n\n`,
        `data: ${JSON.stringify({ content: "Great advice here." })}\n\n`,
        `data: ${JSON.stringify({ messageId: "msg-server-2" })}\n\n`,
        "data: [DONE]\n\n",
      ].join("");
      await route.fulfill({
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
        body,
      });
    });

    await page.route("**/api/advisor/feedback", async (route) => {
      await route.fulfill({
        status: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageId: "msg-server-2", feedback: "positive", feedbackComment: null }),
      });
    });

    await page.goto("/advisor");
    await page.getByTestId("chat-input").fill("Test question");
    await page.getByTestId("send-button").click();
    await expect(page.getByText("Great advice here.")).toBeVisible();

    const thumbsUp = page.getByTestId("thumbs-up-btn");
    await thumbsUp.click();

    // Thumbs up should be highlighted (has green color classes)
    await expect(thumbsUp).toHaveClass(/bg-green-500/);
    // Thumbs up should be disabled
    await expect(thumbsUp).toBeDisabled();
  });

  test("clicking thumbs down highlights it and shows feedback text input", async ({ page }) => {
    await page.route("**/api/advisor/chat", async (route) => {
      const body = [
        `data: ${JSON.stringify({ confidence: 50, conversationId: "conv-1" })}\n\n`,
        `data: ${JSON.stringify({ content: "Some advice." })}\n\n`,
        `data: ${JSON.stringify({ messageId: "msg-server-3" })}\n\n`,
        "data: [DONE]\n\n",
      ].join("");
      await route.fulfill({
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
        body,
      });
    });

    await page.route("**/api/advisor/feedback", async (route) => {
      await route.fulfill({
        status: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageId: "msg-server-3", feedback: "negative", feedbackComment: null }),
      });
    });

    await page.goto("/advisor");
    await page.getByTestId("chat-input").fill("Test question");
    await page.getByTestId("send-button").click();
    await expect(page.getByText("Some advice.")).toBeVisible();

    const thumbsDown = page.getByTestId("thumbs-down-btn");
    await thumbsDown.click();

    // Thumbs down should be highlighted (red classes)
    await expect(thumbsDown).toHaveClass(/bg-red-500/);
    await expect(thumbsDown).toBeDisabled();

    // Feedback text input should appear
    const feedbackInput = page.getByTestId("feedback-text-input");
    await expect(feedbackInput).toBeVisible();
    await expect(feedbackInput).toHaveAttribute("placeholder", "What was wrong?");
  });

  test("submitting feedback text stores it", async ({ page }) => {
    let feedbackPayload: Record<string, unknown> | null = null;

    await page.route("**/api/advisor/chat", async (route) => {
      const body = [
        `data: ${JSON.stringify({ confidence: 60, conversationId: "conv-1" })}\n\n`,
        `data: ${JSON.stringify({ content: "My response." })}\n\n`,
        `data: ${JSON.stringify({ messageId: "msg-server-4" })}\n\n`,
        "data: [DONE]\n\n",
      ].join("");
      await route.fulfill({
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
        body,
      });
    });

    await page.route("**/api/advisor/feedback", async (route) => {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      feedbackPayload = body;
      await route.fulfill({
        status: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageId: body.messageId, feedback: body.rating, feedbackComment: body.comment || null }),
      });
    });

    await page.goto("/advisor");
    await page.getByTestId("chat-input").fill("Test question");
    await page.getByTestId("send-button").click();
    await expect(page.getByText("My response.")).toBeVisible();

    // Click thumbs down
    await page.getByTestId("thumbs-down-btn").click();

    // Type feedback
    const feedbackInput = page.getByTestId("feedback-text-input");
    await feedbackInput.fill("The info about Wolverine was wrong");

    // Submit via button
    await page.getByTestId("feedback-submit-btn").click();

    // Verify the feedback comment input disappears after submit
    await expect(page.getByTestId("feedback-comment-input")).not.toBeVisible();

    // Verify the feedback was sent with correct payload
    expect(feedbackPayload).not.toBeNull();
    expect((feedbackPayload as unknown as Record<string, unknown>).comment).toBe("The info about Wolverine was wrong");
    expect((feedbackPayload as unknown as Record<string, unknown>).rating).toBe("negative");
  });

  test("feedback buttons have minimum 44px touch target", async ({ page }) => {
    await page.route("**/api/advisor/chat", async (route) => {
      const body = [
        `data: ${JSON.stringify({ confidence: 80, conversationId: "conv-1" })}\n\n`,
        `data: ${JSON.stringify({ content: "Advice text." })}\n\n`,
        `data: ${JSON.stringify({ messageId: "msg-server-5" })}\n\n`,
        "data: [DONE]\n\n",
      ].join("");
      await route.fulfill({
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
        body,
      });
    });

    await page.goto("/advisor");
    await page.getByTestId("chat-input").fill("Test question");
    await page.getByTestId("send-button").click();
    await expect(page.getByText("Advice text.")).toBeVisible();

    const thumbsUp = page.getByTestId("thumbs-up-btn");
    const thumbsDown = page.getByTestId("thumbs-down-btn");

    const upBox = await thumbsUp.boundingBox();
    const downBox = await thumbsDown.boundingBox();

    expect(upBox).not.toBeNull();
    expect(downBox).not.toBeNull();
    expect(upBox!.width).toBeGreaterThanOrEqual(44);
    expect(upBox!.height).toBeGreaterThanOrEqual(44);
    expect(downBox!.width).toBeGreaterThanOrEqual(44);
    expect(downBox!.height).toBeGreaterThanOrEqual(44);
  });
});
