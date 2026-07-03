/**
 * Cost-vs-wallet bill (US-009) — PURE, no network/DB.
 *
 * Turns the deduped under-gate roster gap (US-008 `selectUnlockTeams().underGate`)
 * into the itemised "can I afford this?" bill rendered on the "Unlock X" screen:
 *
 *   • Aggregates the US-005 {@link CostBundle} across ALL under-gate characters
 *     for ALL blocking teams, deduping shared characters by id so each is
 *     counted EXACTLY ONCE (a character blocking two teams is not double-billed).
 *   • Compares the aggregate against the commander's wallet + API balances
 *     (US-006 {@link computeAffordability}) and flattens it to exactly four
 *     table rows — Gold, Cores, Ability Mats, Training XP — each with
 *     `required`, `have`, and a have/short indicator.
 *   • Emits a single top-line verdict: "affordable now" (everything covered),
 *     "short by X …" (at least one resource short), or "Add wallet" (nothing
 *     short but gold/cores can't be judged because no wallet is set — never a
 *     false "short").
 *
 * Every input is passed in by the caller, so the module is deterministic and
 * trivially unit-testable — it is the shared brain the "Unlock X" cost table
 * (and its API route) feed.
 */

import type { CostBook, CostBundle } from "./cost-bundle";
import {
  computeEventCostBundle,
  type EventBlockingChar,
} from "./event-affordability";
import {
  computeAffordability,
  type AffordabilityResult,
  type AffordabilityVerdict,
  type ApiBalances,
  type ResourceComparison,
  type ResourceStatus,
} from "./affordability";
import { formatWalletCompact } from "./wallet-format";
import type { WalletInput } from "./wallet";

/**
 * The subset of an under-gate character the bill needs. Matches the shape of
 * a US-008 `RequiredCharacter` (id + owned + current/required gear & stars).
 */
export interface BillChar {
  id: string;
  /** `false` for a required-but-unowned character (priced from zero). */
  owned: boolean;
  currentGear: number;
  requiredGear: number;
  currentStars: number;
  requiredStars: number;
}

/** The stable identity of one bill row (also its render order). */
export type CostBillRowKey = "gold" | "cores" | "abilityMats" | "trainingXp";

/** One row of the cost-vs-wallet table. */
export interface CostBillRow {
  key: CostBillRowKey;
  /** Human label, e.g. "Gold", "Ability Mats". */
  label: string;
  /** Amount the aggregate cost bundle requires. */
  required: number;
  /** Amount on hand, or `null` when unknown (missing wallet). */
  have: number | null;
  /** How much is missing: `max(0, required - have)`; `0` when ok/unknown. */
  short: number;
  status: ResourceStatus;
}

/** The full cost-vs-wallet bill for an outcome. */
export interface CostBill {
  /** The aggregate cost bundle across the deduped under-gate characters. */
  bundle: CostBundle;
  /** The four table rows, in order: Gold, Cores, Ability Mats, Training XP. */
  rows: CostBillRow[];
  /** Underlying per-resource affordability result (US-006). */
  affordability: AffordabilityResult;
  /** `true` unless a resource is DEFINITELY short (unknowns never force false). */
  affordable: boolean;
  verdict: AffordabilityVerdict;
  /** Top-line text: "affordable now" / "short by 9M gold" / "Add wallet". */
  verdictLabel: string;
}

/** Row label + short-phrase unit for each of the four rows. */
const ROW_META: Record<CostBillRowKey, { label: string; unit: string }> = {
  gold: { label: "Gold", unit: "gold" },
  cores: { label: "Cores", unit: "cores" },
  abilityMats: { label: "Ability Mats", unit: "mats" },
  trainingXp: { label: "Training XP", unit: "XP" },
};

/** Dedupe characters by id, keeping the first occurrence (counted once). */
function dedupeById(chars: BillChar[]): BillChar[] {
  const seen = new Set<string>();
  const out: BillChar[] = [];
  for (const c of chars) {
    if (seen.has(c.id)) continue;
    seen.add(c.id);
    out.push(c);
  }
  return out;
}

/**
 * Collapse the per-item ability-materials comparisons into a single row.
 * `required`/`have`/`short` are summed across every required material — you
 * can't substitute one material for another, so the shortfall is the sum of
 * per-item shortfalls, not `required - have` overall. Materials are always
 * API-known, so the row is never `unknown`.
 */
function aggregateMats(
  mats: Record<string, ResourceComparison>,
): ResourceComparison {
  let required = 0;
  let have = 0;
  let short = 0;
  for (const cmp of Object.values(mats)) {
    required += cmp.required;
    have += cmp.have ?? 0;
    short += cmp.short;
  }
  return { required, have, short, status: short > 0 ? "short" : "ok" };
}

/** Build one table row from a resource comparison. */
function toRow(key: CostBillRowKey, cmp: ResourceComparison): CostBillRow {
  return {
    key,
    label: ROW_META[key].label,
    required: cmp.required,
    have: cmp.have,
    short: cmp.short,
    status: cmp.status,
  };
}

/** Compact short phrase for a row, e.g. "9M gold" — `null` when not short. */
function shortPhrase(row: CostBillRow): string | null {
  if (row.status !== "short") return null;
  return `${formatWalletCompact(row.short)} ${ROW_META[row.key].unit}`;
}

/**
 * Build the cost-vs-wallet bill for a set of under-gate characters.
 *
 * @param chars   Under-gate characters (from US-008; already deduped, but this
 *                function defensively dedupes by id so shared characters are
 *                billed exactly once).
 * @param book    Cost book (gear/star/level curves + mats).
 * @param wallet  Self-reported gold/cores, or `null` when none is set.
 * @param api     API-readable balances (ability mats + training XP on hand).
 */
export function buildCostBill(
  chars: BillChar[],
  book: CostBook,
  wallet: WalletInput | null,
  api: ApiBalances,
): CostBill {
  const deduped = dedupeById(chars);

  // Every under-gate character contributes (none meet the gate). Level is held
  // at 1 on both sides so no training-XP is charged for gear/star-only deltas,
  // matching the gaps data (which carries no level/ability delta).
  const eventChars: EventBlockingChar[] = deduped.map((c) => ({
    currentGear: c.currentGear,
    requiredGear: c.requiredGear,
    currentStars: c.currentStars,
    requiredStars: c.requiredStars,
    meetsRequirements: false,
    owned: c.owned,
  }));

  const bundle = computeEventCostBundle(eventChars, book);
  const affordability = computeAffordability(bundle, wallet, api);

  const rows: CostBillRow[] = [
    toRow("gold", affordability.gold),
    toRow("cores", affordability.cores),
    toRow("abilityMats", aggregateMats(affordability.abilityMats)),
    toRow("trainingXp", affordability.trainingXp),
  ];

  const shortParts = rows
    .map(shortPhrase)
    .filter((p): p is string => p !== null);

  const verdictLabel =
    affordability.verdict === "short"
      ? `short by ${shortParts.join(" + ")}`
      : affordability.verdict === "wallet-needed"
        ? "Add wallet"
        : "affordable now";

  return {
    bundle,
    rows,
    affordability,
    affordable: affordability.affordable,
    verdict: affordability.verdict,
    verdictLabel,
  };
}
