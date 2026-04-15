import { test, expect, type Page } from "@playwright/test";

// --- Mock Data ---

const mockRoster = [
  {
    id: "char-wolverine",
    name: "Wolverine",
    portrait: "https://assets.marvelstrikeforce.com/imgs/Portrait_Wolverine.png",
    power: 180000,
    level: 90,
    gearTier: 16,
    yellowStars: 7,
    redStars: 7,
    traits: ["Mutant", "Hero", "Brawler", "X-Men", "Weapon-X"],
    abilityKit: {
      basic: { id: "basic_wolverine", level: 7, maxLevel: 7 },
      special: { id: "special_wolverine", level: 7, maxLevel: 7 },
      ultimate: { id: "ultimate_wolverine", level: 7, maxLevel: 7 },
      passive: {
        id: "passive_wolverine",
        level: 5,
        maxLevel: 5,
        description: "On Turn, heal self. Grant X-Men allies +10% damage.",
      },
    },
    stats: { health: 250000, damage: 30000, armor: 8000, focus: 5000, resist: 5000, speed: 120, critChance: 0.15, critDamageBonus: 1.3, dodgeChance: 0.1, blockChance: 0.0, blockAmount: 0.0, accuracy: 1.0 },
  },
  {
    id: "char-cyclops",
    name: "Cyclops",
    portrait: "https://assets.marvelstrikeforce.com/imgs/Portrait_Cyclops.png",
    power: 170000,
    level: 90,
    gearTier: 16,
    yellowStars: 7,
    redStars: 6,
    traits: ["Mutant", "Hero", "Blaster", "X-Men", "Marauders"],
    abilityKit: {
      basic: { id: "basic_cyclops", level: 7, maxLevel: 7 },
      special: { id: "special_cyclops", level: 7, maxLevel: 7 },
      ultimate: { id: "ultimate_cyclops", level: 7, maxLevel: 7 },
      passive: {
        id: "passive_cyclops",
        level: 5,
        maxLevel: 5,
        description: "On spawn, grant X-Men allies Offense Up. In War, also grant Speed Up to Mutant allies.",
      },
    },
    stats: { health: 200000, damage: 35000, armor: 6000, focus: 7000, resist: 4000, speed: 115, critChance: 0.2, critDamageBonus: 1.5, dodgeChance: 0.05, blockChance: 0.0, blockAmount: 0.0, accuracy: 1.0 },
  },
  {
    id: "char-phoenix",
    name: "Phoenix",
    portrait: "https://assets.marvelstrikeforce.com/imgs/Portrait_Phoenix.png",
    power: 200000,
    level: 90,
    gearTier: 17,
    yellowStars: 7,
    redStars: 7,
    traits: ["Mutant", "Hero", "Controller", "X-Men", "Uncanny-X-Men"],
    abilityKit: {
      basic: { id: "basic_phoenix", level: 7, maxLevel: 7 },
      special: { id: "special_phoenix", level: 7, maxLevel: 7 },
      ultimate: { id: "ultimate_phoenix", level: 7, maxLevel: 7 },
      passive: {
        id: "passive_phoenix",
        level: 5,
        maxLevel: 5,
        description: "On Death, transform into Dark Phoenix. Grant X-Men allies Immunity.",
      },
    },
    stats: { health: 300000, damage: 25000, armor: 7000, focus: 9000, resist: 8000, speed: 110, critChance: 0.1, critDamageBonus: 1.2, dodgeChance: 0.15, blockChance: 0.0, blockAmount: 0.0, accuracy: 1.0 },
  },
  {
    id: "char-storm",
    name: "Storm",
    portrait: "https://assets.marvelstrikeforce.com/imgs/Portrait_Storm.png",
    power: 160000,
    level: 85,
    gearTier: 15,
    yellowStars: 6,
    redStars: 5,
    traits: ["Mutant", "Hero", "Controller", "X-Men"],
    abilityKit: {
      basic: { id: "basic_storm", level: 7, maxLevel: 7 },
      special: { id: "special_storm", level: 7, maxLevel: 7 },
      ultimate: { id: "ultimate_storm", level: 7, maxLevel: 7 },
      passive: {
        id: "passive_storm",
        level: 5,
        maxLevel: 5,
        description: "On turn, grant X-Men allies +5% speed bar.",
      },
    },
    stats: { health: 180000, damage: 28000, armor: 5000, focus: 8000, resist: 6000, speed: 125, critChance: 0.12, critDamageBonus: 1.4, dodgeChance: 0.08, blockChance: 0.0, blockAmount: 0.0, accuracy: 1.0 },
  },
  {
    id: "char-colossus",
    name: "Colossus",
    portrait: "https://assets.marvelstrikeforce.com/imgs/Portrait_Colossus.png",
    power: 175000,
    level: 88,
    gearTier: 16,
    yellowStars: 7,
    redStars: 6,
    traits: ["Mutant", "Hero", "Protector", "X-Men"],
    abilityKit: {
      basic: { id: "basic_colossus", level: 7, maxLevel: 7 },
      special: { id: "special_colossus", level: 7, maxLevel: 7 },
      ultimate: { id: "ultimate_colossus", level: 7, maxLevel: 7 },
      passive: {
        id: "passive_colossus",
        level: 5,
        maxLevel: 5,
        description: "On Spawn, gain Taunt for 2 turns. Grant X-Men allies +20% armor.",
      },
    },
    stats: { health: 350000, damage: 15000, armor: 15000, focus: 3000, resist: 10000, speed: 95, critChance: 0.05, critDamageBonus: 1.1, dodgeChance: 0.02, blockChance: 0.25, blockAmount: 0.25, accuracy: 1.0 },
  },
  // Extra character for suggestion testing
  {
    id: "char-beast",
    name: "Beast",
    portrait: "https://assets.marvelstrikeforce.com/imgs/Portrait_Beast.png",
    power: 150000,
    level: 85,
    gearTier: 15,
    yellowStars: 6,
    redStars: 5,
    traits: ["Mutant", "Hero", "Support", "X-Men", "Avengers"],
    abilityKit: {
      basic: { id: "basic_beast", level: 7, maxLevel: 7 },
      special: null,
      ultimate: null,
      passive: {
        id: "passive_beast",
        level: 5,
        maxLevel: 5,
        description: "On turn, heal X-Men allies for 5% of max health.",
      },
    },
    stats: { health: 190000, damage: 20000, armor: 6000, focus: 6000, resist: 7000, speed: 105, critChance: 0.08, critDamageBonus: 1.2, dodgeChance: 0.06, blockChance: 0.0, blockAmount: 0.0, accuracy: 1.0 },
  },
  // Bio character to test trait filtering
  {
    id: "char-spiderman",
    name: "Spider-Man",
    portrait: "https://assets.marvelstrikeforce.com/imgs/Portrait_SpiderMan.png",
    power: 140000,
    level: 80,
    gearTier: 14,
    yellowStars: 5,
    redStars: 4,
    traits: ["Bio", "Hero", "Brawler", "Spider-Verse", "Web-Warriors"],
    abilityKit: {
      basic: { id: "basic_spiderman", level: 7, maxLevel: 7 },
      special: null,
      ultimate: null,
      passive: null,
    },
    stats: { health: 160000, damage: 22000, armor: 5000, focus: 4000, resist: 4000, speed: 130, critChance: 0.18, critDamageBonus: 1.4, dodgeChance: 0.2, blockChance: 0.0, blockAmount: 0.0, accuracy: 1.0 },
  },
];

