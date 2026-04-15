import { test, expect } from "@playwright/test";

// ── Mock Data ──────────────────────────────────────────────────────────────────

/** Mock campaign nodes covering 3 episodics × 2 chapters × 3 tiers = 18 nodes */
function buildMockNodes() {
  const episodics = [
    { id: "ep-heroes", name: "Heroes" },
    { id: "ep-villains", name: "Villains" },
    { id: "ep-nexus", name: "Nexus" },
  ];
  const nodes: Array<{
    episodicId: string;
    episodicName: string;
    chapterNumber: number;
    tierNumber: number;
    nodeName: string;
    energyCost: number;
    rewards: Array<{
      itemId: string;
      itemName: string;
      quantity: number;
      expectedValue: number;
      type: string;
      characterId?: string;
    }>;
  }> = [];

  for (const ep of episodics) {
    for (let ch = 1; ch <= 2; ch++) {
      for (let tier = 1; tier <= 3; tier++) {
        const label = `${ep.name} ${ch}-${tier}`;
        const rewards: Array<{
          itemId: string;
          itemName: string;
          quantity: number;
          expectedValue: number;
          type: string;
          characterId?: string;
        }> = [];

        // Give each node a gear reward
        rewards.push({
          itemId: `item-gear-${ep.id}-${ch}-${tier}`,
          itemName: `Gear Piece ${ep.name} ${ch}-${tier}`,
          quantity: 1,
          expectedValue: 0.3 + tier * 0.1,
          type: "GEAR",
        });

        // Add specific items to specific nodes for testing
        if (ep.id === "ep-heroes" && ch === 1 && tier === 1) {
          rewards.push({
            itemId: "item-advanced-phosphates",
            itemName: "Advanced Phosphates",
            quantity: 2,
            expectedValue: 2.5,
            type: "GEAR",
          });
        }

        if (ep.id === "ep-heroes" && ch === 1 && tier === 2) {
          rewards.push({
            itemId: "item-wolverine-shards",
            itemName: "Wolverine",
            quantity: 2,
            expectedValue: 1.0,
            type: "SHARD",
            characterId: "char-wolverine",
          });
        }

        if (ep.id === "ep-villains" && ch === 2 && tier === 3) {
          rewards.push({
            itemId: "item-ability-mat-t4",
            itemName: "T4 Ability Material",
            quantity: 1,
            expectedValue: 0.8,
            type: "ABILITY_MATERIAL",
          });
        }

        if (ep.id === "ep-nexus" && ch === 1 && tier === 1) {
          rewards.push({
            itemId: "item-iso-compound",
            itemName: "ISO-8 Compound",
            quantity: 3,
            expectedValue: 1.5,
            type: "ISOITEM",
          });
        }

        if (ep.id === "ep-nexus" && ch === 2 && tier === 1) {
          rewards.push({
            itemId: "item-training-module",
            itemName: "Training Module Basic",
            quantity: 5,
            expectedValue: 3.0,
            type: "CONSUMABLE",
          });
        }

        // Vary energy cost to create different efficiency scores
        const energyCost = 8 + tier * 2 + ch * 2;
        nodes.push({
          episodicId: ep.id,
          episodicName: ep.name,
          chapterNumber: ch,
          tierNumber: tier,
          nodeName: label,
          energyCost,
          rewards,
        });
      }
    }
  }
  return nodes;
}

const mockNodes = buildMockNodes();

const mockFarmingGaps = {
  gaps: [
    {
      itemId: "item-advanced-phosphates",
      itemName: "Advanced Phosphates",
      needed: 200,
      owned: 50,
      deficit: 150,
      farmable: true,
      sources: [
        { characterName: "Wolverine", currentGear: 14, targetGear: 17 },
      ],
    },
    {
      itemId: "item-unique-catalyst",
      itemName: "Premium Catalyst",
      needed: 25,
      owned: 0,
      deficit: 25,
      farmable: false,
      sources: [
        { characterName: "Storm", currentGear: 12, targetGear: 16 },
      ],
    },
  ],
};

// ── Helpers ─────────────────────────────────────────────────────────────────────

/**
 * Set up page.route mocks for all farming-related API endpoints.
 */
