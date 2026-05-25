/**
 * Opponent ability-tag extractor for the tower scoring layer.
 *
 * Given a set of character IDs, fetches each character's ability kit from
 * the MSF API and runs a free-text heuristic tagger over the descriptions
 * to produce a `Record<characterId, tag[]>` where each tag is drawn from a
 * fixed vocabulary (see {@link ABILITY_TAG_VOCABULARY}).
 *
 * Caching:
 * - In-memory `Map<characterId, { hash, tags }>` for the current session.
 * - localStorage persistence keyed by `tower-ability-tags-cache-v1` so the
 *   browser doesn't re-fetch on every page load.
 * - The cache is invalidated when the MSF API reports a new
 *   `meta.hashes.chars` (mirrors the pattern in
 *   {@link file://./tower-enemy-fetcher.ts} and {@link file://./dd-service.ts}).
 *
 * Note: the PRD references an existing `getCharacterAbilities` helper, but
 * no such helper currently lives under `src/lib` (verified by grep). This
 * module is the canonical place to fetch + tag character abilities and
 * uses the existing low-level `msfApiFetch` helper directly, matching the
 * pattern already used by `tower-enemy-fetcher.ts` and `upgrade-calculator.ts`.
 */

import { msfApiFetch } from "@/lib/msf-api";

// ── Public types ──────────────────────────────────────────────────────────

/** Fixed tag vocabulary used by the heuristic tagger. */
export const ABILITY_TAG_VOCABULARY = [
  "revive",
  "heal",
  "bleed",
  "disrupted",
  "slow",
  "blind",
  "offense_down",
  "defense_down",
  "stun",
  "ability_block",
  "dispel",
  "taunt",
  "counter_attack",
  "immune_to_bleed",
  "heal_block",
  "revive_block",
] as const;

export type AbilityTag = (typeof ABILITY_TAG_VOCABULARY)[number];

// ── Raw API response shapes ───────────────────────────────────────────────

interface RawAbilityLevel {
  description?: string;
}

interface RawAbility {
  levels?: Record<string, RawAbilityLevel>;
}

interface RawAbilityKit {
  basic?: RawAbility;
  special?: RawAbility;
  ultimate?: RawAbility;
  passive?: RawAbility;
}

interface RawCharacterResponse {
  data?: {
    id?: string;
    abilityKit?: RawAbilityKit;
  };
  meta?: { hashes?: { chars?: string; nodes?: string } };
}

// ── Cache & hash tracking ────────────────────────────────────────────────

interface CacheEntry {
  hash: string;
  tags: AbilityTag[];
}

const LOCAL_STORAGE_KEY = "tower-ability-tags-cache-v1";
const HASH_STORAGE_KEY = "tower-ability-tags-chars-hash-v1";

const memCache = new Map<string, CacheEntry>();
let storedCharsHash: string | null = null;
let localStorageLoaded = false;

function safeLocalStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function loadFromLocalStorage(): void {
  if (localStorageLoaded) return;
  localStorageLoaded = true;
  const ls = safeLocalStorage();
  if (!ls) return;
  try {
    const raw = ls.getItem(LOCAL_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, CacheEntry>;
      for (const [id, entry] of Object.entries(parsed)) {
        if (entry && typeof entry.hash === "string" && Array.isArray(entry.tags)) {
          memCache.set(id, entry);
        }
      }
    }
    const hash = ls.getItem(HASH_STORAGE_KEY);
    if (hash) storedCharsHash = hash;
  } catch {
    // Corrupt/forbidden storage — silently ignore.
  }
}

function persistToLocalStorage(): void {
  const ls = safeLocalStorage();
  if (!ls) return;
  try {
    const snapshot: Record<string, CacheEntry> = {};
    for (const [id, entry] of memCache.entries()) snapshot[id] = entry;
    ls.setItem(LOCAL_STORAGE_KEY, JSON.stringify(snapshot));
    if (storedCharsHash !== null) ls.setItem(HASH_STORAGE_KEY, storedCharsHash);
  } catch {
    // Quota / forbidden — silently ignore.
  }
}

/**
 * Updates the cache invalidation state based on the upstream `meta.hashes.chars`.
 * Returns true if the cache was just invalidated.
 */
function checkHashInvalidation(meta?: RawCharacterResponse["meta"]): boolean {
  if (!meta?.hashes) return false;
  const charsHash = meta.hashes.chars ?? null;
  if (charsHash === null) return false;
  let invalidated = false;
  if (storedCharsHash !== null && charsHash !== storedCharsHash) {
    invalidated = true;
    memCache.clear();
  }
  storedCharsHash = charsHash;
  return invalidated;
}

/** Clears the in-memory + localStorage cache. Exported for tests. */
export function clearAbilityTagCache(): void {
  memCache.clear();
  storedCharsHash = null;
  localStorageLoaded = false;
  const ls = safeLocalStorage();
  if (!ls) return;
  try {
    ls.removeItem(LOCAL_STORAGE_KEY);
    ls.removeItem(HASH_STORAGE_KEY);
  } catch {
    // ignore
  }
}

// ── Heuristic tagger ─────────────────────────────────────────────────────

/**
 * Cheap, deterministic content hash for an ability kit. Used to detect
 * out-of-band changes to a single character's kit independently of the
 * global `meta.hashes.chars` signal.
 *
 * DJB2-style 32-bit hash, hex-encoded.
 */
function hashAbilityText(text: string): string {
  let h = 5381;
  for (let i = 0; i < text.length; i++) {
    h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  }
  // unsigned hex
  return (h >>> 0).toString(16);
}

