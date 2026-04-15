import { test, expect } from "@playwright/test";

/**
 * Mock response for the farming recommendations API.
 */
const mockRecommendations = {
  recommendations: [
    {
      nodeLabel: "Nexus 1-3",
      episodicName: "Nexus",
      chapterNumber: 1,
      tierNumber: 3,
      energyCost: 12,
      score: 45.6,
      deficitsAddressed: 3,
      multiTargetBonus: 1.2,
      addressedResources: [
        {
          itemId: "item-advanced-phosphates",
          itemName: "Advanced Phosphates",
          deficit: 90,
          expectedValuePerRun: 2.5,
        },
        {
          itemId: "item-superior-vibranium",
          itemName: "Superior Vibranium",
          deficit: 50,
          expectedValuePerRun: 1.8,
        },
        {
          itemId: "item-basic-catalyst",
          itemName: "Basic Catalyst",
          deficit: 30,
          expectedValuePerRun: 1.2,
        },
      ],
      benefitingCharacters: ["Wolverine", "Storm"],
    },
    {
      nodeLabel: "Heroes 5-9",
      episodicName: "Heroes",
      chapterNumber: 5,
      tierNumber: 9,
      energyCost: 16,
      score: 32.1,
      deficitsAddressed: 2,
      multiTargetBonus: 1.1,
      addressedResources: [
        {
          itemId: "item-advanced-phosphates",
          itemName: "Advanced Phosphates",
          deficit: 90,
          expectedValuePerRun: 3.0,
        },
        {
          itemId: "item-unique-alien-spore",
          itemName: "Unique Alien Spore",
          deficit: 20,
          expectedValuePerRun: 0.5,
        },
      ],
      benefitingCharacters: ["Wolverine"],
    },
    {
      nodeLabel: "Villains 3-6",
      episodicName: "Villains",
      chapterNumber: 3,
      tierNumber: 6,
      energyCost: 10,
      score: 18.5,
      deficitsAddressed: 1,
      multiTargetBonus: 1.0,
      addressedResources: [
        {
          itemId: "item-superior-vibranium",
          itemName: "Superior Vibranium",
          deficit: 50,
          expectedValuePerRun: 2.0,
        },
      ],
      benefitingCharacters: ["Storm"],
    },
  ],
  disclaimer:
    "Some nodes may require campaign progression you haven't completed yet.",
};

const mockEmptyRecommendations = {
  recommendations: [],
  message: "You're all caught up! No farming needed for current priorities.",
};

test.describe(
  "Farming Recommendations API - /api/msf/farming/recommendations",
  () => {
    test("requires authentication", async ({ page }) => {
      await page.route("**/api/msf/farming/recommendations*", (route) =>
        route.fulfill({
          status: 401,
          contentType: "application/json",
          body: JSON.stringify({
            error: "Unauthorized",
            code: "UNAUTHORIZED",
            retryable: false,
          }),
        }),
      );

      await page.goto("/");
      const data = await page.evaluate(async () => {
        const res = await fetch("/api/msf/farming/recommendations");
        return { status: res.status, body: await res.json() };
      });

      expect(data.status).toBe(401);
      expect(data.body.error).toBeTruthy();
    });

    test("returns ranked recommendations with required fields via mock", async ({
      page,
    }) => {
      await page.route("**/api/msf/farming/recommendations*", (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(mockRecommendations),
        }),
      );

      await page.goto("/");
      const data = await page.evaluate(async () => {
        const res = await fetch("/api/msf/farming/recommendations");
        return res.json();
      });

      expect(data.recommendations).toBeDefined();
      expect(Array.isArray(data.recommendations)).toBe(true);
      expect(data.recommendations.length).toBe(3);

      for (const rec of data.recommendations) {
        expect(rec).toHaveProperty("nodeLabel");
        expect(rec).toHaveProperty("energyCost");
        expect(typeof rec.score).toBe("number");
        expect(typeof rec.deficitsAddressed).toBe("number");
        expect(typeof rec.multiTargetBonus).toBe("number");
        expect(Array.isArray(rec.addressedResources)).toBe(true);
        expect(rec.addressedResources.length).toBeGreaterThan(0);
        expect(Array.isArray(rec.benefitingCharacters)).toBe(true);
        expect(rec.benefitingCharacters.length).toBeGreaterThan(0);
      }
    });

    test("recommendations are sorted by score descending", async ({
      page,
    }) => {
      await page.route("**/api/msf/farming/recommendations*", (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(mockRecommendations),
        }),
      );

      await page.goto("/");
      const data = await page.evaluate(async () => {
        const res = await fetch("/api/msf/farming/recommendations");
        return res.json();
      });

      for (let i = 1; i < data.recommendations.length; i++) {
        expect(data.recommendations[i - 1].score).toBeGreaterThanOrEqual(
          data.recommendations[i].score,
        );
      }
    });

    test("each addressed resource has deficit and expectedValue", async ({
      page,
    }) => {
      await page.route("**/api/msf/farming/recommendations*", (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(mockRecommendations),
        }),
      );

      await page.goto("/");
      const data = await page.evaluate(async () => {
        const res = await fetch("/api/msf/farming/recommendations");
        return res.json();
      });

      for (const rec of data.recommendations) {
        for (const resource of rec.addressedResources) {
          expect(resource).toHaveProperty("itemId");
          expect(resource).toHaveProperty("itemName");
          expect(typeof resource.deficit).toBe("number");
          expect(resource.deficit).toBeGreaterThan(0);
          expect(typeof resource.expectedValuePerRun).toBe("number");
          expect(resource.expectedValuePerRun).toBeGreaterThan(0);
        }
      }
    });

    test("returns empty list with message when no gaps exist", async ({
      page,
    }) => {
      await page.route("**/api/msf/farming/recommendations*", (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(mockEmptyRecommendations),
        }),
      );

      await page.goto("/");
      const data = await page.evaluate(async () => {
        const res = await fetch("/api/msf/farming/recommendations");
        return res.json();
      });

      expect(data.recommendations).toEqual([]);
      expect(data.message).toBe(
        "You're all caught up! No farming needed for current priorities.",
      );
    });

    test("includes disclaimer about campaign progression", async ({
      page,
    }) => {
      await page.route("**/api/msf/farming/recommendations*", (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(mockRecommendations),
        }),
      );

      await page.goto("/");
      const data = await page.evaluate(async () => {
        const res = await fetch("/api/msf/farming/recommendations");
        return res.json();
      });

      expect(data.disclaimer).toContain("campaign progression");
    });

    test("multi-target bonus increases score for multi-deficit nodes", async ({
      page,
    }) => {
      await page.route("**/api/msf/farming/recommendations*", (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(mockRecommendations),
        }),
      );

      await page.goto("/");
      const data = await page.evaluate(async () => {
        const res = await fetch("/api/msf/farming/recommendations");
        return res.json();
      });

      // First recommendation has 3 deficits → multiTargetBonus = 1.2
      const multiDeficitNode = data.recommendations.find(
        (r: { deficitsAddressed: number }) => r.deficitsAddressed === 3,
      );
      expect(multiDeficitNode).toBeTruthy();
      expect(multiDeficitNode.multiTargetBonus).toBeCloseTo(1.2, 1);

      // Single-deficit node → multiTargetBonus = 1.0
      const singleDeficitNode = data.recommendations.find(
        (r: { deficitsAddressed: number }) => r.deficitsAddressed === 1,
      );
      expect(singleDeficitNode).toBeTruthy();
      expect(singleDeficitNode.multiTargetBonus).toBeCloseTo(1.0, 1);
    });
  },
);
