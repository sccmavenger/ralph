import { afterEach, describe, expect, it, vi } from "vitest";
import {
  calculateMetaPerformance,
  extractCharacterAbilities,
  mapSyncedCharacter,
  runOfficialKnowledgeSync,
  sanitizeOfficialCharacterAssetUrl,
} from "./kb-official-sync";
import { uploadKnowledgeDocuments } from "./kb-search";

vi.mock("@/lib/kb-search", () => ({
  uploadKnowledgeDocuments: vi.fn().mockResolvedValue({ succeeded: 0, failed: 0, errors: [] }),
}));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

const asset = (filename: string) => `https://assets.marvelstrikeforce.com/${filename}`;

describe("official knowledge transformations", () => {
  it("reads the current abilityKit contract and chooses the highest level", () => {
    const abilities = extractCharacterAbilities({
      abilityKit: {
        basic: { name: "Web Shot", levels: { "1": { description: "Old" }, "7": { description: "Final <color=#fff>attack</color>" } } },
      },
    });
    expect(abilities).toEqual([{ name: "Web Shot", description: "Final attack", type: "basic", level: 7 }]);
  });

  it("retains type and safe icons without inventing a level for direct descriptions", () => {
    expect(extractCharacterAbilities({
      abilityKit: {
        special: { icon: asset("special.png"), description: "Heal allies." },
        ultimate: { name: "Big Attack", description: "Attack enemies.", icon: "https://untrusted.example/icon.png" },
        passive: { name: "No description", icon: asset("passive.png") },
      },
    })).toEqual([
      { name: "Special", description: "Heal allies.", type: "special", icon: asset("special.png") },
      { name: "Big Attack", description: "Attack enemies.", type: "ultimate" },
    ]);
  });

  it("chooses the highest actual described level, skipping invalid and empty levels", () => {
    expect(extractCharacterAbilities({
      abilityKit: {
        passive: {
          name: "Steady",
          description: "Direct fallback",
          levels: {
            "0": { description: "Invalid zero" },
            "-1": { description: "Invalid negative" },
            "6.5": { description: "Invalid fraction" },
            "7oops": { description: "Invalid suffix" },
            unknown: { description: "Invalid key" },
            "4": { description: "Valid level" },
            "5": { description: "<color=#fff> </color>" },
            "6": { description: null },
          },
        },
      },
    })).toEqual([{ name: "Steady", description: "Valid level", type: "passive", level: 4 }]);
  });

  it("preserves a minimal record without optional imagery or ability metadata", () => {
    expect(mapSyncedCharacter({ id: "Summon", name: "Summoned Unit", traits: ["Summon", "Shield", { id: "Invalid" }] }))
      .toEqual({ id: "Summon", name: "Summoned Unit", traits: ["Summon", "Shield"], abilities: [], teams: [] });
    expect(mapSyncedCharacter({ name: "No ID" })).toBeNull();
  });

  it("maps official portrait and default costume full-body art", () => {
    expect(mapSyncedCharacter({
      id: "Hero",
      name: "Hero",
      portrait: asset("portrait.png"),
      traits: ["Hero", "TeamAlpha"],
      costumes: {
        "0": { name: " Original Costume ", fullArt: asset("original.jpg") },
        "1": { name: "Alternate", fullArt: asset("alternate.jpg") },
      },
    })).toMatchObject({
      portrait: asset("portrait.png"),
      fullBodyArt: { url: asset("original.jpg"), costumeName: "Original Costume" },
      traits: ["Hero", "TeamAlpha"],
      teams: ["TeamAlpha"],
    });
  });

  it("does not substitute arbitrary alternate costumes when default full art is missing", () => {
    const character = mapSyncedCharacter({
      id: "SpiderMan",
      portrait: asset("portrait.png"),
      costumes: {
        "0": { name: "Default" },
        "1": { name: "No Way Home", fullArt: asset("alternate.jpg") },
      },
    });
    expect(character?.portrait).toBe(asset("portrait.png"));
    expect(character).not.toHaveProperty("fullBodyArt");
  });

  it("omits malformed optional image metadata without discarding the character", () => {
    const character = mapSyncedCharacter({
      id: "Hero",
      portrait: "https://assets.marvelstrikeforce.com@evil.example/p.png",
      costumes: { "0": { name: "Original", fullArt: { url: asset("original.jpg") } } },
    });
    expect(character?.id).toBe("Hero");
    expect(character).not.toHaveProperty("portrait");
    expect(character).not.toHaveProperty("fullBodyArt");
  });

  it("allows default full art without making up a costume name", () => {
    expect(mapSyncedCharacter({ id: "Hero", costumes: { "0": { fullArt: asset("original.jpg") } } })?.fullBodyArt)
      .toEqual({ url: asset("original.jpg") });
  });

  it("calculates Crucible defensive holds rather than losses", () => {
    expect(calculateMetaPerformance("crucible-defense", { defends: 100, defeats: 35 }))
      .toEqual({ successes: 65, total: 100, rate: 65 });
  });

  it("calculates War performance from wins and total", () => {
    expect(calculateMetaPerformance("war-offense", { total: 80, wins: 60 }))
      .toEqual({ successes: 60, total: 80, rate: 75 });
  });
});

