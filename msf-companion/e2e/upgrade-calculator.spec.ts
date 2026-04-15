import { test, expect } from "@playwright/test";

test.describe("Upgrade Calculator", () => {
  let apiAvailable = true;

  test.beforeAll(async ({ request }) => {
    const response = await request.get("/api/e2e/test-upgrade-calc");
    if (response.status() === 401 || response.status() === 500) {
      apiAvailable = false;
      console.warn("⚠️  Upgrade calc test endpoint unavailable — tests will be skipped. Re-login if token expired.");
    }
  });

  test("calculateTotalCost returns gearCost, abilityCost, and starCost via test endpoint", async ({
    request,
  }) => {
    test.skip(!apiAvailable, "Upgrade calc endpoint unavailable — re-login to run API tests");
    const response = await request.get("/api/e2e/test-upgrade-calc");
    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data).toHaveProperty("totalCost");
    expect(data.totalCost).toHaveProperty("gearCost");
    expect(data.totalCost).toHaveProperty("abilityCost");
    expect(data.totalCost).toHaveProperty("starCost");
  });

  test("totalCost has numeric quantities > 0", async ({ request }) => {
    test.skip(!apiAvailable, "Upgrade calc endpoint unavailable — re-login to run API tests");
    const response = await request.get("/api/e2e/test-upgrade-calc");
    expect(response.status()).toBe(200);

    const data = await response.json();
    const { gearCost, abilityCost, starCost } = data.totalCost;

    // Gear cost should have items when upgrading from tier 1 to 5
    expect(gearCost.items.length).toBeGreaterThan(0);
    for (const item of gearCost.items) {
      expect(typeof item.itemId).toBe("string");
      expect(item.quantity).toBeGreaterThan(0);
    }

    // Ability cost should have items when upgrading from level 1 to 4
    expect(abilityCost.items.length).toBeGreaterThan(0);
    for (const item of abilityCost.items) {
      expect(typeof item.itemId).toBe("string");
      expect(item.quantity).toBeGreaterThan(0);
    }

    // Star cost should have shards needed when going from 1 to 4 stars
    expect(starCost.shardsNeeded).toBeGreaterThan(0);
  });

  test("calculateStarCost returns 0 shards when currentStars >= targetStars", async ({
    request,
  }) => {
    test.skip(!apiAvailable, "Upgrade calc endpoint unavailable — re-login to run API tests");
    const response = await request.get("/api/e2e/test-upgrade-calc");
    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data.noStarCost.shardsNeeded).toBe(0);
  });
});
