/**
 * Cost bundle engine (US-005) — PURE, no network/DB.
 *
 * Computes the full resource cost to take a character from its CURRENT state
 * to a TARGET state (gear tier / level / stars / ability levels). Every piece
 * of data (the "cost book") is passed in by the caller — this module never
 * calls the MSF API or the database, so it is trivially unit-testable and
 * deterministic.
 *
 * ── Where the numbers come from (Open Question #1, resolved) ──────────────
 * Probed live from `/game/v1/upgradeData/{field}` with client-credentials
 * (no player login) via `scripts/probe-upgrade-costs.ts`. The cost book DOES
 * expose gold and the training-XP curve, so nothing here is guessed:
 *
 *   • Training XP  — `characterLevelTotalXp[level]` is the CUMULATIVE training
 *     XP required to reach a level (e.g. lvl 50 = 94,090, lvl 70 = 581,690).
 *     The XP for a level delta is `totalXp[target] - totalXp[current]`.
 *
 *   • Gold         — Gold is item id "SC" (Silver Credits) in the cost book.
 *     It appears as a normal cost line inside `abilityUpgradeCosts` (e.g.
 *     ability level 2 costs "1000x Gold") and inside the yellow-star costs.
 *     We therefore SUM every "SC" cost line we walk, and additionally support
 *     per-tier / cumulative gold curves for gear and stars when the caller
 *     supplies them (`gearGoldPerTier`, `yellowStarTotalGold`,
 *     `characterLevelTotalGold`). All are optional; absent means 0.
 *
 *   • Ability mats — Every non-currency cost line (gear pieces, ability
 *     materials, and star shards) is accumulated into `abilityMats`, a
 *     `Record<itemId, quantity>`. (The field is named `abilityMats` to match
 *     the CostBundle contract in the PRD, but it is the general "materials"
 *     bucket the affordability comparison (US-006) checks against inventory.)
 *
 *   • Cores        — Power Cores are item id "PC". Standard gear/level/star
 *     deltas do not cost cores, so `cores` is normally 0; if a cost book line
 *     ever carries "PC" it is routed here rather than into `abilityMats`.
 *
 * These field shapes mirror the live `/game/v1/upgradeData` responses; the
 * async fetch-based equivalents live in `src/lib/upgrade-calculator.ts`
 * (`calculateGearCost` / `calculateAbilityCost` / `calculateStarCost`). This
 * module is the pure engine those numbers feed into.
 */

/** Gold currency item id in the MSF cost book (a.k.a. "Silver Credits"). */
export const GOLD_ITEM_ID = "SC";
/** Power Cores currency item id in the MSF cost book. */
export const CORE_ITEM_ID = "PC";

export interface AbilityLevels {
  basic: number;
  special: number;
  ultimate: number;
  passive: number;
}

export interface CharacterState {
  gearTier: number;
  level: number;
  stars: number;
  abilities: AbilityLevels;
}

/** A single cost line: `quantity` of item `item`. */
export interface CostItem {
  item: string;
  quantity: number;
}

/**
 * The subset of `/game/v1/upgradeData` needed to price a character delta.
 * All fields except the four core ones are optional so callers can pass only
 * what they have.
 */
export interface CostBook {
  /** gearTiers[tier].slots[].piece — the item id required for each gear slot. */
  gearTiers: Record<string, { slots: { piece: string }[] }>;
  /** Optional gold to fully equip each gear tier, keyed by tier. */
  gearGoldPerTier?: Record<string, number>;
  /** abilityUpgradeCosts[type][level] -> cost lines (mats + gold "SC"). */
  abilityUpgradeCosts: Record<string, Record<string, CostItem[]>>;
  /** Cumulative training XP to reach a level (index = level). */
  characterLevelTotalXp: number[];
  /** Optional cumulative gold to reach a level (index = level). */
  characterLevelTotalGold?: number[];
  /** Cumulative yellow-star shards to reach a star, keyed by star count. */
  yellowStarTotalShards: Record<string, number>;
  /** Optional cumulative gold to reach a star, keyed by star count. */
  yellowStarTotalGold?: Record<string, number>;
}

export interface CostDelta {
  /** Current state, or `null` for an unowned character (priced from zero). */
  current: CharacterState | null;
  /** Desired state. */
  target: CharacterState;
  /** Item id used to key the character's yellow-star shards in `abilityMats`. */
  shardItemId?: string;
}

