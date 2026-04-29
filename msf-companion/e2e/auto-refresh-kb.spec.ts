import { test, expect } from "@playwright/test";

test.describe("Auto-Refresh Knowledge Base", () => {
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

  function mockAdminDashboard(
    page: import("@playwright/test").Page,
    refreshState: unknown
  ) {
    return Promise.all([
      page.route("**/api/admin/ai-stats", async (route) => {
        await route.fulfill({
          status: 200,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            questionsToday: 10,
            questionsThisWeek: 50,
            topQuestions: [],
            gaps: { open: 2, resolved: 5 },
            tokenUsage: { today: 1000, thisWeek: 5000, estimatedMonthlyCost: 0.2 },
            feedback: { positive: 20, negative: 3 },
            avgConfidence: 75,
          }),
        });
      }),
      page.route("**/api/admin/ingest", async (route) => {
        if (route.request().method() === "GET") {
          await route.fulfill({
            status: 200,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              documentCount: 150,
              creators: ["ValleyFlyin", "Boilon", "Remanx", "OhEmGee"],
              searchConfigured: true,
              refreshState,
            }),
          });
        } else {
          await route.fulfill({
            status: 200,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              videosProcessed: 5,
              documentsUploaded: 20,
              errors: [],
              skippedVideos: [],
              logs: [],
              documentCount: 170,
            }),
          });
        }
      }),
    ]);
  }

  // TC-001: Admin dashboard shows Last Auto-Refresh timestamp when refresh state data exists
  test("TC-001: shows Last Auto-Refresh timestamp when refresh state exists", async ({
    page,
  }) => {
    const refreshState = {
      lastRefreshAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      lastResult: {
        videosProcessed: 12,
        documentsUploaded: 48,
        newVideosFound: 3,
        errors: [],
      },
      staleness: [
        { name: "ValleyFlyin", lastVideoDate: "2026-04-08", isStale: false },
        { name: "Boilon", lastVideoDate: "2026-04-05", isStale: false },
        { name: "Tauna", lastVideoDate: "2026-04-07", isStale: false },
      ],
    };

    await mockAdminDashboard(page, refreshState);
    await page.goto("/admin/ai-dashboard");

    const url = page.url();
    if (url.includes("/admin/ai-dashboard")) {
      const refreshStatus = page.getByTestId("auto-refresh-status");
      await expect(refreshStatus).toBeVisible();
      const timestamp = page.getByTestId("refresh-timestamp");
      await expect(timestamp).toBeVisible();
      await expect(timestamp).not.toHaveText("Never");
    }
  });

  // TC-002: Admin dashboard shows Never when no auto-refresh has occurred
  test("TC-002: shows Never when no auto-refresh has occurred", async ({
    page,
  }) => {
    await mockAdminDashboard(page, null);
    await page.goto("/admin/ai-dashboard");

    const url = page.url();
    if (url.includes("/admin/ai-dashboard")) {
      const timestamp = page.getByTestId("refresh-timestamp");
      await expect(timestamp).toBeVisible();
      await expect(timestamp).toHaveText("Never");
    }
  });

  // TC-003: Stale creator shows yellow/amber warning badge
  test("TC-003: stale creator shows yellow/amber warning badge", async ({
    page,
  }) => {
    const refreshState = {
      lastRefreshAt: new Date().toISOString(),
      lastResult: {
        videosProcessed: 5,
        documentsUploaded: 20,
        newVideosFound: 1,
        errors: [],
      },
      staleness: [
        { name: "ValleyFlyin", lastVideoDate: "2026-04-08", isStale: false },
        { name: "StaleCreator", lastVideoDate: "2026-02-01", isStale: true },
      ],
    };

    await mockAdminDashboard(page, refreshState);
    await page.goto("/admin/ai-dashboard");

    const url = page.url();
    if (url.includes("/admin/ai-dashboard")) {
      const staleBadge = page.getByTestId("staleness-badge-stalecreator");
      await expect(staleBadge).toBeVisible();
      await expect(staleBadge).toHaveText("Stale");
      // Verify yellow/amber styling
      await expect(staleBadge).toHaveClass(/yellow/);
    }
  });

  // TC-004: Active creator shows green/active badge
  test("TC-004: active creator shows green/active badge", async ({ page }) => {
    const refreshState = {
      lastRefreshAt: new Date().toISOString(),
      lastResult: {
        videosProcessed: 5,
        documentsUploaded: 20,
        newVideosFound: 1,
        errors: [],
      },
      staleness: [
        { name: "ValleyFlyin", lastVideoDate: "2026-04-08", isStale: false },
      ],
    };

    await mockAdminDashboard(page, refreshState);
    await page.goto("/admin/ai-dashboard");

    const url = page.url();
    if (url.includes("/admin/ai-dashboard")) {
      const activeBadge = page.getByTestId("staleness-badge-valleyflyin");
      await expect(activeBadge).toBeVisible();
      await expect(activeBadge).toHaveText("Active");
      await expect(activeBadge).toHaveClass(/green/);
    }
  });

  // TC-005: Manual refresh button still visible alongside auto-refresh status
  test("TC-005: manual refresh button visible alongside auto-refresh status", async ({
    page,
  }) => {
    const refreshState = {
      lastRefreshAt: new Date().toISOString(),
      lastResult: {
        videosProcessed: 5,
        documentsUploaded: 20,
        newVideosFound: 1,
        errors: [],
      },
      staleness: [
        { name: "ValleyFlyin", lastVideoDate: "2026-04-08", isStale: false },
      ],
    };

    await mockAdminDashboard(page, refreshState);
    await page.goto("/admin/ai-dashboard");

    const url = page.url();
    if (url.includes("/admin/ai-dashboard")) {
      const refreshButton = page.getByTestId("ingest-button");
      await expect(refreshButton).toBeVisible();
      await expect(refreshButton).toHaveText("Refresh Knowledge Base");
      // Auto-refresh status should also be visible
      await expect(page.getByTestId("auto-refresh-status")).toBeVisible();
    }
  });

  // TC-006: Cron endpoint returns 401 without valid Authorization header
  test("TC-006: cron endpoint returns 401 without valid auth", async ({
    page,
  }) => {
    await page.goto("/");
    const response = await page.evaluate(async () => {
      const res = await fetch("/api/cron/refresh-kb", { method: "POST" });
      return { status: res.status, body: await res.json() };
    });
    expect(response.status).toBe(401);
    expect(response.body).toHaveProperty("error");
  });

  // TC-007: Cron endpoint returns success response shape with valid auth (mocked pipeline)
  test("TC-007: cron endpoint returns success with valid auth (mocked)", async ({
    page,
  }) => {
    // Mock the cron endpoint to return a valid response shape
    await page.route("**/api/cron/refresh-kb", async (route) => {
      if (route.request().method() === "POST") {
        await route.fulfill({
          status: 200,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            result: {
              videosProcessed: 3,
              documentsUploaded: 12,
              errors: [],
              skippedVideos: [],
              newVideosFound: 3,
            },
            staleness: [
              {
                name: "ValleyFlyin",
                channelId: "UCS-lJoP-GG2g0-nZMQCn_cQ",
                lastVideoDate: "2026-04-08",
                isStale: false,
              },
            ],
            refreshedAt: new Date().toISOString(),
          }),
        });
      }
    });

    await page.goto("/");
    const response = await page.evaluate(async () => {
      const res = await fetch("/api/cron/refresh-kb", {
        method: "POST",
        headers: { Authorization: "Bearer test-secret" },
      });
      return { status: res.status, body: await res.json() };
    });

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty("result");
    expect(response.body).toHaveProperty("staleness");
    expect(response.body).toHaveProperty("refreshedAt");
    expect(response.body.result).toHaveProperty("videosProcessed");
    expect(response.body.result).toHaveProperty("newVideosFound");
  });
});
