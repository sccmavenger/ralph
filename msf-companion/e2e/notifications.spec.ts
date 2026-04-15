import { test, expect } from "@playwright/test";

test.describe("Commander Notifications", () => {
  test.beforeEach(async ({ page }) => {
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

  test("notification badge appears when unread notifications exist", async ({
    page,
  }) => {
    await page.route("**/api/notifications", (route) => {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          notifications: [
            {
              id: "notif-1",
              type: "gap_resolved",
              title: "I now have data on DD7 node 10!",
              message: "Ask me again about DD7 node 10 tips.",
              linkUrl: "/advisor?q=DD7+node+10+tips",
              read: false,
              createdAt: "2026-04-07T12:00:00Z",
            },
          ],
          unreadCount: 1,
        }),
      });
    });

    await page.goto("/dashboard");
    const badge = page.getByTestId("notification-badge");
    await expect(badge).toBeVisible();
    await expect(badge).toHaveText("1");
  });

  test("clicking notification shows details and link", async ({ page }) => {
    await page.route("**/api/notifications", (route) => {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          notifications: [
            {
              id: "notif-1",
              type: "gap_resolved",
              title: "I now have data on DD7 node 10!",
              message: "Ask me again about DD7 node 10 tips.",
              linkUrl: "/advisor?q=DD7+node+10+tips",
              read: false,
              createdAt: "2026-04-07T12:00:00Z",
            },
          ],
          unreadCount: 1,
        }),
      });
    });

    await page.goto("/dashboard");
    await page.getByTestId("notification-bell").click();

    const panel = page.getByTestId("notification-panel");
    await expect(panel).toBeVisible();

    const item = page.getByTestId("notification-item");
    await expect(item).toContainText("DD7 node 10");
    await expect(item.locator("a")).toHaveAttribute(
      "href",
      "/advisor?q=DD7+node+10+tips"
    );
  });

  test("dismiss removes notification from list", async ({ page }) => {
    await page.route("**/api/notifications", (route) => {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          notifications: [
            {
              id: "notif-1",
              type: "gap_resolved",
              title: "Test notification",
              message: "Test message",
              linkUrl: null,
              read: false,
              createdAt: "2026-04-07T12:00:00Z",
            },
          ],
          unreadCount: 1,
        }),
      });
    });

    await page.route("**/api/notifications/notif-1", (route) => {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true }),
      });
    });

    await page.goto("/dashboard");
    await page.getByTestId("notification-bell").click();
    await page.getByTestId("dismiss-notification").click();

    // Badge should disappear (or show 0)
    await expect(page.getByTestId("notification-badge")).toHaveCount(0);
  });
});
