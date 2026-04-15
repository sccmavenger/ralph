import type { Page } from "@playwright/test";

/**
 * Mock data for planner UI tests. Uses Playwright route interception
 * so UI tests work even when MSF API tokens are expired.
 */

export const mockGapsData = [
  {
    eventId: "evt-alpha",
    eventName: "Alpha Raid Season",
    type: "raid",
    startTime: new Date(Date.now() + 2 * 24 * 3600000).toISOString(),
    endTime: new Date(Date.now() + 9 * 24 * 3600000).toISOString(),
    readinessPercent: 72,
    characters: [
      {
        id: "char-wolverine",
        name: "Wolverine",
        portrait: "https://assets.marvelstrikeforce.com/imgs/Portrait_Wolverine.png",
        currentGear: 14,
        requiredGear: 16,
        currentStars: 5,
        requiredStars: 5,
        meetsRequirements: false,
        owned: true,
      },
      {
        id: "char-cyclops",
        name: "Cyclops",
        portrait: "https://assets.marvelstrikeforce.com/imgs/Portrait_Cyclops.png",
        currentGear: 16,
        requiredGear: 16,
        currentStars: 7,
        requiredStars: 5,
        meetsRequirements: true,
        owned: true,
      },
      {
        id: "char-phoenix",
        name: "Phoenix",
        portrait: "",
        currentGear: 0,
        requiredGear: 16,
        currentStars: 0,
        requiredStars: 5,
        meetsRequirements: false,
        owned: false,
      },
    ],
  },
  {
    eventId: "evt-beta",
    eventName: "Beta Blitz",
    type: "blitz",
    startTime: new Date(Date.now() - 1 * 24 * 3600000).toISOString(),
    endTime: new Date(Date.now() + 5 * 24 * 3600000).toISOString(),
    readinessPercent: 90,
    characters: [
      {
        id: "char-wolverine",
        name: "Wolverine",
        portrait: "https://assets.marvelstrikeforce.com/imgs/Portrait_Wolverine.png",
        currentGear: 14,
        requiredGear: 14,
        currentStars: 5,
        requiredStars: 5,
        meetsRequirements: true,
        owned: true,
      },
    ],
  },
];

export const mockPrioritiesData = [
  {
    rank: 1,
    characterId: "char-wolverine",
    name: "Wolverine",
    portrait: "https://assets.marvelstrikeforce.com/imgs/Portrait_Wolverine.png",
    score: 14.5,
    events: [
      { id: "evt-alpha", name: "Alpha Raid Season", startTime: mockGapsData[0].startTime },
      { id: "evt-beta", name: "Beta Blitz", startTime: mockGapsData[1].startTime },
    ],
    currentGear: 14,
    requiredGear: 16,
  },
  {
    rank: 2,
    characterId: "char-phoenix",
    name: "Phoenix",
    portrait: "",
    score: 8.2,
    events: [
      { id: "evt-alpha", name: "Alpha Raid Season", startTime: mockGapsData[0].startTime },
    ],
    currentGear: 0,
    requiredGear: 16,
  },
  {
    rank: 3,
    characterId: "char-storm",
    name: "Storm",
    portrait: "https://assets.marvelstrikeforce.com/imgs/Portrait_Storm.png",
    score: 6.1,
    events: [
      { id: "evt-beta", name: "Beta Blitz", startTime: mockGapsData[1].startTime },
    ],
    currentGear: 12,
    requiredGear: 16,
  },
];

/**
 * Intercept planner API routes and return mock data.
 * Call this before navigating to /planner in UI tests.
 */
export async function mockPlannerApiRoutes(page: Page) {
  await page.route("**/api/msf/planner/gaps*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockGapsData),
    }),
  );
  await page.route("**/api/msf/planner/priorities*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockPrioritiesData),
    }),
  );
}
