import { test, expect, type Page } from "@playwright/test";

/**
 * E2E tests for DD Planner API routes.
 * Uses page-level route interception with mock data.
 */

const mockDDList = [
  { id: "dd7", name: "Dark Dimension 7", nodeCount: 13, ddCompletion: null },
  { id: "dd8", name: "Dark Dimension 8", nodeCount: 13, ddCompletion: null },
];

const mockDDDetail = {
  id: "dd7",
  name: "Dark Dimension 7",
  ddCompletion: null,
  nodes: [
    { roomId: "A1", name: "Node 1", isBoss: false, sectionName: "City" },
    { roomId: "A2", name: "Node 2", isBoss: false, sectionName: "City" },
    { roomId: "B1", name: "Boss Node", isBoss: true, sectionName: "Global" },
  ],
};

const mockNodeDetail = {
  roomId: "A1",
  name: "Node 1",
  isBoss: false,
  sectionName: "City",
  requirements: {
    anyCharacterFilters: [{ allTraits: ["City"], gearTier: 19 }],
    maxCharacters: 5,
    minCharacters: 1,
  },
  enemies: {
    left: {
      waves: [
        {
          units: [
            {
              id: "enemy-1",
              level: 100,
              gearTier: 19,
              info: { name: "Spider-Man", traits: ["City", "Hero", "Bio"] },
            },
            {
              id: "enemy-2",
              level: 100,
              gearTier: 19,
              info: { name: "Daredevil", traits: ["City", "Hero", "Skill"] },
            },
          ],
        },
      ],
    },
  },
};

async function setupMockRoutes(page: Page) {
  await page.route("**/api/msf/planner/dd", (route) => {
    if (route.request().url().includes("/dd/")) {
      return route.fallback();
    }
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockDDList),
    });
  });

  await page.route("**/api/msf/planner/dd/dd7", (route) => {
    if (route.request().url().includes("/dd7/")) {
      return route.fallback();
    }
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockDDDetail),
    });
  });

  await page.route("**/api/msf/planner/dd/dd7/A1*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockNodeDetail),
    }),
  );
}

test.describe("DD Planner API", () => {
  test("GET /api/msf/planner/dd returns DD list with id, name, nodeCount", async ({
    page,
  }) => {
    await setupMockRoutes(page);
    await page.goto("/");
    const result = await page.evaluate(async () => {
      const res = await fetch("/api/msf/planner/dd");
      return { status: res.status, body: await res.json() };
    });
    expect(result.status).toBe(200);
    expect(Array.isArray(result.body)).toBe(true);
    for (const dd of result.body) {
      expect(dd).toHaveProperty("id");
      expect(dd).toHaveProperty("name");
      expect(dd).toHaveProperty("nodeCount");
    }
  });

  test("GET /api/msf/planner/dd without session returns 401", async ({
    page,
  }) => {
    // Clear auth cookies
    await page.context().clearCookies();
    await page.goto("/");
    const result = await page.evaluate(async () => {
      const res = await fetch("/api/msf/planner/dd");
      return { status: res.status };
    });
    expect(result.status).toBe(401);
  });

  test("GET /api/msf/planner/dd/{ddId} returns object with nodes array", async ({
    page,
  }) => {
    await setupMockRoutes(page);
    await page.goto("/");
    const result = await page.evaluate(async () => {
      const res = await fetch("/api/msf/planner/dd/dd7");
      return { status: res.status, body: await res.json() };
    });
    expect(result.status).toBe(200);
    expect(result.body).toHaveProperty("nodes");
    expect(Array.isArray(result.body.nodes)).toBe(true);
    expect(result.body.nodes.length).toBeGreaterThan(0);
  });

  test("GET /api/msf/planner/dd/{ddId}/{roomId} returns requirements and enemies", async ({
    page,
  }) => {
    await setupMockRoutes(page);
    await page.goto("/");
    const result = await page.evaluate(async () => {
      const res = await fetch("/api/msf/planner/dd/dd7/A1");
      return { status: res.status, body: await res.json() };
    });
    expect(result.status).toBe(200);
    expect(result.body).toHaveProperty("requirements");
    expect(result.body).toHaveProperty("enemies");
  });

  test("Enemy data in node detail has wave structure with units array", async ({
    page,
  }) => {
    await setupMockRoutes(page);
    await page.goto("/");
    const result = await page.evaluate(async () => {
      const res = await fetch("/api/msf/planner/dd/dd7/A1");
      return { status: res.status, body: await res.json() };
    });
    expect(result.status).toBe(200);
    const enemies = result.body.enemies;
    expect(enemies).toHaveProperty("left");
    expect(enemies.left).toHaveProperty("waves");
    expect(Array.isArray(enemies.left.waves)).toBe(true);
    expect(enemies.left.waves[0]).toHaveProperty("units");
    expect(Array.isArray(enemies.left.waves[0].units)).toBe(true);
  });
});
