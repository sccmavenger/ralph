/**
 * Pure scoring functions for the ability-aware tower planner.
 *
 * All functions in this module are pure (no IO, no side effects) and return
 * scores in the 0–100 range so they can be blended into a composite score
 * by the solver. See `tasks/prd-tower-ability-aware-scoring.md` for context.
 */

import type { Character } from "./tower-readiness";
import type { FactionPassiveMap } from "./tower-scoring-data";

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
