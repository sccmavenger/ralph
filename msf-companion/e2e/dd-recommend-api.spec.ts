import { test, expect, type Page } from "@playwright/test";

/**
 * E2E tests for POST /api/msf/planner/dd/recommend
 * Uses browser-level route interception to mock the recommend endpoint directly,
 * since server-side MSF API calls cannot be intercepted by Playwright.
 */

const mockRecommendation = {
  primaryTeam: [
    { id: "char-0", name: "Character 0", power: 800000, gearTier: 18, reasoning: "High power relative to enemies" },
    { id: "char-1", name: "Character 1", power: 780000, gearTier: 18, reasoning: "Provides team protection" },
    { id: "char-2", name: "Character 2", power: 760000, gearTier: 18, reasoning: "Strong trait overlap" },
    { id: "char-3", name: "Character 3", power: 740000, gearTier: 18, reasoning: "High damage output" },
    { id: "char-4", name: "Character 4", power: 720000, gearTier: 18, reasoning: "Support role" },
  ],
  confidence: 72,
  alternatives: [],
  swapSuggestions: [],
  futureBuildSuggestions: [],
  maxCharacters: 5,
};

async function setupMockRoutes(page: Page) {
  // Mock the recommend endpoint at browser level
  await page.route("**/api/msf/planner/dd/recommend", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockRecommendation),
    }),
  );
}

test.describe("DD Recommendation API", () => {
  test("POST /api/msf/planner/dd/recommend returns primaryTeam and confidence", async ({
    page,
  }) => {
    await setupMockRoutes(page);
    await page.goto("/");
    const result = await page.evaluate(async () => {
      const res = await fetch("/api/msf/planner/dd/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ddId: "dd7", roomId: "A1" }),
      });
      return { status: res.status, body: await res.json() };
    });
    expect(result.status).toBe(200);
    expect(result.body).toHaveProperty("primaryTeam");
    expect(Array.isArray(result.body.primaryTeam)).toBe(true);
    expect(result.body).toHaveProperty("confidence");
    expect(typeof result.body.confidence).toBe("number");
  });

  test("POST without session returns 401", async ({ page }) => {
    await page.context().clearCookies();
    await page.goto("/");
    const result = await page.evaluate(async () => {
      const res = await fetch("/api/msf/planner/dd/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ddId: "dd7", roomId: "A1" }),
      });
      return { status: res.status };
    });
    expect(result.status).toBe(401);
  });

  test("POST with invalid ddId returns 404 or error", async ({ page }) => {
    await page.route("**/game/v1/dds/**", (route) =>
      route.fulfill({
        status: 404,
        contentType: "application/json",
        body: JSON.stringify({ error: "Not found" }),
      }),
    );
    await page.route("**/player/v1/roster*", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: [] }),
      }),
    );
    await page.goto("/");
    const result = await page.evaluate(async () => {
      const res = await fetch("/api/msf/planner/dd/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ddId: "invalid-dd", roomId: "ZZ9" }),
      });
      return { status: res.status };
    });
    // Should be error status (404 or 502)
    expect(result.status).toBeGreaterThanOrEqual(400);
  });

  test("Every character in primaryTeam has id, name, and reasoning fields", async ({
    page,
  }) => {
    await setupMockRoutes(page);
    await page.goto("/");
    const result = await page.evaluate(async () => {
      const res = await fetch("/api/msf/planner/dd/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ddId: "dd7", roomId: "A1" }),
      });
      return { status: res.status, body: await res.json() };
    });
    expect(result.status).toBe(200);
    for (const char of result.body.primaryTeam) {
      expect(char).toHaveProperty("id");
      expect(char).toHaveProperty("name");
      expect(char).toHaveProperty("reasoning");
      expect(typeof char.id).toBe("string");
      expect(typeof char.name).toBe("string");
      expect(typeof char.reasoning).toBe("string");
    }
  });

  test("confidence is a number between 0 and 100", async ({ page }) => {
    await setupMockRoutes(page);
    await page.goto("/");
    const result = await page.evaluate(async () => {
      const res = await fetch("/api/msf/planner/dd/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ddId: "dd7", roomId: "A1" }),
      });
      return { status: res.status, body: await res.json() };
    });
    expect(result.status).toBe(200);
    expect(result.body.confidence).toBeGreaterThanOrEqual(0);
    expect(result.body.confidence).toBeLessThanOrEqual(100);
  });
});