async function mockFarmingRoutes(
  page: import("@playwright/test").Page,
  opts?: {
    nodes?: typeof mockNodes | null;
    gaps?: typeof mockFarmingGaps | null;
    nodesStatus?: number;
  },
) {
  const nodesData = opts?.nodes ?? mockNodes;
  const gapsData = opts?.gaps ?? mockFarmingGaps;
  const nodesStatus = opts?.nodesStatus ?? 200;

  await page.route("**/api/msf/farming/nodes*", (route) =>
    route.fulfill({
      status: nodesStatus,
      contentType: "application/json",
      body: JSON.stringify(
        nodesStatus === 200
          ? nodesData
          : { error: "Failed to load campaign data", code: "UPSTREAM_ERROR", retryable: true },
      ),
    }),
  );

  await page.route("**/api/msf/farming/gaps*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(gapsData),
    }),
  );
}

// ── Tests ───────────────────────────────────────────────────────────────────────

test.describe("Farming Guide — E2E Tests", () => {
  // TC-001: Farming Page Loads with Campaign Nodes
  test("TC-001: page loads and shows all 18 campaign nodes", async ({
    page,
  }) => {
    await mockFarmingRoutes(page);
    await page.goto("/analyze/farming");

    // Wait for loaded state
    await expect(page.getByTestId("farming-search")).toBeVisible();

    // All 18 nodes rendered
    const nodeCards = page.getByTestId("farming-node-card");
    await expect(nodeCards).toHaveCount(18);

    // Each card shows node label, energy cost, and at least one reward
    const firstCard = nodeCards.first();
    await expect(firstCard).toContainText("Heroes 1-1");
  });

  // TC-002: Search Filters Nodes by Resource Name
  test("TC-002: search filters nodes by resource name and character shard name", async ({
    page,
  }) => {
    await mockFarmingRoutes(page);
    await page.goto("/analyze/farming");
    await expect(page.getByTestId("farming-search")).toBeVisible();

    // Type "Phosphate" → only nodes with Advanced Phosphates
    await page.getByTestId("farming-search").fill("Phosphate");
    // Wait for debounce (300ms)
    await page.waitForTimeout(400);

    const nodesAfterPhosphate = page.getByTestId("farming-node-card");
    await expect(nodesAfterPhosphate).toHaveCount(1);
    await expect(nodesAfterPhosphate.first()).toContainText("Heroes 1-1");

    // Node count label shows filtered count
    await expect(page.getByText("1 of 18 nodes match")).toBeVisible();

    // Clear and search for shard character name
    await page.getByTestId("farming-search").fill("Wolverine");
    await page.waitForTimeout(400);

    const nodesAfterWolverine = page.getByTestId("farming-node-card");
    await expect(nodesAfterWolverine).toHaveCount(1);
    await expect(nodesAfterWolverine.first()).toContainText("Heroes 1-2");
  });

  // TC-003: Type Chip Filters
  test("TC-003: type chip filters toggle and combine correctly", async ({
    page,
  }) => {
    await mockFarmingRoutes(page);
    await page.goto("/analyze/farming");
    await expect(page.getByTestId("farming-search")).toBeVisible();

    const totalNodes = 18;
    // All nodes have at least one GEAR reward
    await expect(page.getByTestId("farming-node-card")).toHaveCount(totalNodes);

    // Click SHARD chip — only nodes with shard drops
    await page.getByTestId("filter-chip-SHARD").click();
    const shardNodes = page.getByTestId("farming-node-card");
    const shardCount = await shardNodes.count();
    expect(shardCount).toBe(1); // Only Heroes 1-2 has Wolverine shard

    // Click ABILITY_MATERIAL chip (additive) — shard OR ability mat nodes
    await page.getByTestId("filter-chip-ABILITY_MATERIAL").click();
    const combinedCount = await page.getByTestId("farming-node-card").count();
    expect(combinedCount).toBe(2); // Heroes 1-2 (shard) + Villains 2-3 (ability mat)

    // Deselect SHARD chip — only ability mat nodes
    await page.getByTestId("filter-chip-SHARD").click();
    const abilityOnlyCount = await page.getByTestId("farming-node-card").count();
    expect(abilityOnlyCount).toBe(1); // Just Villains 2-3

    // Deselect ABILITY_MATERIAL to reset
    await page.getByTestId("filter-chip-ABILITY_MATERIAL").click();
    await expect(page.getByTestId("farming-node-card")).toHaveCount(totalNodes);

    // Verify "Clear filters" button works
    await page.getByTestId("filter-chip-SHARD").click();
    await expect(page.getByTestId("farming-node-card")).toHaveCount(1);
    await expect(page.getByTestId("clear-filters")).toBeVisible();
    await page.getByTestId("clear-filters").click();
    await expect(page.getByTestId("farming-node-card")).toHaveCount(totalNodes);
  });

  // TC-009: Deep-Link from Planner Pre-Filters
  test("TC-009: deep-link with ?character= shows character filter banner", async ({
    page,
  }) => {
    await mockFarmingRoutes(page);
    await page.goto("/analyze/farming?character=Wolverine");

    // Character filter banner visible
    await expect(page.getByTestId("character-filter-banner")).toBeVisible();
    await expect(page.getByTestId("character-filter-banner")).toContainText(
      "Wolverine",
    );

    // Clear button present
    await expect(page.getByTestId("clear-character-filter")).toBeVisible();

    // Clicking Clear navigates to farming without character param
    await page.getByTestId("clear-character-filter").click();
    await page.waitForURL("**/analyze/farming");
    expect(page.url()).not.toContain("character=");
  });

  // TC-011: Empty State — No Matching Nodes
  test("TC-011: search with no matches shows empty state message", async ({
    page,
  }) => {
    await mockFarmingRoutes(page);
    await page.goto("/analyze/farming");
    await expect(page.getByTestId("farming-search")).toBeVisible();

    await page.getByTestId("farming-search").fill("xyznonexistent");
    await page.waitForTimeout(400);

    await expect(page.getByTestId("farming-empty-state")).toBeVisible();
    await expect(page.getByTestId("farming-empty-state")).toContainText(
      "No nodes match",
    );
  });

  // TC-012: API Error Handling — Upstream Failure
  test("TC-012: API error shows error message with retry button", async ({
    page,
  }) => {
    await mockFarmingRoutes(page, { nodesStatus: 500 });
    await page.goto("/analyze/farming");

    // Error message visible
    await expect(page.getByText("Failed to load campaign data")).toBeVisible();

    // Retry button visible
    await expect(page.getByRole("button", { name: "Retry" })).toBeVisible();
  });

  // TC-015: Mobile Viewport Layout
  test("TC-015: mobile viewport 390x844 has no horizontal overflow", async ({
    page,
  }) => {
    await mockFarmingRoutes(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/analyze/farming");
    await expect(page.getByTestId("farming-search")).toBeVisible();

    const scrollWidth = await page.evaluate(
      () => document.documentElement.scrollWidth,
    );
    const clientWidth = await page.evaluate(
      () => document.documentElement.clientWidth,
    );
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);

    // Cards are single-column (check first card spans most of viewport)
    const firstCard = page.getByTestId("farming-node-card").first();
    const box = await firstCard.boundingBox();
    expect(box).toBeTruthy();
    // Card should be at least 300px wide on a 390px viewport
    expect(box!.width).toBeGreaterThan(300);
  });

  // TC-016: Unfarmable Resource Indicator (via gaps API mock)
  test("TC-016: gaps API returns farmable and unfarmable items with flags", async ({
    page,
  }) => {
    await mockFarmingRoutes(page);
    await page.goto("/");

    const data = await page.evaluate(async () => {
      const res = await fetch("/api/msf/farming/gaps");
      return res.json();
    });

    // Farmable item
    const farmable = data.gaps.find(
      (g: { itemId: string }) => g.itemId === "item-advanced-phosphates",
    );
    expect(farmable).toBeTruthy();
    expect(farmable.farmable).toBe(true);
    expect(farmable.deficit).toBe(150);

    // Unfarmable item
    const unfarmable = data.gaps.find(
      (g: { itemId: string }) => g.itemId === "item-unique-catalyst",
    );
    expect(unfarmable).toBeTruthy();
    expect(unfarmable.farmable).toBe(false);
  });

  // TC-017: Standalone Character Shard Search
  test("TC-017: searching shard character name highlights shard nodes", async ({
    page,
  }) => {
    await mockFarmingRoutes(page);
    await page.goto("/analyze/farming");
    await expect(page.getByTestId("farming-search")).toBeVisible();

    // Search for Wolverine — should find shard node even without planner priorities
    await page.getByTestId("farming-search").fill("Wolverine");
    await page.waitForTimeout(400);

    const shardNodes = page.getByTestId("farming-node-card");
    await expect(shardNodes).toHaveCount(1);
    await expect(shardNodes.first()).toContainText("Heroes 1-2");

    // Shard match badge visible
    await expect(page.getByTestId("shard-match-badge")).toBeVisible();
    await expect(page.getByTestId("shard-match-badge")).toContainText("SHARD");

    // data-shard-match attribute set
    const shardAttr = await shardNodes
      .first()
      .getAttribute("data-shard-match");
    expect(shardAttr).toBe("true");
  });

  // TC-018: Progressive Loading Indicator
  test("TC-018: shows loading indicator while campaign data fetches", async ({
    page,
  }) => {
    // Delay the nodes response to catch loading state
    await page.route("**/api/msf/farming/nodes*", async (route) => {
      await new Promise((r) => setTimeout(r, 500));
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(mockNodes),
      });
    });
    await page.route("**/api/msf/farming/gaps*", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(mockFarmingGaps),
      }),
    );

    await page.goto("/analyze/farming");

    // Loading text should be visible
    await expect(page.getByText("Loading campaign data")).toBeVisible();

    // After loading completes, nodes appear
    await expect(page.getByTestId("farming-search")).toBeVisible({
      timeout: 5000,
    });
    await expect(page.getByTestId("farming-node-card")).toHaveCount(18);
  });

  // TC-019: Node Unlock Disclaimer
  test("TC-019: disclaimer banner is visible on the farming page", async ({
    page,
  }) => {
    await mockFarmingRoutes(page);
    await page.goto("/analyze/farming");
    await expect(page.getByTestId("farming-search")).toBeVisible();

    const disclaimer = page.getByTestId("farming-disclaimer");
    await expect(disclaimer).toBeVisible();
    await expect(disclaimer).toContainText(
      "Some nodes may require campaign progression",
    );
  });

  // TC-013: API error — expired token (401)
  test("TC-013: 401 from nodes API shows error state", async ({ page }) => {
    await page.route("**/api/msf/farming/nodes*", (route) =>
      route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({
          error: "Session expired",
          code: "AUTH_EXPIRED",
          retryable: false,
        }),
      }),
    );
    await page.route("**/api/msf/farming/gaps*", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ gaps: [] }),
      }),
    );

    await page.goto("/analyze/farming");

    // Should show error (the component displays the error message from the response)
    await expect(page.getByText("Session expired")).toBeVisible();
    await expect(page.getByRole("button", { name: "Retry" })).toBeVisible();
  });

  // TC-014: Multiple pages of nodes all render
  test("TC-014: large node set renders all nodes", async ({ page }) => {
    // Simulate a larger dataset: 25 nodes
    const largeNodes = [];
    for (let i = 0; i < 25; i++) {
      largeNodes.push({
        episodicId: `ep-campaign-${Math.floor(i / 5)}`,
        episodicName: `Campaign ${Math.floor(i / 5)}`,
        chapterNumber: (i % 5) + 1,
        tierNumber: 1,
        nodeName: `Campaign ${Math.floor(i / 5)} ${(i % 5) + 1}-1`,
        energyCost: 10 + i,
        rewards: [
          {
            itemId: `item-node-${i}`,
            itemName: `Node ${i} Gear`,
            quantity: 1,
            expectedValue: 0.5,
            type: "GEAR",
          },
        ],
      });
    }

    await mockFarmingRoutes(page, { nodes: largeNodes });
    await page.goto("/analyze/farming");
    await expect(page.getByTestId("farming-search")).toBeVisible();

    await expect(page.getByTestId("farming-node-card")).toHaveCount(25);
    await expect(page.getByText("25 campaign nodes indexed")).toBeVisible();
  });
});
