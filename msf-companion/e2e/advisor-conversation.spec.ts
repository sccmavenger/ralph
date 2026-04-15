import { test, expect } from "@playwright/test";

test.describe("Advisor Conversation Memory", () => {
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

  test("conversation sidebar shows list of past conversations", async ({
    page,
  }) => {
    // Mock the conversations API
    await page.route("**/api/advisor/conversations", (route) => {
      if (route.request().method() === "GET") {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            conversations: [
              {
                id: "conv-1",
                title: "Best team for DD7?",
                createdAt: "2026-04-07T10:00:00Z",
                updatedAt: "2026-04-07T10:05:00Z",
              },
              {
                id: "conv-2",
                title: "Farming priorities",
                createdAt: "2026-04-06T09:00:00Z",
                updatedAt: "2026-04-06T09:10:00Z",
              },
            ],
          }),
        });
      }
      return route.continue();
    });

    await page.goto("/advisor");

    // On mobile, sidebar is hidden — click toggle to open
    await page.setViewportSize({ width: 375, height: 812 });
    const toggle = page.getByTestId("sidebar-toggle");
    await toggle.click();

    const sidebar = page.getByTestId("conversation-sidebar");
    await expect(sidebar).toBeVisible();

    const items = page.getByTestId("conversation-item");
    await expect(items).toHaveCount(2);
    await expect(items.nth(0)).toContainText("Best team for DD7?");
    await expect(items.nth(1)).toContainText("Farming priorities");
  });

  test("clicking a past conversation loads its messages", async ({
    page,
  }) => {
    await page.route("**/api/advisor/conversations", (route) => {
      if (route.request().method() === "GET") {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            conversations: [
              {
                id: "conv-1",
                title: "DD7 advice",
                createdAt: "2026-04-07T10:00:00Z",
                updatedAt: "2026-04-07T10:05:00Z",
              },
            ],
          }),
        });
      }
      return route.continue();
    });

    await page.route("**/api/advisor/conversations/conv-1", (route) => {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          conversation: {
            id: "conv-1",
            title: "DD7 advice",
            messages: [
              {
                id: "msg-1",
                role: "user",
                content: "What team for DD7 node 10?",
              },
              {
                id: "msg-2",
                role: "assistant",
                content:
                  "For DD7 node 10, I recommend using **Eternals** with Ikaris and Sersi.",
              },
            ],
          },
        }),
      });
    });

    await page.goto("/advisor");
    await page.setViewportSize({ width: 375, height: 812 });

    // Open sidebar
    await page.getByTestId("sidebar-toggle").click();

    // Click conversation
    await page.getByTestId("conversation-item").first().click();

    // Messages should be loaded
    await expect(
      page.getByText("What team for DD7 node 10?")
    ).toBeVisible();
    await expect(page.getByText("Eternals")).toBeVisible();
  });

  test("New conversation button creates a fresh session", async ({
    page,
  }) => {
    await page.route("**/api/advisor/conversations", (route) => {
      if (route.request().method() === "GET") {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            conversations: [
              {
                id: "conv-1",
                title: "Old conversation",
                createdAt: "2026-04-07T10:00:00Z",
                updatedAt: "2026-04-07T10:05:00Z",
              },
            ],
          }),
        });
      }
      return route.continue();
    });

    await page.route("**/api/advisor/conversations/conv-1", (route) => {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          conversation: {
            id: "conv-1",
            title: "Old conversation",
            messages: [
              { id: "msg-1", role: "user", content: "Hello" },
              { id: "msg-2", role: "assistant", content: "Hi there!" },
            ],
          },
        }),
      });
    });

    await page.goto("/advisor");
    await page.setViewportSize({ width: 375, height: 812 });

    // Open sidebar and load a conversation
    await page.getByTestId("sidebar-toggle").click();
    await page.getByTestId("conversation-item").first().click();
    await expect(page.getByText("Hello")).toBeVisible();

    // Click New button
    await page.getByTestId("sidebar-toggle").click();
    await page.getByTestId("new-conversation-btn").click();

    // Should show welcome message again
    await expect(page.getByTestId("welcome-message")).toBeVisible();
  });

  test("conversation title auto-generates from first question text", async ({
    page,
  }) => {
    // Mock chat API to return a conversationId
    await page.route("**/api/advisor/chat", (route) => {
      const encoder = new TextEncoder();
      const body = encoder.encode(
        `data: ${JSON.stringify({ confidence: 70, conversationId: "new-conv-1" })}\n\ndata: ${JSON.stringify({ content: "Great question! " })}\n\ndata: ${JSON.stringify({ content: "Here's my advice." })}\n\ndata: [DONE]\n\n`
      );
      return route.fulfill({
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
        body: Buffer.from(body),
      });
    });

    // Return the new conversation in the list after asking
    let callCount = 0;
    await page.route("**/api/advisor/conversations", (route) => {
      callCount++;
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          conversations:
            callCount > 1
              ? [
                  {
                    id: "new-conv-1",
                    title: "What team should I build next?",
                    createdAt: "2026-04-07T12:00:00Z",
                    updatedAt: "2026-04-07T12:00:00Z",
                  },
                ]
              : [],
        }),
      });
    });

    await page.goto("/advisor");

    // Send a question via suggestion chip
    const chips = page.getByTestId("suggestion-chips");
    await chips.locator("button").first().click();

    // Wait for response to complete
    await expect(page.getByText("Here's my advice.")).toBeVisible();

    // Open sidebar — should show the new conversation
    await page.setViewportSize({ width: 375, height: 812 });
    await page.getByTestId("sidebar-toggle").click();

    const items = page.getByTestId("conversation-item");
    await expect(items).toHaveCount(1);
    await expect(items.first()).toContainText(
      "What team should I build next?"
    );
  });

  test("sidebar is hidden on mobile, accessible via toggle button", async ({
    page,
  }) => {
    await page.route("**/api/advisor/conversations", (route) => {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ conversations: [] }),
      });
    });

    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/advisor");

    // Sidebar should be hidden (translated off-screen)
    const sidebar = page.getByTestId("conversation-sidebar");
    await expect(sidebar).toHaveCSS("transform", "matrix(1, 0, 0, 1, -288, 0)");

    // Toggle should be visible
    const toggle = page.getByTestId("sidebar-toggle");
    await expect(toggle).toBeVisible();

    // Click toggle opens sidebar
    await toggle.click();
    await expect(sidebar).toHaveCSS("transform", "none");

    // Click overlay closes sidebar
    await page.getByTestId("sidebar-overlay").click();
    await expect(sidebar).toHaveCSS("transform", "matrix(1, 0, 0, 1, -288, 0)");
  });

  test("active conversation is visually highlighted in sidebar", async ({
    page,
  }) => {
    await page.route("**/api/advisor/conversations", (route) => {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          conversations: [
            {
              id: "conv-1",
              title: "Active conversation",
              createdAt: "2026-04-07T10:00:00Z",
              updatedAt: "2026-04-07T10:05:00Z",
            },
            {
              id: "conv-2",
              title: "Other conversation",
              createdAt: "2026-04-06T09:00:00Z",
              updatedAt: "2026-04-06T09:10:00Z",
            },
          ],
        }),
      });
    });

    await page.route("**/api/advisor/conversations/conv-1", (route) => {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          conversation: {
            id: "conv-1",
            title: "Active conversation",
            messages: [
              { id: "msg-1", role: "user", content: "Test" },
            ],
          },
        }),
      });
    });

    await page.goto("/advisor");
    await page.setViewportSize({ width: 375, height: 812 });

    // Open sidebar and select first conversation
    await page.getByTestId("sidebar-toggle").click();
    const items = page.getByTestId("conversation-item");
    await items.nth(0).click();

    // Re-open sidebar — first item should have active styling (border-left)
    await page.getByTestId("sidebar-toggle").click();
    await expect(items.nth(0)).toHaveCSS("border-left-width", "2px");
  });
});
