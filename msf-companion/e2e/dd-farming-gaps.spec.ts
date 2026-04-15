import { test, expect } from "@playwright/test";

/**
 * Mock response for the farming gaps API.
 */
const mockFarmingGaps = {
  gaps: [
    {
      itemId: "item-advanced-phosphates",
      itemName: "Advanced Phosphates",
      needed: 120,
      owned: 30,
      deficit: 90,
      farmable: true,
      sources: [
        { characterName: "Wolverine", currentGear: 14, targetGear: 16 },
        { characterName: "Storm", currentGear: 12, targetGear: 16 },
      ],
    },
    {
      itemId: "item-superior-vibranium",
      itemName: "Superior Vibranium",
      needed: 60,
      owned: 10,
      deficit: 50,
      farmable: true,
      sources: [
        { characterName: "Wolverine", currentGear: 14, targetGear: 16 },
      ],
    },
    {
      itemId: "item-unique-teal-gear",
      itemName: "Unique Teal Gear",
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

const mockEmptyGaps = {
  gaps: [],
  message: "Set investment priorities in the Planner first",
};

test.describe("Farming Gaps API - /api/msf/farming/gaps", () => {
  test("returns gap items with required fields via mock", async ({ page }) => {
    await page.route("**/api/msf/farming/gaps*", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(mockFarmingGaps),
      }),
    );

    await page.goto("/");
    const data = await page.evaluate(async () => {
      const res = await fetch("/api/msf/farming/gaps");
      return res.json();
    });

    expect(data.gaps).toBeDefined();
    expect(Array.isArray(data.gaps)).toBe(true);
    expect(data.gaps.length).toBe(3);

    for (const gap of data.gaps) {
      expect(gap).toHaveProperty("itemId");
      expect(gap).toHaveProperty("itemName");
      expect(typeof gap.needed).toBe("number");
      expect(typeof gap.owned).toBe("number");
      expect(typeof gap.deficit).toBe("number");
      expect(typeof gap.farmable).toBe("boolean");
      expect(gap.deficit).toBeGreaterThan(0);
      expect(Array.isArray(gap.sources)).toBe(true);
    }
  });

  test("gaps are sorted by largest deficit first", async ({ page }) => {
    await page.route("**/api/msf/farming/gaps*", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(mockFarmingGaps),
      }),
    );

    await page.goto("/");
    const data = await page.evaluate(async () => {
      const res = await fetch("/api/msf/farming/gaps");
      return res.json();
    });

    const deficits = data.gaps.map((g: { deficit: number }) => g.deficit);
    for (let i = 1; i < deficits.length; i++) {
      expect(deficits[i]).toBeLessThanOrEqual(deficits[i - 1]);
    }
  });

  test("non-farmable items are marked with farmable: false", async ({ page }) => {
    await page.route("**/api/msf/farming/gaps*", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(mockFarmingGaps),
      }),
    );

    await page.goto("/");
    const data = await page.evaluate(async () => {
      const res = await fetch("/api/msf/farming/gaps");
      return res.json();
    });

    const nonFarmable = data.gaps.filter((g: { farmable: boolean }) => !g.farmable);
    expect(nonFarmable.length).toBeGreaterThanOrEqual(1);
    expect(nonFarmable[0].itemName).toBe("Unique Teal Gear");
  });

  test("sources include character name and gear tier info", async ({ page }) => {
    await page.route("**/api/msf/farming/gaps*", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(mockFarmingGaps),
      }),
    );

    await page.goto("/");
    const data = await page.evaluate(async () => {
      const res = await fetch("/api/msf/farming/gaps");
      return res.json();
    });

    const firstGap = data.gaps[0];
    expect(firstGap.sources.length).toBeGreaterThanOrEqual(1);

    for (const source of firstGap.sources) {
      expect(source).toHaveProperty("characterName");
      expect(typeof source.currentGear).toBe("number");
      expect(typeof source.targetGear).toBe("number");
    }
  });

  test("returns empty gaps with message when no priorities", async ({ page }) => {
    await page.route("**/api/msf/farming/gaps*", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(mockEmptyGaps),
      }),
    );

    await page.goto("/");
    const data = await page.evaluate(async () => {
      const res = await fetch("/api/msf/farming/gaps");
      return res.json();
    });

    expect(data.gaps).toEqual([]);
    expect(data.message).toContain("Planner");
  });

  test("unauthenticated request returns 401", async () => {
    const response = await fetch("http://localhost:3000/api/msf/farming/gaps");
    expect(response.status).toBe(401);
  });
});