function joinAbilityText(kit: RawAbilityKit | undefined): string {
  if (!kit) return "";
  const slots: (RawAbility | undefined)[] = [kit.basic, kit.special, kit.ultimate, kit.passive];
  const parts: string[] = [];
  for (const slot of slots) {
    if (!slot?.levels) continue;
    // Use the highest available level's description (max level kit = max text).
    const levels = Object.keys(slot.levels)
      .map((k) => ({ n: Number(k), v: slot.levels![k] }))
      .filter((x) => Number.isFinite(x.n));
    if (levels.length === 0) continue;
    levels.sort((a, b) => a.n - b.n);
    const top = levels[levels.length - 1].v;
    if (top.description) parts.push(top.description);
  }
  return parts.join("\n");
}

/**
 * Heuristic free-text → tag mapper. Operates on the lowercased ability text.
 *
 * Ordering matters: more-specific patterns (e.g. "immune to bleed",
 * "heal block", "revive block") are checked before their broader siblings
 * so the broader tag is only emitted when the specific qualifier is absent.
 */
export function tagAbilityText(rawText: string): AbilityTag[] {
  const text = rawText.toLowerCase();
  const tags = new Set<AbilityTag>();

  // Specific / qualifier-aware patterns first.
  const immuneToBleed = /immune to (all )?(negative effects|debuffs|bleed)|immunity to bleed|cannot (be )?bleed/.test(
    text,
  );
  if (immuneToBleed) tags.add("immune_to_bleed");

  const healBlock = /heal block|block heals?|prevent(?:s|ed)? heal(?:ing|s)?|cannot be healed/.test(text);
  if (healBlock) tags.add("heal_block");

  const reviveBlock = /revive block|cannot be revived|prevent(?:s|ed)? revives?|block(?:s|ed)? revives?/.test(text);
  if (reviveBlock) tags.add("revive_block");

  // Broad patterns. "Heal" matches "heals" / "healing" but NOT when only
  // "heal block" is present — handled by checking the heal_block tag context.
  // Active "applies bleed" etc.
  if (/\bbleed(?:s|ing)?\b/.test(text) && !immuneToBleed) {
    // "immune to bleed" still mentions the word — guard via specific tag above.
    tags.add("bleed");
  }
  if (/\bheal(?:s|ed|ing)?\b/.test(text) && !healBlock) {
    // Allow heal tag even if heal_block exists IF the text contains an
    // explicit healing verb separate from the block. Cheap heuristic:
    // require an additional standalone "heal" occurrence beyond the block.
    const occurrences = (text.match(/\bheal(?:s|ed|ing)?\b/g) ?? []).length;
    if (!healBlock || occurrences > 1) tags.add("heal");
  }
  if (/\brevive(?:s|d|al|als)?\b/.test(text) && !reviveBlock) {
    const occurrences = (text.match(/\brevive(?:s|d|al|als)?\b/g) ?? []).length;
    if (!reviveBlock || occurrences > 1) tags.add("revive");
  }

  if (/\bdisrupt(?:ed|s|ion)?\b/.test(text)) tags.add("disrupted");
  if (/\bslow(?:s|ed|ing)?\b/.test(text)) tags.add("slow");
  if (/\bblind(?:s|ed|ing)?\b/.test(text)) tags.add("blind");
  if (/offense[- ]down/.test(text)) tags.add("offense_down");
  if (/defense[- ]down/.test(text)) tags.add("defense_down");
  if (/\bstun(?:s|ned|ning)?\b/.test(text)) tags.add("stun");
  if (/ability[- ]block/.test(text)) tags.add("ability_block");
  if (/\bdispel(?:s|led|ling)?\b|clear(?:s|ed)? positive effect/.test(text)) tags.add("dispel");
  if (/\btaunt(?:s|ed|ing)?\b/.test(text)) tags.add("taunt");
  if (/counter[- ]attack|counterattack/.test(text)) tags.add("counter_attack");

  return Array.from(tags);
}

// ── Public API ───────────────────────────────────────────────────────────

/**
 * Fetches and caches ability tags for a list of characters.
 *
 * @param characterIds - MSF character IDs (e.g. "BetaRayBill").
 * @param accessToken - Bearer token for the MSF API.
 * @returns Object mapping characterId → tag array. Characters whose fetch
 *          fails are omitted from the result rather than rejecting the
 *          whole call.
 */
export async function extractAbilityTags(
  characterIds: readonly string[],
  accessToken: string,
): Promise<Record<string, AbilityTag[]>> {
  loadFromLocalStorage();

  const out: Record<string, AbilityTag[]> = {};
  const toFetch: string[] = [];
  for (const id of characterIds) {
    const cached = memCache.get(id);
    if (cached) {
      out[id] = cached.tags;
    } else {
      toFetch.push(id);
    }
  }

  if (toFetch.length === 0) return out;

  const results = await Promise.allSettled(
    toFetch.map((id) =>
      msfApiFetch<RawCharacterResponse>({
        path: `/game/v1/characters/${encodeURIComponent(id)}`,
        accessToken,
        params: { charInfo: "full", abilityKits: "full", lang: "en" },
      }),
    ),
  );

  let mutated = false;
  for (let i = 0; i < results.length; i++) {
    const id = toFetch[i];
    const r = results[i];
    if (r.status !== "fulfilled") continue;
    const raw = r.value;
    if (checkHashInvalidation(raw.meta)) {
      // Cache cleared — re-populate already-resolved entries for previously
      // cached ids in `out` (we no longer trust them).
      for (const cachedId of Object.keys(out)) delete out[cachedId];
    }
    const text = joinAbilityText(raw.data?.abilityKit);
    const hash = hashAbilityText(text);
    const tags = tagAbilityText(text);
    memCache.set(id, { hash, tags });
    out[id] = tags;
    mutated = true;
  }

  if (mutated) persistToLocalStorage();
  return out;
}
