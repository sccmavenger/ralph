/**
 * Affordability comparison (US-006) — PURE, no network/DB.
 *
 * Compares a {@link CostBundle} (produced by the US-005 engine) against the
 * resources a commander actually has:
 *
 *   • gold / cores   — self-reported {@link WalletInput}, or `null` when the
 *                      commander hasn't entered a wallet yet (the feature is
 *                      optional). A missing wallet makes gold/cores `unknown`
 *                      rather than a false `short` — we never claim something
 *                      is unaffordable purely because the wallet is absent.
 *   • abilityMats    — read from the MSF API (`Record<itemId, quantity>`).
 *   • trainingXp     — read from the MSF API.
 *
 * Every input is passed in by the caller, so this module never touches the
 * network or the database: it is deterministic and trivially unit-testable.
 */

import type { CostBundle } from "./cost-bundle";
import type { WalletInput } from "./wallet";

/** Status of a single resource in an affordability check. */
export type ResourceStatus = "ok" | "short" | "unknown";

/** Overall verdict of an affordability check. */
export type AffordabilityVerdict = "affordable" | "short" | "wallet-needed";

/** Per-resource comparison of what is required vs what is on hand. */
export interface ResourceComparison {
  /** Amount required by the cost bundle. */
  required: number;
  /** Amount on hand, or `null` when unknown (missing wallet). */
  have: number | null;
  /** How much is missing: `max(0, required - have)`; `0` when ok/unknown. */
  short: number;
  status: ResourceStatus;
}

/** API-readable balances (never `unknown` — always available). */
export interface ApiBalances {
  /** itemId -> quantity on hand for gear pieces / ability mats / shards. */
  abilityMats: Record<string, number>;
  /** Training XP on hand. */
  trainingXp: number;
}

/** The result of comparing a cost bundle against a commander's resources. */
export interface AffordabilityResult {
  gold: ResourceComparison;
  cores: ResourceComparison;
  trainingXp: ResourceComparison;
  /** itemId -> comparison for every material required by the bundle. */
  abilityMats: Record<string, ResourceComparison>;
  /**
   * `true` unless a resource is DEFINITELY short. A missing wallet never
   * forces this to `false` — see {@link AffordabilityResult.verdict}.
   */
  affordable: boolean;
  /**
   * - `affordable` — everything on hand meets requirement.
   * - `short` — at least one resource is short.
   * - `wallet-needed` — nothing is short, but gold/cores can't be judged
   *   because no wallet is set.
   */
  verdict: AffordabilityVerdict;
}

/**
 * Compare a currency (gold / cores) whose balance may be unknown.
 *
 * - `required <= 0` → always `ok` (a zero-cost currency needs no wallet).
 * - wallet absent (`have === null`) with a real cost → `unknown`, never short.
 * - otherwise → `ok`/`short` with `short = max(0, required - have)`.
 *
 * Boundary `have === required` is affordable (`>=` is inclusive).
 */
function compareCurrency(
  required: number,
  have: number | null,
): ResourceComparison {
  if (required <= 0) {
    return { required, have, short: 0, status: "ok" };
  }
  if (have === null) {
    return { required, have: null, short: 0, status: "unknown" };
  }
  const short = Math.max(0, required - have);
  return { required, have, short, status: short > 0 ? "short" : "ok" };
}

/**
 * Compare an always-known resource (mats / training XP). Boundary
 * `have === required` is affordable (`>=` is inclusive).
 */
function compareKnown(required: number, have: number): ResourceComparison {
  const short = Math.max(0, required - have);
  return { required, have, short, status: short > 0 ? "short" : "ok" };
}

/**
 * Compute affordability of a {@link CostBundle} against a wallet + API
 * balances. Pure: no I/O, no mutation of inputs, deterministic.
 *
 * @param bundle  The cost to cover (from the US-005 engine).
 * @param wallet  Self-reported gold/cores, or `null` when none is set.
 * @param api     API-readable balances (ability mats + training XP).
 */
export function computeAffordability(
  bundle: CostBundle,
  wallet: WalletInput | null,
  api: ApiBalances,
): AffordabilityResult {
  const gold = compareCurrency(bundle.gold, wallet ? wallet.gold : null);
  const cores = compareCurrency(bundle.cores, wallet ? wallet.cores : null);
  const trainingXp = compareKnown(bundle.trainingXp, api.trainingXp);

  const abilityMats: Record<string, ResourceComparison> = {};
  for (const [itemId, required] of Object.entries(bundle.abilityMats)) {
    abilityMats[itemId] = compareKnown(required, api.abilityMats[itemId] ?? 0);
  }

  const comparisons: ResourceComparison[] = [
    gold,
    cores,
    trainingXp,
    ...Object.values(abilityMats),
  ];

  const anyShort = comparisons.some((c) => c.status === "short");
  const anyUnknown = comparisons.some((c) => c.status === "unknown");

  const affordable = !anyShort;
  const verdict: AffordabilityVerdict = anyShort
    ? "short"
    : anyUnknown
      ? "wallet-needed"
      : "affordable";

  return { gold, cores, trainingXp, abilityMats, affordable, verdict };
}
