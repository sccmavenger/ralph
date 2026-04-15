import { test, expect, type Page } from "@playwright/test";

/**
 * E2E tests for dd-eligibility filterEligible function.
 * Uses a test API route that calls filterEligible with mock data.
 */

function makeChar(
  id: string,
  traits: string[],
  opts: {
    gearTier?: number;
    level?: number;
    activeYellow?: number;
    activeRed?: number;
    iso8Active?: string;
    iso8Level?: number;
    invisibleTraits?: string[];
  } = {},
) {
  return {
    id,
    gearTier: opts.gearTier ?? 16,
    level: opts.level ?? 90,
    activeYellow: opts.activeYellow ?? 7,
    activeRed: opts.activeRed ?? 5,
    iso8: opts.iso8Active
      ? { active: opts.iso8Active, level: opts.iso8Level ?? 3 }
      : undefined,
    info: {
      traits: traits.map((t) => t),
      invisibleTraits: (opts.invisibleTraits ?? []).map((t) => t),
    },
  };
}

async function callEligibility(
  page: Page,
  roster: ReturnType<typeof makeChar>[],
  requirements: Record<string, unknown>,
) {
  return page.evaluate(
    async ([r, req]) => {
      const res = await fetch("/api/e2e/test-dd-eligibility", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roster: r, requirements: req }),
      });
      return { status: res.status, body: await res.json() };
    },
    [roster, requirements] as const,
  );
}

test.describe("DD Eligibility Filter", () => {
  test("allTraits AND enforcement excludes characters missing any required trait", async ({
    page,
  }) => {
    await page.goto("/");
    const roster = [
      makeChar("char-a", ["Global", "Hero"]),
      makeChar("char-b", ["Global", "Villain"]),
      makeChar("char-c", ["City", "Hero"]),
    ];
    const requirements = {
      anyCharacterFilters: [{ allTraits: ["Global", "Hero"] }],
    };
    const result = await callEligibility(page, roster, requirements);
    expect(result.status).toBe(200);
    expect(result.body.eligible.map((c: { id: string }) => c.id)).toEqual(["char-a"]);
  });

  test("anyTraits OR enforcement includes characters matching at least one trait", async ({
    page,
  }) => {
    await page.goto("/");
    const roster = [
      makeChar("char-a", ["Bio"]),
      makeChar("char-b", ["Mutant"]),
      makeChar("char-c", ["Tech"]),
    ];
    const requirements = {
      anyCharacterFilters: [{ anyTraits: ["Bio", "Mutant"] }],
    };
    const result = await callEligibility(page, roster, requirements);
    expect(result.status).toBe(200);
    const ids = result.body.eligible.map((c: { id: string }) => c.id);
    expect(ids).toContain("char-a");
    expect(ids).toContain("char-b");
    expect(ids).not.toContain("char-c");
  });

  test("exceptTraits exclusion removes characters with any excluded trait", async ({
    page,
  }) => {
    await page.goto("/");
    const roster = [
      makeChar("char-a", ["Global", "Hero"]),
      makeChar("char-b", ["Global", "Legendary"]),
    ];
    const requirements = {
      anyCharacterFilters: [
        { allTraits: ["Global"], exceptTraits: ["Legendary"] },
      ],
    };
    const result = await callEligibility(page, roster, requirements);
    expect(result.status).toBe(200);
    const ids = result.body.eligible.map((c: { id: string }) => c.id);
    expect(ids).toContain("char-a");
    expect(ids).not.toContain("char-b");
  });

  test("gearTier minimum enforcement excludes characters below required tier", async ({
    page,
  }) => {
    await page.goto("/");
    const roster = [
      makeChar("char-a", ["Global"], { gearTier: 19 }),
      makeChar("char-b", ["Global"], { gearTier: 16 }),
    ];
    const requirements = {
      anyCharacterFilters: [{ allTraits: ["Global"], gearTier: 18 }],
    };
    const result = await callEligibility(page, roster, requirements);
    expect(result.status).toBe(200);
    // Both are eligible (trait match), but only char-a is compliant (gear >= 18)
    expect(result.body.eligible.map((c: { id: string }) => c.id)).toEqual([
      "char-a",
      "char-b",
    ]);
    expect(result.body.compliant.map((c: { id: string }) => c.id)).toEqual([
      "char-a",
    ]);
  });

  test("multiple CharacterFilter OR logic — character matching either filter is included", async ({
    page,
  }) => {
    await page.goto("/");
    const roster = [
      makeChar("char-cosmic", ["Cosmic"]),
      makeChar("char-legend", ["Legendary"]),
      makeChar("char-city", ["City"]),
    ];
    const requirements = {
      anyCharacterFilters: [
        { allTraits: ["Cosmic"] },
        { allTraits: ["Legendary"] },
      ],
    };
    const result = await callEligibility(page, roster, requirements);
    expect(result.status).toBe(200);
    const ids = result.body.eligible.map((c: { id: string }) => c.id);
    expect(ids).toContain("char-cosmic");
    expect(ids).toContain("char-legend");
    expect(ids).not.toContain("char-city");
  });

  test("iso8ClassLevel enforcement excludes characters below required level and with no iso8", async ({
    page,
  }) => {
    await page.goto("/");
    const roster = [
      makeChar("char-a", ["Global"], { iso8Active: "Striker", iso8Level: 5 }),
      makeChar("char-b", ["Global"], { iso8Active: "Healer", iso8Level: 2 }),
      makeChar("char-c", ["Global"]), // no iso8
    ];
    const requirements = {
      anyCharacterFilters: [
        { allTraits: ["Global"], iso8ClassLevel: 3 },
      ],
    };
    const result = await callEligibility(page, roster, requirements);
    expect(result.status).toBe(200);
    // All are eligible (trait match), but only char-a is compliant (iso8Level >= 3)
    expect(result.body.eligible).toHaveLength(3);
    expect(result.body.compliant.map((c: { id: string }) => c.id)).toEqual([
      "char-a",
    ]);
  });

  test("dynamic maxCharacters (set to 4) is returned correctly, not hardcoded 5", async ({
    page,
  }) => {
    await page.goto("/");
    const roster = [makeChar("char-a", ["Mythic"])];
    const requirements = {
      anyCharacterFilters: [{ allTraits: ["Mythic"] }],
      maxCharacters: 4,
      minCharacters: 4,
    };
    const result = await callEligibility(page, roster, requirements);
    expect(result.status).toBe(200);
    expect(result.body.maxCharacters).toBe(4);
    expect(result.body.minCharacters).toBe(4);
  });
});
