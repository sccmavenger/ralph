/**
 * Pure scoring functions for the ability-aware tower planner.
 *
 * All functions in this module are pure (no IO, no side effects) and return
 * scores in the 0–100 range so they can be blended into a composite score
 * by the solver. See `tasks/prd-tower-ability-aware-scoring.md` for context.
 */

import type { Character } from "./tower-readiness";
import { COUNTER_MAP, type CounterMap, type FactionPassiveMap } from "./tower-scoring-data";

/**
 * Score a team 0–100 on faction-passive synergy.
 *
 * Rules:
 * - Returns 0 when no passive activates.
 * - When exactly one passive activates at its `minMembers` threshold, the
 *   score scales linearly from 50 (at the threshold) up to 100 (when all 5
 *   team members share that trait).
 * - When two or more passives activate, the score saturates at 100.
 *
 * Pure: no IO, no side effects.
 */
export function factionSynergyScore(
  team: readonly Character[],
  factionPassives: FactionPassiveMap,
): number {
  if (team.length === 0) return 0;

  let total = 0;

  for (const passive of Object.values(factionPassives)) {
    const count = team.reduce(
      (n, c) => (c.traits.includes(passive.trait) ? n + 1 : n),
      0,
    );
    if (count < passive.minMembers) continue;

    // Scale from 50 (at threshold) to 100 (when all 5 share the trait).
    // If minMembers is already 5 (unusual), an activation is always 100.
    const denom = 5 - passive.minMembers;
    const overshoot = denom > 0 ? (count - passive.minMembers) / denom : 1;
    const passiveScore = 50 + Math.min(1, Math.max(0, overshoot)) * 50;

    total += passiveScore;
    if (total >= 100) return 100;
  }

  return Math.min(100, total);
}

/**
 * Score a team 0–100 on how well its ability kit counters the opponent's.
 *
 * For each opponent tag present in {@link counterMap}, if at least one team
 * member has a tag listed in `counteredBy`, the entry's `weight` is awarded.
 * The earned weight is normalized against the maximum possible weight for
 * this opponent's tag set (so a team with full coverage scores 100, and a
 * team with no coverage of a strong opponent kit scores low).
 *
 * Pure: no IO, no side effects.
 *
 * @param teamTags Map of character id → ability tags for the team.
 * @param opponentTags Flat list of ability tags present on the opponent.
 * @param counterMap Override the default {@link COUNTER_MAP} (mainly for tests).
 */
export function counterScore(
  teamTags: Readonly<Record<string, readonly string[]>>,
  opponentTags: readonly string[],
  counterMap: CounterMap = COUNTER_MAP,
): number {
  if (opponentTags.length === 0) return 0;

  // De-dupe so an opponent kit that mentions "stun" three times doesn't
  // get triple-weighted.
  const uniqueOpp = Array.from(new Set(opponentTags));

  // Build a flat set of all tags our team brings to the fight.
  const teamTagSet = new Set<string>();
  for (const tags of Object.values(teamTags)) {
    for (const t of tags) teamTagSet.add(t);
  }

  let maxWeight = 0;
  let earnedWeight = 0;

  for (const oppTag of uniqueOpp) {
    const entry = counterMap[oppTag];
    if (!entry) continue;
    maxWeight += entry.weight;
    if (entry.counteredBy.some((t) => teamTagSet.has(t))) {
      earnedWeight += entry.weight;
    }
  }

  if (maxWeight === 0) return 0;
  return Math.round((earnedWeight / maxWeight) * 100);
}

/**
 * Score a team 0–100 on role balance.
 *
 * Roles are inferred from each character's ability tags:
 * - healer: has the `heal` tag
 * - tank: has `taunt` or `defense_up`
 * - disruptor: has `ability_block`, `stun`, or `disrupted`
 * - damage: any character without a healer or tank tag (disruptors can also
 *   double as damage so they still count toward the damage bucket)
 *
 * A "balanced" team has ≥1 healer, ≥1 tank-or-disruptor, and ≥2 damage —
 * each of those three buckets contributes ~⅓ of the score, so a fully
 * balanced team scores 100 and a single-role team scores ~33.
 *
 * Pure: no IO, no side effects.
 */