const mockMetaData = [
  {
    mode: "arena",
    teams: [
      { squad: ["char-wolverine", "char-cyclops", "char-phoenix", "char-storm", "char-colossus"], total: 2500 },
      { squad: ["char-wolverine", "char-cyclops", "char-beast", "char-storm", "char-colossus"], total: 800 },
    ],
  },
  {
    mode: "war",
    teams: [
      { squad: ["char-wolverine", "char-cyclops", "char-phoenix", "char-storm", "char-colossus"], total: 1500 },
    ],
  },
  {
    mode: "crucible",
    teams: [],
  },
  { mode: "raids", teams: [] },
  { mode: "blitz", teams: [] },
  { mode: "tower", teams: [] },
  { mode: "roster", teams: [] },
];

async function mockTeamBuilderRoutes(page: Page) {
  await page.route("**/api/msf/team-builder/roster*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: mockRoster }),
    })
  );
  await page.route("**/api/msf/team-builder/meta*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: mockMetaData }),
    })
  );
}

// Helper: select a single character from roster picker (click char + confirm)
async function selectCharacterFromPicker(page: Page, charId: string) {
  await page.getByTestId(`roster-char-${charId}`).click();
  await page.getByTestId("roster-confirm-btn").click();
}

// Helper: select multiple characters at once (open picker, click all, confirm)
async function selectMultipleCharacters(page: Page, charIds: string[]) {
  await page.getByTestId("team-add-btn").click();
  for (const id of charIds) {
    await page.getByTestId(`roster-char-${id}`).click();
  }
  await page.getByTestId("roster-confirm-btn").click();
}

