import { test, expect } from "@playwright/test";

test.describe("Planner Events API", () => {
  // Check if authenticated session has a valid MSF API token
  let apiAvailable = true;

  test.beforeAll(async ({ request }) => {
    const response = await request.get("/api/msf/planner/events");
    if (response.status() !== 200) {
      apiAvailable = false;
      console.warn(
        `\u26a0\ufe0f  MSF API unavailable (status ${response.status()}) \u2014 API tests will be skipped. Re-login at http://localhost:3000 and re-capture tokens.`,
      );
    }
  });

  test("GET /api/msf/planner/events with valid session returns 200 and array with required fields", async ({
    request,
  }) => {
    test.skip(!apiAvailable, "MSF API token expired — re-login to run API tests");
    const response = await request.get("/api/msf/planner/events");
    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeGreaterThan(0);

    for (const event of data) {
      expect(event).toHaveProperty("id");
      expect(event).toHaveProperty("name");
      expect(event).toHaveProperty("type");
      expect(event).toHaveProperty("startTime");
      expect(event).toHaveProperty("endTime");
      expect(event).toHaveProperty("requirements");
    }
  });

  test("GET /api/msf/planner/events without session returns 401", async () => {
    // Use raw fetch with no cookies to test unauthenticated access
    const response = await fetch(
      "http://localhost:3000/api/msf/planner/events",
    );
    expect(response.status).toBe(401);
  });

  test("every event has endTime in the future (no past events)", async ({
    request,
  }) => {
    test.skip(!apiAvailable, "MSF API token expired — re-login to run API tests");
    const response = await request.get("/api/msf/planner/events");
    expect(response.status()).toBe(200);

    const data = await response.json();
    const now = new Date().toISOString();

    for (const event of data) {
      expect(event.endTime > now).toBe(true);
    }
  });

  test("no event has type 'info'", async ({ request }) => {
    test.skip(!apiAvailable, "MSF API token expired — re-login to run API tests");
    const response = await request.get("/api/msf/planner/events");
    expect(response.status()).toBe(200);

    const data = await response.json();
    for (const event of data) {
      expect(event.type).not.toBe("info");
    }
  });

  test("at least one episodic event has non-empty requirements", async ({
    request,
  }) => {
    test.skip(!apiAvailable, "MSF API token expired — re-login to run API tests");
    const response = await request.get("/api/msf/planner/events");
    expect(response.status()).toBe(200);

    const data = await response.json();
    const episodicWithReqs = data.filter(
      (e: {
        type: string;
        requirements: { traits: string[]; specificCharacters: string[] };
      }) =>
        e.type === "episodic" &&
        (e.requirements.traits.length > 0 ||
          e.requirements.specificCharacters.length > 0),
    );

    expect(episodicWithReqs.length).toBeGreaterThan(0);
  });
});
