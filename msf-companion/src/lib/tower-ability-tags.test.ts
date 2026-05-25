import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";

vi.mock("@/lib/msf-api", () => ({
  msfApiFetch: vi.fn(),
}));

import { msfApiFetch } from "@/lib/msf-api";
import {
  clearAbilityTagCache,
  extractAbilityTags,
  tagAbilityText,
  type AbilityTag,
} from "./tower-ability-tags";

const mockFetch = msfApiFetch as unknown as Mock;

function charResponse(opts: {
  id: string;
  basic?: string;
  special?: string;
  ultimate?: string;
  passive?: string;
  charsHash?: string;
}) {
  function ability(desc?: string) {
    if (!desc) return undefined;
    return { levels: { "1": { description: "lower-level text" }, "7": { description: desc } } };
  }
  return {
    data: {
      id: opts.id,
      abilityKit: {
        basic: ability(opts.basic),
        special: ability(opts.special),
        ultimate: ability(opts.ultimate),
        passive: ability(opts.passive),
      },
    },
    meta: { hashes: { chars: opts.charsHash ?? "chars-1" } },
  };
}

beforeEach(() => {
  clearAbilityTagCache();
  mockFetch.mockReset();
  // Ensure window.localStorage starts empty for each test.
  if (typeof window !== "undefined") {
    try {
      window.localStorage.clear();
    } catch {
      // ignore
    }
  }
});

describe("tagAbilityText", () => {
  it("emits multiple tags from a kit with several effects", () => {
    const tags = tagAbilityText(
      "Deal damage and apply Bleed. Inflict Offense Down on the target and Stun the primary.",
    );
    expect(tags).toEqual(expect.arrayContaining<AbilityTag>(["bleed", "offense_down", "stun"]));
  });

  it("emits immune_to_bleed instead of bleed when the qualifier is present", () => {
    const tags = tagAbilityText("This character is immune to Bleed and cannot bleed.");
    expect(tags).toContain("immune_to_bleed");
    expect(tags).not.toContain("bleed");
  });

  it("emits revive_block when revives are prevented", () => {
    const tags = tagAbilityText("Targets cannot be revived for the rest of the battle.");
    expect(tags).toContain("revive_block");
    expect(tags).not.toContain("revive");
  });

  it("recognizes dispel, taunt, and counter-attack idioms", () => {
    const tags = tagAbilityText(
      "Taunt all enemies, dispel positive effects on the primary, and Counter-Attack when struck.",
    );
    expect(tags).toEqual(
      expect.arrayContaining<AbilityTag>(["taunt", "dispel", "counter_attack"]),
    );
  });
});

describe("extractAbilityTags", () => {
  it("tags known characters and returns the expected vocabulary entries", async () => {
    mockFetch.mockImplementation((opts: { path: string }) => {
      if (opts.path.includes("CableDeadpool") || opts.path.includes("PunisherCosmic")) {
        return Promise.resolve(
          charResponse({
            id: "PunisherCosmic",
            basic: "Deal damage and apply Bleed to the primary target.",
            special: "Inflict Offense Down on all enemies.",
          }),
        );
      }
      if (opts.path.includes("Mantis")) {
        return Promise.resolve(
          charResponse({
            id: "Mantis",
            special: "Heal the lowest-health ally and clear positive effects from the primary.",
            passive: "On revive, restore 50% Health to all allies.",
          }),
        );
      }
      if (opts.path.includes("Magneto")) {
        return Promise.resolve(
          charResponse({
            id: "Magneto",
            passive: "Magneto is immune to Bleed and cannot be slowed.",
          }),
        );
      }
      return Promise.reject(new Error("unexpected character"));
    });

    const result = await extractAbilityTags(["PunisherCosmic", "Mantis", "Magneto"], "tok");

    expect(result.PunisherCosmic).toEqual(
      expect.arrayContaining<AbilityTag>(["bleed", "offense_down"]),
    );
    expect(result.Mantis).toEqual(expect.arrayContaining<AbilityTag>(["heal", "dispel", "revive"]));
    expect(result.Magneto).toContain<AbilityTag>("immune_to_bleed");
  });

  it("uses the in-memory cache on the second call", async () => {
    mockFetch.mockResolvedValue(
      charResponse({ id: "X", basic: "Apply Stun to the primary." }),
    );
    await extractAbilityTags(["X"], "tok");
    await extractAbilityTags(["X"], "tok");
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("invalidates the cache when meta.hashes.chars changes", async () => {
    // Prime the cache with X under chars-v1.
    mockFetch.mockResolvedValueOnce(
      charResponse({
        id: "X",
        basic: "Apply Stun to the primary.",
        charsHash: "chars-v1",
      }),
    );
    await extractAbilityTags(["X"], "tok");
    expect(mockFetch).toHaveBeenCalledTimes(1);

    // Next call requests a NEW character Y under chars-v2 — that response's
    // hash mismatches the stored chars-v1, so the cache (including X) must
    // be invalidated. Y is fetched fresh.
    mockFetch.mockResolvedValueOnce(
      charResponse({
        id: "Y",
        basic: "Apply Slow.",
        charsHash: "chars-v2",
      }),
    );
    await extractAbilityTags(["Y"], "tok");
    expect(mockFetch).toHaveBeenCalledTimes(2);

    // Re-requesting X should now miss the (cleared) cache and re-fetch.
    mockFetch.mockResolvedValueOnce(
      charResponse({
        id: "X",
        basic: "Apply Bleed to the primary.",
        charsHash: "chars-v2",
      }),
    );
    const third = await extractAbilityTags(["X"], "tok");
    expect(mockFetch).toHaveBeenCalledTimes(3);
    expect(third.X).toContain<AbilityTag>("bleed");
  });

  it("omits characters whose fetch rejects rather than failing the whole call", async () => {
    mockFetch.mockImplementation((opts: { path: string }) => {
      if (opts.path.includes("GoodChar")) {
        return Promise.resolve(charResponse({ id: "GoodChar", basic: "Apply Slow." }));
      }
      return Promise.reject(new Error("API down"));
    });

    const result = await extractAbilityTags(["GoodChar", "BadChar"], "tok");
    expect(result.GoodChar).toContain<AbilityTag>("slow");
    expect(result.BadChar).toBeUndefined();
  });
});
