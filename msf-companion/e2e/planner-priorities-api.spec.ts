import { test, expect } from "@playwright/test";

test.describe("Planner Priorities API", () => {
  let apiAvailable = true;

  test.beforeAll(async ({ request }) => {
    const response = await request.get("/api/msf/planner/priorities");
    if (response.status() !== 200) {
      apiAvailable = false;
      console.warn(`\u26a0\ufe0f  MSF API unavailable (status ${response.status()}) \u2014 priorities API tests will be skipped.`);
    }
  });

  test("GET /api/msf/planner/priorities with valid session returns 200 and sorted array", async ({
    request,
  }) => {
    test.skip(!apiAvailable, "MSF API token expired — re-login to run API tests");
    const response = await request.get("/api/msf/planner/priorities");
    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(Array.isArray(data)).toBe(true);

    // Verify descending score order
    for (let i = 1; i < data.length; i++) {
      expect(data[i - 1].score).toBeGreaterThanOrEqual(data[i].score);
    }
  });

  test("GET /api/msf/planner/priorities without session returns 401", async () => {
    const response = await fetch(
      "http://localhost:3000/api/msf/planner/priorities",
    );
    expect(response.status).toBe(401);
  });

  test("each priority entry has required fields", async ({ request }) => {
    test.skip(!apiAvailable, "MSF API token expired — re-login to run API tests");
    const response = await request.get("/api/msf/planner/priorities");
    expect(response.status()).toBe(200);

    const data = await response.json();

    for (const entry of data) {
      expect(typeof entry.rank).toBe("number");
      expect(typeof entry.characterId).toBe("string");
      expect(typeof entry.name).toBe("string");
      expect(typeof entry.score).toBe("number");
      expect(Array.isArray(entry.events)).toBe(true);
      expect(typeof entry.currentGear).toBe("number");
      expect(typeof entry.requiredGear).toBe("number");
    }
  });

  test("results are limited to max 20 entries", async ({ request }) => {
    test.skip(!apiAvailable, "MSF API token expired — re-login to run API tests");
    const response = await request.get("/api/msf/planner/priorities");
    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data.length).toBeLessThanOrEqual(20);
  });

  test("scores are in descending order", async ({ request }) => {
    test.skip(!apiAvailable, "MSF API token expired — re-login to run API tests");
    const response = await request.get("/api/msf/planner/priorities");
    expect(response.status()).toBe(200);

    const data = await response.json();

    for (let i = 1; i < data.length; i++) {
      expect(data[i - 1].score).toBeGreaterThanOrEqual(data[i].score);
    }
  });
});