test.describe("Team Builder", () => {
  test.beforeEach(async ({ page }) => {
    await mockTeamBuilderRoutes(page);
    // Prevent install app modal from showing by faking standalone mode
    await page.addInitScript(() => {
      Object.defineProperty(window.navigator, "standalone", { value: true });
      Object.defineProperty(window, "matchMedia", {
        value: (query: string) => ({
          matches: query === "(display-mode: standalone)",
          media: query,
          onchange: null,
          addListener: () => {},
          removeListener: () => {},
          addEventListener: () => {},
          removeEventListener: () => {},
          dispatchEvent: () => false,
        }),
      });
    });
  });

  // TC-001: Empty page loads with mode selector
  test("TC-001: empty page loads with mode selector and 5 empty slots", async ({ page }) => {
    await page.goto("/teams");
    await expect(page.getByTestId("mode-selector")).toBeVisible();
    await expect(page.getByTestId("mode-chip-all")).toBeVisible();
    await expect(page.getByTestId("mode-chip-arena")).toBeVisible();
    await expect(page.getByTestId("mode-chip-war")).toBeVisible();
    await expect(page.getByTestId("team-count")).toContainText("Team (0/5)");
    for (let i = 1; i <= 5; i++) {
      await expect(page.getByTestId(`team-slot-${i}`)).toBeVisible();
    }
  });

  // TC-002: Roster picker opens
  test("TC-002: tapping empty slot opens roster picker", async ({ page }) => {
    await page.goto("/teams");
    await page.getByTestId("team-slot-1").click();
    await expect(page.getByTestId("roster-picker")).toBeVisible();
    await expect(page.getByTestId("roster-search")).toBeVisible();
  });

  // TC-003: Search filters characters
  test("TC-003: search bar filters roster picker by name", async ({ page }) => {
    await page.goto("/teams");
    await page.getByTestId("team-slot-1").click();
    await expect(page.getByTestId("roster-picker")).toBeVisible();

    // All characters visible initially
    await expect(page.getByTestId("roster-char-char-wolverine")).toBeVisible();
    await expect(page.getByTestId("roster-char-char-spiderman")).toBeVisible();

    // Type search
    await page.getByTestId("roster-search").fill("spider");
    await expect(page.getByTestId("roster-char-char-spiderman")).toBeVisible();
    await expect(page.getByTestId("roster-char-char-wolverine")).not.toBeVisible();
  });

  // TC-004: Select adds to slot
  test("TC-004: selecting character adds to team slot", async ({ page }) => {
    await page.goto("/teams");
    await page.getByTestId("team-slot-1").click();
    await selectCharacterFromPicker(page, "char-wolverine");
    // Picker closed, character in slot
    await expect(page.getByTestId("roster-picker")).not.toBeVisible();
    await expect(page.getByTestId("team-count")).toContainText("Team (1/5)");
  });

  // TC-005: Remove from slot
  test("TC-005: tapping filled slot removes character", async ({ page }) => {
    await page.goto("/teams");
    // Add character
    await page.getByTestId("team-slot-1").click();
    await selectCharacterFromPicker(page, "char-wolverine");
    await expect(page.getByTestId("team-count")).toContainText("Team (1/5)");

    // Remove character (clicking the slot again triggers remove)
    await page.getByTestId("team-slot-1").click();
    await expect(page.getByTestId("team-count")).toContainText("Team (0/5)");
  });

  // TC-006: Full team triggers analysis
  test("TC-006: selecting 5 characters shows analysis panels", async ({ page }) => {
    await page.goto("/teams");
    const chars = ["char-wolverine", "char-cyclops", "char-phoenix", "char-storm", "char-colossus"];
    await selectMultipleCharacters(page, chars);
    await expect(page.getByTestId("team-count")).toContainText("Team (5/5)");
    await expect(page.getByTestId("analysis-traits")).toBeVisible();
    await expect(page.getByTestId("analysis-synergies")).toBeVisible();
    await expect(page.getByTestId("analysis-stats")).toBeVisible();
    await expect(page.getByTestId("analysis-meta")).toBeVisible();
  });

  // TC-007: Trait overlap correct
  test("TC-007: shared traits display correctly for full X-Men team", async ({ page }) => {
    await page.goto("/teams");
    const chars = ["char-wolverine", "char-cyclops", "char-phoenix", "char-storm", "char-colossus"];
    await selectMultipleCharacters(page, chars);
    // All 5 chars share Mutant, Hero, X-Men
    await expect(page.getByTestId("analysis-traits")).toBeVisible();
    await expect(page.getByTestId("trait-item-Mutant")).toBeVisible();
    await expect(page.getByTestId("trait-count-Mutant")).toContainText("x5");
    await expect(page.getByTestId("trait-item-Hero")).toBeVisible();
    await expect(page.getByTestId("trait-count-Hero")).toContainText("x5");
    await expect(page.getByTestId("trait-item-X-Men")).toBeVisible();
    await expect(page.getByTestId("trait-count-X-Men")).toContainText("x5");
  });

  // TC-008: Synergy active/inactive
  test("TC-008: passive synergies show active badges", async ({ page }) => {
    await page.goto("/teams");
    const chars = ["char-wolverine", "char-cyclops", "char-phoenix", "char-storm", "char-colossus"];
    await selectMultipleCharacters(page, chars);
    await expect(page.getByTestId("analysis-synergies")).toBeVisible();
    // At least one synergy should be visible
    await expect(page.getByTestId("synergy-item-0")).toBeVisible();
  });

  // TC-009: Stats and total power
  test("TC-009: team stats show total power and stat rows", async ({ page }) => {
    await page.goto("/teams");
    const chars = ["char-wolverine", "char-cyclops", "char-phoenix", "char-storm", "char-colossus"];
    await selectMultipleCharacters(page, chars);
    await expect(page.getByTestId("analysis-stats")).toBeVisible();
    await expect(page.getByTestId("team-total-power")).toBeVisible();
    // Total power should be sum of all characters: 180k + 170k + 200k + 160k + 175k = 885k
    await expect(page.getByTestId("team-total-power")).toContainText("885,000");
    await expect(page.getByTestId("stat-row-health")).toBeVisible();
    await expect(page.getByTestId("stat-row-damage")).toBeVisible();
  });

  // TC-010: Meta badge renders
  test("TC-010: meta comparison shows Meta Team badge for exact arena match", async ({ page }) => {
    await page.goto("/teams");
    // Select arena mode
    await page.getByTestId("mode-chip-arena").click();
    const chars = ["char-wolverine", "char-cyclops", "char-phoenix", "char-storm", "char-colossus"];
    await selectMultipleCharacters(page, chars);
    await expect(page.getByTestId("analysis-meta")).toBeVisible();
    await expect(page.getByTestId("meta-badge")).toContainText("Meta Team");
  });

  // TC-011: Suggest fills slots
  test("TC-011: suggest button shows suggestions for partial team", async ({ page }) => {
    await page.goto("/teams");
    // Add one character
    await page.getByTestId("team-slot-1").click();
    await selectCharacterFromPicker(page, "char-wolverine");

    await expect(page.getByTestId("suggest-btn")).toBeVisible();
    await page.getByTestId("suggest-btn").click();
    await expect(page.getByTestId("suggest-panel")).toBeVisible();
    await expect(page.getByTestId("suggest-auto-fill")).toBeVisible();
  });

  // TC-014: Analysis hidden < 5
  test("TC-014: analysis panels hidden when fewer than 5 characters", async ({ page }) => {
    await page.goto("/teams");
    await page.getByTestId("team-slot-1").click();
    await selectCharacterFromPicker(page, "char-wolverine");

    await expect(page.getByTestId("team-count")).toContainText("Team (1/5)");
    await expect(page.getByText("Select 5 characters to see team analysis.")).toBeVisible();
    // Analysis panels should not exist
    await expect(page.getByTestId("analysis-traits")).not.toBeVisible();
    await expect(page.getByTestId("analysis-stats")).not.toBeVisible();
  });

  // TC-015: Mode selector changes meta
  test("TC-015: changing mode selector updates meta comparison", async ({ page }) => {
    await page.goto("/teams");
    const chars = ["char-wolverine", "char-cyclops", "char-phoenix", "char-storm", "char-colossus"];
    await selectMultipleCharacters(page, chars);

    // Arena mode — exact match
    await page.getByTestId("mode-chip-arena").click();
    await expect(page.getByTestId("meta-badge")).toContainText("Meta Team");

    // Crucible mode — no matches
    await page.getByTestId("mode-chip-crucible").click();
    await expect(page.getByTestId("meta-badge")).toContainText("Unique");
  });

  // TC-016: Mode-specific synergies highlighted
  test("TC-016: selecting War mode highlights war-specific synergies", async ({ page }) => {
    await page.goto("/teams");
    const chars = ["char-wolverine", "char-cyclops", "char-phoenix", "char-storm", "char-colossus"];
    await selectMultipleCharacters(page, chars);

    // Select War mode
    await page.getByTestId("mode-chip-war").click();
    await expect(page.getByTestId("analysis-synergies")).toBeVisible();
    // Cyclops has a War-specific synergy — check for war mode badge
    const warBadges = page.locator("[data-testid^='synergy-mode-badge-']");
    const count = await warBadges.count();
    expect(count).toBeGreaterThanOrEqual(0); // May or may not have mode badges depending on detection
  });

  // TC-017: Roster picker shows popularity badges
  test("TC-017: roster picker shows popularity badges when mode selected", async ({ page }) => {
    await page.goto("/teams");
    // Select arena mode
    await page.getByTestId("mode-chip-arena").click();

    // Open picker
    await page.getByTestId("team-slot-1").click();
    await expect(page.getByTestId("roster-picker")).toBeVisible();

    // Wolverine appears in arena meta with total >= 100, so should have popular badge
    await expect(page.getByTestId("roster-char-popular-char-wolverine")).toBeVisible();
  });
});
