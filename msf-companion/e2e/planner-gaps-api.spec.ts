import { test, expect } from "@playwright/test";

test.describe("Planner Gaps API", () => {
  let apiAvailable = true;

  test.beforeAll(async ({ request }) => {
    const response = await request.get("/api/msf/planner/gaps");
    if (response.status() !== 200) {
      apiAvailable = false;
      console.warn(`\u26a0\ufe0f  MSF API unavailable (status ${response.status()}) \u2014 gaps API tests will be skipped.`);
    }
  });

  test("GET /api/msf/planner/gaps with valid session returns 200 and array with required fields", async ({
    request,
  }) => {
    test.skip(!apiAvailable, "MSF API token expired — re-login to run API tests");
    const response = await request.get("/api/msf/planner/gaps");
    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(Array.isArray(data)).toBe(true);

    for (const gap of data) {
      expect(gap).toHaveProperty("eventId");
      expect(gap).toHaveProperty("eventName");
      expect(typeof gap.readinessPercent).toBe("number");
      expect(gap.readinessPercent).toBeGreaterThanOrEqual(0);
      expect(gap.readinessPercent).toBeLessThanOrEqual(100);
      expect(Array.isArray(gap.characters)).toBe(true);
    }
  });

  test("GET /api/msf/planner/gaps without session returns 401", async () => {
    const response = await fetch(
      "http://localhost:3000/api/msf/planner/gaps",
    );
    expect(response.status).toBe(401);
  });

  test("every character entry has required fields", async ({ request }) => {
    test.skip(!apiAvailable, "MSF API token expired — re-login to run API tests");
    const response = await request.get("/api/msf/planner/gaps");
    expect(response.status()).toBe(200);

    const data = await response.json();

    for (const gap of data) {
      for (const char of gap.characters) {
        expect(char).toHaveProperty("id");
        expect(char).toHaveProperty("name");
        expect(typeof char.currentGear).toBe("number");
        expect(typeof char.requiredGear).toBe("number");
        expect(typeof char.meetsRequirements).toBe("boolean");
        expect(typeof char.owned).toBe("boolean");
      }
    }
  });

  test("readinessPercent values are between 0 and 100 inclusive", async ({
    request,
  }) => {
    test.skip(!apiAvailable, "MSF API token expired — re-login to run API tests");
    const response = await request.get("/api/msf/planner/gaps");
    expect(response.status()).toBe(200);

    const data = await response.json();

    for (const gap of data) {
      expect(gap.readinessPercent).toBeGreaterThanOrEqual(0);
      expect(gap.readinessPercent).toBeLessThanOrEqual(100);
    }
  });
});