/** The resource cost to reach the target state. */
export interface CostBundle {
  gold: number;
  cores: number;
  /** itemId -> quantity for gear pieces, ability materials, and star shards. */
  abilityMats: Record<string, number>;
  trainingXp: number;
}

const ABILITY_TYPES = ["basic", "special", "ultimate", "passive"] as const;

/**
 * The baseline state an unowned character is priced from: a level-1, gear-1,
 * 0-star, all-abilities-level-1 unit. Recruiting a character grants gear 1 /
 * level 1 / ability 1, so gear/level/ability loops start above these values.
 */
export const UNOWNED_BASE_STATE: CharacterState = {
  gearTier: 1,
  level: 1,
  stars: 0,
  abilities: { basic: 1, special: 1, ultimate: 1, passive: 1 },
};

/**
 * Compute the full {@link CostBundle} for a character delta. Pure: no I/O, no
 * mutation of the inputs, identical inputs always yield identical output.
 *
 * - An unowned character (`delta.current === null`) is priced from
 *   {@link UNOWNED_BASE_STATE}.
 * - When the target already meets/beats the current state on every dimension
 *   the bundle is all-zero / empty.
 */
export function computeCostBundle(book: CostBook, delta: CostDelta): CostBundle {
  const current = delta.current ?? UNOWNED_BASE_STATE;
  const { target } = delta;

  let gold = 0;
  let cores = 0;
  let trainingXp = 0;
  const abilityMats: Record<string, number> = {};

  const addItem = (itemId: string, quantity: number): void => {
    if (!itemId || quantity <= 0) return;
    abilityMats[itemId] = (abilityMats[itemId] ?? 0) + quantity;
  };

  // Route a raw cost line to gold / cores / materials by its item id.
  const addCostLine = (line: CostItem): void => {
    const qty = line.quantity ?? 0;
    if (qty <= 0) return;
    if (line.item === GOLD_ITEM_ID) gold += qty;
    else if (line.item === CORE_ITEM_ID) cores += qty;
    else addItem(line.item, qty);
  };

  // ── Gear tiers: current+1 .. target ─────────────────────────────────────
  for (let tier = current.gearTier + 1; tier <= target.gearTier; tier++) {
    const tierData = book.gearTiers[String(tier)];
    if (tierData?.slots) {
      for (const slot of tierData.slots) {
        if (slot.piece) addItem(slot.piece, 1);
      }
    }
    const tierGold = book.gearGoldPerTier?.[String(tier)];
    if (tierGold) gold += tierGold;
  }

  // ── Ability levels (mats + gold "SC") ───────────────────────────────────
  for (const type of ABILITY_TYPES) {
    const typeCosts = book.abilityUpgradeCosts[type];
    if (!typeCosts) continue;
    for (
      let level = current.abilities[type] + 1;
      level <= target.abilities[type];
      level++
    ) {
      const lines = typeCosts[String(level)];
      if (!lines) continue;
      for (const line of lines) addCostLine(line);
    }
  }

  // ── Character level: training XP (+ optional gold curve) ────────────────
  if (target.level > current.level) {
    const xpTarget = book.characterLevelTotalXp[target.level] ?? 0;
    const xpCurrent = book.characterLevelTotalXp[current.level] ?? 0;
    trainingXp += Math.max(0, xpTarget - xpCurrent);

    if (book.characterLevelTotalGold) {
      const gTarget = book.characterLevelTotalGold[target.level] ?? 0;
      const gCurrent = book.characterLevelTotalGold[current.level] ?? 0;
      gold += Math.max(0, gTarget - gCurrent);
    }
  }

  // ── Yellow stars: shards (+ optional gold curve) ────────────────────────
  if (target.stars > current.stars) {
    const shardTarget = book.yellowStarTotalShards[String(target.stars)] ?? 0;
    const shardCurrent = book.yellowStarTotalShards[String(current.stars)] ?? 0;
    const shards = Math.max(0, shardTarget - shardCurrent);
    if (shards > 0 && delta.shardItemId) addItem(delta.shardItemId, shards);

    if (book.yellowStarTotalGold) {
      const gTarget = book.yellowStarTotalGold[String(target.stars)] ?? 0;
      const gCurrent = book.yellowStarTotalGold[String(current.stars)] ?? 0;
      gold += Math.max(0, gTarget - gCurrent);
    }
  }

  return { gold, cores, abilityMats, trainingXp };
}