describe("official character image URLs", () => {
  it("accepts official HTTPS image paths", () => {
    expect(sanitizeOfficialCharacterAssetUrl(asset("key_art/hero.jpg"))).toBe(asset("key_art/hero.jpg"));
  });

  it.each([
    undefined,
    null,
    {},
    "not a url",
    "http://assets.marvelstrikeforce.com/hero.png",
    "//assets.marvelstrikeforce.com/hero.png",
    "https://example.com/hero.png",
    "https://assets.marvelstrikeforce.com.evil.example/hero.png",
    "https://assets.marvelstrikeforce.com@evil.example/hero.png",
    "https://user:password@assets.marvelstrikeforce.com/hero.png",
    "https://%61ssets.marvelstrikeforce.com/hero.png",
    "https://assets.marvelstrikeforce.com:444/hero.png",
    "https://assets.marvelstrikeforce.com/hero.png?redirect=https://evil.example",
    "https://assets.marvelstrikeforce.com/hero.png#fragment",
    "https://assets.marvelstrikeforce.com\\evil.example/hero.png",
    "https://assets.marvelstrikeforce.com/hero\n.png",
    "https://assets.marvelstrikeforce.com/",
  ])("rejects unsafe or malformed value %s", (url) => {
    expect(sanitizeOfficialCharacterAssetUrl(url)).toBeUndefined();
  });
});

describe("official character catalog sync", () => {
  it("requests full costumes with ten-row sequential pages and keeps KB kit text unchanged", async () => {
    vi.stubEnv("SCOPELY_CLIENT_ID", "test-client");
    vi.stubEnv("SCOPELY_CLIENT_SECRET", "test-secret");
    const catalogRequests: URL[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: string) => {
      const url = new URL(input);
      if (url.pathname === "/oauth2/token") return Response.json({ access_token: "test-token" });
      if (url.pathname === "/game/v1/characters") {
        catalogRequests.push(url);
        const page = Number(url.searchParams.get("page"));
        return Response.json({
          data: [{
            id: `Hero${page}`,
            name: `Hero ${page}`,
            portrait: asset("portrait.png"),
            costumes: { "0": { name: "Original", fullArt: asset("original.jpg") } },
            abilityKit: { basic: { name: "Hit", levels: { "7": { description: "Attack <color=#fff>all</color> enemies." } } } },
          }],
          meta: { perTotal: 11, perPage: 10 },
        });
      }
      if (url.pathname.includes("/analysis/")) return Response.json({ data: [] });
      if (url.pathname.endsWith("getArticles")) return Response.json([]);
      if (url.hostname === "www.reddit.com") return new Response("<feed></feed>");
      throw new Error(`Unexpected test request: ${url.pathname}`);
    }));

    const result = await runOfficialKnowledgeSync();

    expect(catalogRequests.map((url) => url.searchParams.get("page"))).toEqual(["1", "2"]);
    for (const url of catalogRequests) {
      expect(url.searchParams.get("perPage")).toBe("10");
      expect(url.searchParams.get("costumes")).toBe("full");
      expect(url.searchParams.get("abilityKits")).toBe("full");
      expect(url.searchParams.get("traitFormat")).toBe("id");
    }
    expect(result.characters).toHaveLength(2);
    expect(result.characters[0].fullBodyArt).toEqual({ url: asset("original.jpg"), costumeName: "Original" });
    expect(vi.mocked(uploadKnowledgeDocuments).mock.calls[0][0][0].content)
      .toContain("Hit: Attack all enemies.");
    expect(result.results.every((item) => item.success)).toBe(true);
  });
});
