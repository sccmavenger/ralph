/**
 * Per-event affordability badge (US-007) — PURE, no network/DB.
 *
 * Turns the US-005 cost engine + US-006 comparison into the single at-a-glance
 * badge shown on each planner event card:
 *
 *   • "affordable now"                 — green   (wallet covers the event)
 *   • "short by X gold" / "… cores"    — amber/red (wallet is short)
 *   • "Add wallet to see affordability"— neutral (no wallet set — never a
 *                                        misleading "short"/"affordable")
 *
 * The badge aggregates the cost of finishing an event across its *blocking*
 * characters (those that do not yet meet the gate) and compares that against
 * the commander's self-reported wallet. Every input is passed in by the
 * caller, so this module is deterministic and trivially unit-testable — it is
 * the shared brain the `/api/msf/planner/affordability` route feeds.
 *
 * Scope note: the planner gaps data only exposes each blocking character's
 * gear-tier and yellow-star deltas (not level/ability deltas), so the cost
 * bundle here is priced from those two dimensions using the generic gold
 * curves in the cost book. The full itemised bill (mats + XP + level gold)
 * lives on the "Unlock X" screen (US-009). This badge is the summary.
 */

import {
  computeCostBundle,
  type CostBook,
  type CostBundle,
  type CharacterState,
} from "./cost-bundle";
import {
  computeAffordability,
  type AffordabilityResult,
  type ApiBalances,
  type ResourceComparison,
} from "./affordability";
import { formatWalletCompact } from "./wallet-format";
import type { WalletInput } from "./wallet";

/**
 * The subset of a planner-gaps character the badge needs. Mirrors the shape
 * returned by `GET /api/msf/planner/gaps` (`characters[]`).
 */
export interface EventBlockingChar {
  currentGear: number;
  requiredGear: number;
  currentStars: number;
  requiredStars: number;
  /** Already satisfies the gate — contributes nothing to the cost. */
  meetsRequirements: boolean;
  /** `false` for a required-but-unowned character (priced from zero). */
  owned: boolean;
}

/** Visual tone of the badge, mapped to colours in the UI. */
export type BadgeTone = "affordable" | "short" | "wallet-needed";

/** The rendered badge for one event. */
export interface EventBadge {
  tone: BadgeTone;
  /** Human label, e.g. "affordable now", "short by 9M gold". */
  label: string;
}

/** An all-zero cost bundle (a fully-ready event costs nothing). */
export const EMPTY_BUNDLE: CostBundle = {
  gold: 0,
  cores: 0,
  abilityMats: {},
  trainingXp: 0,
};

/** Neutral ability levels — gaps data carries no ability delta. */
const NEUTRAL_ABILITIES = {
  basic: 1,
  special: 1,
  ultimate: 1,
  passive: 1,
} as const;

/** Sum two cost bundles into a new bundle (inputs are not mutated). */
export function mergeBundles(a: CostBundle, b: CostBundle): CostBundle {
  const abilityMats: Record<string, number> = { ...a.abilityMats };
  for (const [itemId, qty] of Object.entries(b.abilityMats)) {
    abilityMats[itemId] = (abilityMats[itemId] ?? 0) + qty;
  }
  return {
    gold: a.gold + b.gold,
    cores: a.cores + b.cores,
    trainingXp: a.trainingXp + b.trainingXp,
    abilityMats,
  };
}

/**
 * Aggregate the cost to finish an event across its blocking characters.
 *
 * A character contributes only when it does NOT meet the gate. Unowned
 * characters are priced from zero (the cost engine's base state); owned ones
 * from their current gear/stars to the required gear/stars. Level 1 is used on
 * both sides so no training-XP is charged (gaps data has no level delta).
 */
export function computeEventCostBundle(
  chars: EventBlockingChar[],
  book: CostBook,
): CostBundle {
  return chars
    .filter((c) => !c.meetsRequirements)
    .reduce<CostBundle>((acc, c) => {
      const target: CharacterState = {
        gearTier: c.requiredGear,
        level: 1,
        stars: c.requiredStars,
        abilities: { ...NEUTRAL_ABILITIES },
      };
      const current: CharacterState | null = c.owned
        ? {
            gearTier: c.currentGear,
            level: 1,
            stars: c.currentStars,
            abilities: { ...NEUTRAL_ABILITIES },
          }
        : null;
      return mergeBundles(acc, computeCostBundle(book, { current, target }));
    }, { ...EMPTY_BUNDLE, abilityMats: {} });
}

/** Compact currency phrase, e.g. `9M gold`, `6.12K cores`. */
function shortPhrase(cmp: ResourceComparison, unit: string): string | null {
  if (cmp.status !== "short") return null;
  return `${formatWalletCompact(cmp.short)} ${unit}`;
}

/**
 * Derive the event badge from a US-006 affordability result, considering only
 * the wallet-tracked currencies (gold + cores):
 *
 * - any currency short   → `short by <amount> <unit>` (amber/red)
 * - any currency unknown → `Add wallet to see affordability` (no wallet set)
 * - otherwise            → `affordable now` (green)
 *
 * Materials / training-XP are intentionally excluded from the badge wording —
 * they belong to the full itemised bill (US-009), not this summary. Because a
 * missing wallet reports gold/cores as `unknown` (never a false `short`), the
 * badge can never claim "short" purely because no wallet exists.
 */
export function formatCurrencyBadge(result: AffordabilityResult): EventBadge {
  const shortParts = [
    shortPhrase(result.gold, "gold"),
    shortPhrase(result.cores, "cores"),
  ].filter((p): p is string => p !== null);

  if (shortParts.length > 0) {
    return { tone: "short", label: `short by ${shortParts.join(" + ")}` };
  }

  if (result.gold.status === "unknown" || result.cores.status === "unknown") {
    return { tone: "wallet-needed", label: "Add wallet to see affordability" };
  }

  return { tone: "affordable", label: "affordable now" };
}

/**
 * End-to-end convenience: cost bundle → affordability → badge for one event.
 * Pure and deterministic.
 *
 * @param chars   Blocking characters from the planner gaps data.
 * @param book    Cost book (generic gold/shard curves).
 * @param wallet  Self-reported gold/cores, or `null` when none is set.
 * @param api     API-readable balances (mats + XP); unused by the currency
 *                badge but kept for a correct full affordability result.
 */
export function summarizeEventAffordability(
  chars: EventBlockingChar[],
  book: CostBook,
  wallet: WalletInput | null,
  api: ApiBalances,
): { bundle: CostBundle; result: AffordabilityResult; badge: EventBadge } {
  const bundle = computeEventCostBundle(chars, book);
  const result = computeAffordability(bundle, wallet, api);
  const badge = formatCurrencyBadge(result);
  return { bundle, result, badge };
}
