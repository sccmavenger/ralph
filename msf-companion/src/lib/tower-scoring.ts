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
