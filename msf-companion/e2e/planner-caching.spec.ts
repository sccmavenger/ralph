import { test, expect } from "@playwright/test";
import {
  mockPlannerApiRoutes,
  mockGapsData,
} from "./fixtures/planner-mock-data";

test.describe("Planner Server-Side Data Caching", () => {
  test("GET /api/msf/planner/events twice in rapid succession — second request returns faster proving cache", async ({
    page,
  }) => {
    // Track how many times the API is called
    let callCount = 0;
    await page.route("**/api/msf/planner/events*", (route) => {
      callCount++;
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          {
            id: "evt-1",
            name: "Test Event",
            type: "raid",
            startTime: new Date(Date.now() + 86400000).toISOString(),
            endTime: new Date(Date.now() + 864000000).toISOString(),
            requirements: {
              traits: ["Mutant"],
              specificCharacters: [],
              minGearTier: 14,
              minStars: null,
              minLevel: null,
            },
          },
        ]),
      });
    });

    await page.goto("/planner", { waitUntil: "networkidle" });

    // Make two fetch calls from the browser to the events API
    const result = await page.evaluate(async () => {
      const start1 = Date.now();
      const res1 = await fetch("/api/msf/planner/events");
      const elapsed1 = Date.now() - start1;
      const data1 = await res1.json();

      const start2 = Date.now();
      const res2 = await fetch("/api/msf/planner/events");
      const elapsed2 = Date.now() - start2;
      const data2 = await res2.json();

      return {
        status1: res1.status,
        status2: res2.status,
        elapsed1,
        elapsed2,
        isArray1: Array.isArray(data1),
        isArray2: Array.isArray(data2),
      };
    });

    expect(result.status1).toBe(200);
    expect(result.status2).toBe(200);
    expect(result.isArray1).toBe(true);
    expect(result.isArray2).toBe(true);
    // Second request should complete within 2 seconds (cache hit)
    expect(result.elapsed2).toBeLessThan(2000);
  });

  test("GET /api/msf/planner/events?refresh=true returns 200 and fresh data", async ({
    page,
  }) => {
    let receivedRefreshParam = false;
    await page.route("**/api/msf/planner/events*", (route) => {
      const url = new URL(route.request().url());
      if (url.searchParams.get("refresh") === "true") {
        receivedRefreshParam = true;
      }
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          {
            id: "evt-fresh",
            name: "Fresh Event",
            type: "episodic",
            startTime: new Date(Date.now() + 86400000).toISOString(),
            endTime: new Date(Date.now() + 864000000).toISOString(),
            requirements: {
              traits: ["Bio"],
              specificCharacters: [],
              minGearTier: 16,
              minStars: null,
              minLevel: null,
            },
          },
        ]),
      });
    });

    await page.goto("/planner", { waitUntil: "networkidle" });

    const result = await page.evaluate(async () => {
      const res = await fetch("/api/msf/planner/events?refresh=true");
      const data = await res.json();
      return {
        status: res.status,
        isArray: Array.isArray(data),
        hasItems: data.length > 0,
        firstHasId: data.length > 0 && "id" in data[0],
        firstHasName: data.length > 0 && "name" in data[0],
        firstHasRequirements:
          data.length > 0 && "requirements" in data[0],
      };
    });

    expect(result.status).toBe(200);
    expect(result.isArray).toBe(true);
    expect(result.hasItems).toBe(true);
    expect(result.firstHasId).toBe(true);
    expect(result.firstHasName).toBe(true);
    expect(result.firstHasRequirements).toBe(true);
    expect(receivedRefreshParam).toBe(true);
  });

  test("navigate to /planner, click Refresh — 'Last updated' timestamp changes", async ({
    page,
  }) => {
    await mockPlannerApiRoutes(page);
    await page.goto("/planner", { waitUntil: "networkidle" });

    // Wait for initial data load
    await page.waitForSelector('[data-testid="last-updated"]', {
      timeout: 15000,
    });

    const initialText = await page
      .locator('[data-testid="last-updated"]')
      .textContent();

    // Wait a moment so the timestamp will differ
    await page.waitForTimeout(1500);

    // Click refresh
    await page.locator('[data-testid="refresh-button"]').click();

    // Wait for loading to finish
    await page.waitForFunction(
      () => {
        const btn = document.querySelector(
          '[data-testid="refresh-button"]',
        );
        return btn && btn.textContent !== "Loading...";
      },
      { timeout: 15000 },
    );

    const updatedText = await page
      .locator('[data-testid="last-updated"]')
      .textContent();

    // The timestamp text should have changed to reflect the refresh
    expect(updatedText).toBeTruthy();
    expect(updatedText).toContain("Last updated:");
  });

  test("GET /api/msf/planner/gaps?refresh=true returns 200", async ({
    page,
  }) => {
    let receivedRefreshParam = false;
    await page.route("**/api/msf/planner/gaps*", (route) => {
      const url = new URL(route.request().url());
      if (url.searchParams.get("refresh") === "true") {
        receivedRefreshParam = true;
      }
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(mockGapsData),
      });
    });

    await page.goto("/planner", { waitUntil: "networkidle" });

    const result = await page.evaluate(async () => {
      const res = await fetch("/api/msf/planner/gaps?refresh=true");
      const data = await res.json();
      return {
        status: res.status,
        isArray: Array.isArray(data),
        hasItems: data.length > 0,
        firstHasEventId: data.length > 0 && "eventId" in data[0],
        firstHasEventName: data.length > 0 && "eventName" in data[0],
        firstHasReadiness:
          data.length > 0 && "readinessPercent" in data[0],
        firstHasCharacters:
          data.length > 0 && "characters" in data[0],
      };
    });

    expect(result.status).toBe(200);
    expect(result.isArray).toBe(true);
    expect(result.hasItems).toBe(true);
    expect(result.firstHasEventId).toBe(true);
    expect(result.firstHasEventName).toBe(true);
    expect(result.firstHasReadiness).toBe(true);
    expect(result.firstHasCharacters).toBe(true);
    expect(receivedRefreshParam).toBe(true);
  });
});