export function roleBalanceScore(
  teamTags: Readonly<Record<string, readonly string[]>>,
): number {
  const ids = Object.keys(teamTags);
  if (ids.length === 0) return 0;

  const HEALER_TAGS = new Set(["heal"]);
  const TANK_TAGS = new Set(["taunt", "defense_up"]);
  const DISRUPTOR_TAGS = new Set(["ability_block", "stun", "disrupted"]);

  let healers = 0;
  let tanks = 0;
  let disruptors = 0;
  let damage = 0;

  for (const id of ids) {
    const tags = teamTags[id] ?? [];
    const isHealer = tags.some((t) => HEALER_TAGS.has(t));
    const isTank = tags.some((t) => TANK_TAGS.has(t));
    const isDisruptor = tags.some((t) => DISRUPTOR_TAGS.has(t));

    if (isHealer) healers += 1;
    if (isTank) tanks += 1;
    if (isDisruptor) disruptors += 1;
    // Damage = anyone who isn't pigeonholed as a pure support (healer/tank).
    if (!isHealer && !isTank) damage += 1;
  }

  // Three balance components, each worth up to 100/3.
  const healerComponent = Math.min(1, healers) * (100 / 3);
  const frontlineComponent = Math.min(1, tanks + disruptors) * (100 / 3);
  const damageComponent = Math.min(1, damage / 2) * (100 / 3);

  return Math.min(
    100,
    Math.round(healerComponent + frontlineComponent + damageComponent),
  );
}

// ── Composite scoring (US-006) ────────────────────────────────────────────

/**
 * Weights for the composite tower score (US-006). They sum to 1.0 and are
 * exposed as a single exported constant so they can be tuned without
 * touching the solver. Order: power-margin > counter > faction synergy >
 * role balance.
 */
export const TOWER_SCORING_WEIGHTS = {
  power: 0.45,
  synergy: 0.2,
  counter: 0.25,
  roleBalance: 0.1,
} as const;

/**
 * Width (in ratio points above the safety margin) over which
 * {@link powerMarginScore} ramps from 0 to 100. A team that exceeds the
 * safety margin by 50 percentage points (e.g. ratio 1.60 when safetyMargin
 * = 1.10) scores 100; anything at or below the safety margin scores 0.
 */
const POWER_MARGIN_SATURATION = 0.5;

/**
 * Score a team 0–100 on how much extra power it has over the safety margin.
 *
 * - 0 when teamPower / opponentPower is at or below `safetyMargin`.
 * - 100 when the ratio is at least `safetyMargin + 0.50` (i.e. 50 percentage
 *   points over the safety threshold).
 *
 * Pure: no IO.
 */
export function powerMarginScore(
  teamPower: number,
  opponentPower: number,
  safetyMargin: number,
): number {
  if (opponentPower <= 0) return 0;
  const ratio = teamPower / opponentPower;
  const extra = ratio - safetyMargin;
  if (extra <= 0) return 0;
  const normalized = Math.min(1, extra / POWER_MARGIN_SATURATION);
  return Math.round(normalized * 100);
}

/**
 * Per-sub-score breakdown of the composite tower score. All values 0–100.
 * `total` is the weighted sum (using {@link TOWER_SCORING_WEIGHTS}) rounded
 * to the nearest integer.
 */
export interface CompositeBreakdown {
  power: number;
  synergy: number;
  counter: number;
  roleBalance: number;
  total: number;
}

/**
 * Compute the composite score (US-006) for a candidate team against a known
 * opponent. The composite blends:
 *   - {@link powerMarginScore} (45%)
 *   - {@link factionSynergyScore} (20%)
 *   - {@link counterScore} (25%)
 *   - {@link roleBalanceScore} (10%)
 *
 * Pure: no IO, no side effects.
 */
export function compositeScore(
  team: readonly Character[],
  teamPower: number,
  opponentPower: number,
  safetyMargin: number,
  factionPassives: FactionPassiveMap,
  teamTags: Readonly<Record<string, readonly string[]>>,
  opponentTags: readonly string[],
  counterMap: CounterMap = COUNTER_MAP,
): CompositeBreakdown {
  const power = powerMarginScore(teamPower, opponentPower, safetyMargin);
  const synergy = factionSynergyScore(team, factionPassives);
  const counter = counterScore(teamTags, opponentTags, counterMap);
  const roleBalance = roleBalanceScore(teamTags);
  const total = Math.round(
    power * TOWER_SCORING_WEIGHTS.power +
      synergy * TOWER_SCORING_WEIGHTS.synergy +
      counter * TOWER_SCORING_WEIGHTS.counter +
      roleBalance * TOWER_SCORING_WEIGHTS.roleBalance,
  );
  return { power, synergy, counter, roleBalance, total };
}

