/**
 * Offer Value Scoring Engine
 *
 * Scores each offer as High / Medium / Low value based on:
 * - Roster gap relevance (unfilled character shards)
 * - Farming target match (active farming targets)
 * - Dark Dimension progress (DD-relevant items)
 * - Cost efficiency (items per cost unit)
 */

interface OfferRewardItem {
  itemName: string;
  itemId: string;
  quantity: number;
}

interface OfferChoice {
  id: number;
  art?: string | null;
  rewards: OfferRewardItem[];
  cost: { itemName: string; itemId: string; quantity: number } | null;
}

interface ScoredOffer {
  id: string;
  name: string;
  description: string;
  expiration: number | null;
  remainingPurchases: number | null;
  choices: OfferChoice[];
  valueScore: "High Value" | "Medium Value" | "Low Value";
  valueExplanation: string;
}

interface RosterGap {
  characterId: string;
  characterName: string;
}

interface FarmingTarget {
  characterId: string;
  characterName: string;
}

interface UpcomingEvent {
  name: string;
  characterIds: string[];
}

export function scoreOffers(
  offers: {
    id: string;
    name: string;
    description: string;
    expiration: number | null;
    remainingPurchases: number | null;
    choices: OfferChoice[];
  }[],
  rosterGaps: RosterGap[],
  farmingTargets: FarmingTarget[],
  ddCharacterIds: string[],
  upcomingEvents: UpcomingEvent[] = []
): ScoredOffer[] {
  const gapIds = new Set(rosterGaps.map((g) => g.characterId.toLowerCase()));
  const farmingIds = new Set(farmingTargets.map((t) => t.characterId.toLowerCase()));
  const ddIds = new Set(ddCharacterIds.map((id) => id.toLowerCase()));

  // Build event lookup: characterId → event names
  const eventCharMap = new Map<string, string[]>();
  for (const event of upcomingEvents) {
    for (const cid of event.characterIds) {
      const key = cid.toLowerCase();
      const existing = eventCharMap.get(key) ?? [];
      existing.push(event.name);
      eventCharMap.set(key, existing);
    }
  }

  return offers
    .map((offer) => {
      let score = 0;
      const reasons: string[] = [];

      // Collect all reward item IDs across all choices
      const rewardItems = offer.choices.flatMap((c) => c.rewards);
      const rewardIds = rewardItems.map((r) => r.itemId.toLowerCase());

      // Check roster gap match
      const gapMatches = rewardIds.filter((id) => gapIds.has(id));
      if (gapMatches.length > 0) {
        score += 3;
        reasons.push(`Contains ${gapMatches.length} item(s) matching unfilled roster gaps`);
      }

      // Check farming target match
      const farmMatches = rewardIds.filter((id) => farmingIds.has(id));
      if (farmMatches.length > 0) {
        score += 2;
        reasons.push(`Contains ${farmMatches.length} item(s) matching active farming targets`);
      }

      // Check DD relevance
      const ddMatches = rewardIds.filter((id) => ddIds.has(id));
      if (ddMatches.length > 0) {
        score += 2;
        reasons.push(`Contains ${ddMatches.length} item(s) helpful for Dark Dimension progress`);
      }

      // Check upcoming event relevance
      const matchedEvents = new Set<string>();
      for (const rid of rewardIds) {
        const eventNames = eventCharMap.get(rid);
        if (eventNames) {
          for (const en of eventNames) matchedEvents.add(en);
        }
      }
      if (matchedEvents.size > 0) {
        score += 3;
        const eventList = [...matchedEvents].slice(0, 3).join(", ");
        reasons.push(`Helps with upcoming event${matchedEvents.size > 1 ? "s" : ""}: ${eventList}`);
      }

      // Cost efficiency
      const totalRewardQuantity = rewardItems.reduce((sum, r) => sum + r.quantity, 0);
      const costs = offer.choices
        .filter((c) => c.cost)
        .map((c) => c.cost!.quantity);
      const avgCost = costs.length > 0 ? costs.reduce((a, b) => a + b, 0) / costs.length : 0;

      if (avgCost > 0 && totalRewardQuantity > 0) {
        const efficiency = totalRewardQuantity / avgCost;
        if (efficiency >= 10) {
          score += 2;
          reasons.push(`High cost efficiency: ${efficiency.toFixed(1)} items per cost unit`);
        } else if (efficiency >= 3) {
          score += 1;
          reasons.push(`Moderate cost efficiency: ${efficiency.toFixed(1)} items per cost unit`);
        }
      }

      // Determine value tier
      let valueScore: ScoredOffer["valueScore"];
      if (score >= 4) {
        valueScore = "High Value";
      } else if (score >= 2) {
        valueScore = "Medium Value";
      } else {
        valueScore = "Low Value";
      }

      if (reasons.length === 0) {
        reasons.push("No items in this offer match your current roster needs");
      }

      return {
        ...offer,
        valueScore,
        valueExplanation: reasons.join(". ") + ".",
      };
    })
    .sort((a, b) => {
      const order = { "High Value": 0, "Medium Value": 1, "Low Value": 2 };
      return order[a.valueScore] - order[b.valueScore];
    });
}
