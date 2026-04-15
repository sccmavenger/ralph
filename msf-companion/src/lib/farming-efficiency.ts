/**
 * Farming Efficiency — calculates node efficiency scores based on expected
 * reward value per energy spent, with optional multi-target deficit bonuses.
 */

import type { CampaignNode } from "@/lib/farming-service";

export interface ResourceDeficit {
  itemId: string;
  deficit: number; // positive = amount still needed
}

export interface NodeEfficiency {
  /** Base efficiency: sum(expectedValue) / energyCost */
  baseEfficiency: number;
  /** Multi-target bonus multiplier: 1 + 0.1 × (deficitsAddressed - 1), minimum 1 */
  multiTargetBonus: number;
  /** Final score: baseEfficiency × multiTargetBonus */
  score: number;
  /** Number of deficit items this node addresses */
  deficitsAddressed: number;
  /** Per-reward drops-per-energy for display */
  dropsPerEnergy: DropsPerEnergy[];
}

export interface DropsPerEnergy {
  itemId: string;
  itemName: string;
  icon?: string;
  type: string;
  expectedValuePerEnergy: number;
}

/**
 * Calculate the efficiency score for a campaign node.
 *
 * @param node - The campaign node with rewards and energyCost
 * @param deficits - Optional list of resource deficits; nodes addressing more
 *   deficits receive a multi-target bonus of 1 + 0.1 × (deficitsAddressed - 1)
 * @returns NodeEfficiency with scores and per-reward breakdowns
 */
export function calculateNodeEfficiency(
  node: CampaignNode,
  deficits?: ResourceDeficit[],
): NodeEfficiency {
  const energyCost = node.energyCost || 1; // avoid division by zero

  // Base efficiency: sum(expectedValue) / energyCost
  const totalExpectedValue = node.rewards.reduce(
    (sum, r) => sum + r.expectedValue,
    0,
  );
  const baseEfficiency = totalExpectedValue / energyCost;

  // Per-reward drops-per-energy
  const dropsPerEnergy: DropsPerEnergy[] = node.rewards
    .filter((r) => r.expectedValue > 0)
    .map((r) => ({
      itemId: r.itemId,
      itemName: r.itemName,
      ...(r.icon ? { icon: r.icon } : {}),
      type: r.type,
      expectedValuePerEnergy: r.expectedValue / energyCost,
    }));

  // Multi-target bonus
  let deficitsAddressed = 0;
  if (deficits && deficits.length > 0) {
    const deficitIds = new Set(deficits.map((d) => d.itemId));
    deficitsAddressed = node.rewards.filter(
      (r) => r.expectedValue > 0 && deficitIds.has(r.itemId),
    ).length;
  }
  const multiTargetBonus =
    deficitsAddressed > 1 ? 1 + 0.1 * (deficitsAddressed - 1) : 1;

  const score = baseEfficiency * multiTargetBonus;

  return {
    baseEfficiency,
    multiTargetBonus,
    score,
    deficitsAddressed,
    dropsPerEnergy,
  };
}
