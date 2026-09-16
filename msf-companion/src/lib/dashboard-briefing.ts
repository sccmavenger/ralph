/** View model for the dashboard. Counts represent offers and milestone events,
 * not individual reward items or a complete list of all daily opportunities. */
export interface DashboardReward {
  itemName: string;
  quantity: number;
}

export interface DashboardOffer {
  id: string;
  name: string;
  expiration: number | null;
  remainingPurchases?: number | null;
  rewards: DashboardReward[];
}

export interface DashboardMilestone {
  id: string;
  name: string;
  brackets: { claimableTiers: number[] }[];
}

export interface DashboardBriefing {
  freeOffers: DashboardOffer[];
  milestones: DashboardMilestone[];
  offersError: boolean;
  milestonesError: boolean;
}

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export function parseDashboardBriefing(value: unknown): DashboardBriefing {
  if (!record(value)) throw new Error("Reward data is temporarily unavailable.");
  const offers: DashboardOffer[] = [];
  const milestones: DashboardMilestone[] = [];
  let offersError = Boolean(value.offersError) || !Array.isArray(value.freeOffers);
  let milestonesError = Boolean(value.milestonesError) || !Array.isArray(value.milestones);
  for (const offer of Array.isArray(value.freeOffers) ? value.freeOffers : []) {
    if (!record(offer) || typeof offer.id !== "string" || typeof offer.name !== "string" || !Array.isArray(offer.rewards)) {
      offersError = true;
      continue;
    }
    offers.push({
      id: offer.id,
      name: offer.name,
      expiration: typeof offer.expiration === "number" && Number.isFinite(offer.expiration) && offer.expiration > 0 ? offer.expiration : null,
      remainingPurchases: typeof offer.remainingPurchases === "number" ? offer.remainingPurchases : null,
      rewards: offer.rewards.filter((reward): reward is DashboardReward =>
        record(reward) && typeof reward.itemName === "string" && typeof reward.quantity === "number" && Number.isFinite(reward.quantity) && reward.quantity >= 0),
    });
  }
  for (const milestone of Array.isArray(value.milestones) ? value.milestones : []) {
    if (!record(milestone) || typeof milestone.id !== "string" || typeof milestone.name !== "string" || !Array.isArray(milestone.brackets) ||
      !milestone.brackets.every((bracket) => record(bracket) && Array.isArray(bracket.claimableTiers) && bracket.claimableTiers.every((tier) => Number.isInteger(tier) && tier >= 0))) {
      milestonesError = true;
      continue;
    }
    milestones.push(milestone as unknown as DashboardMilestone);
  }
  return { freeOffers: offersError ? [] : offers, milestones: milestonesError ? [] : milestones, offersError, milestonesError };
}

export const ENDING_SOON_SECONDS = 24 * 60 * 60;

export function summarizeDashboardBriefing(data: DashboardBriefing, nowMs: number) {
  const now = nowMs / 1000;
  const offers = [...new Map(data.freeOffers.map((offer) => [offer.id, offer])).values()]
    .filter((offer) => offer.remainingPurchases !== 0 && (offer.expiration === null || offer.expiration > now))
    .sort((a, b) => (a.expiration ?? Infinity) - (b.expiration ?? Infinity));
  const milestones = [...new Map(data.milestones.map((milestone) => [milestone.id, milestone])).values()]
    .filter((milestone) => milestone.brackets.some((bracket) => bracket.claimableTiers.length > 0));
  const soon = offers.filter((offer) => offer.expiration !== null && offer.expiration - now <= ENDING_SOON_SECONDS);
  return {
    offers,
    milestones,
    nextExpiry: offers.find((offer) => offer.expiration !== null) ?? null,
    endingSoon: soon.length,
    count: offers.length + milestones.length,
    partial: data.offersError || data.milestonesError,
  };
}

export function expiryLabel(expiration: number, nowMs: number) {
  const minutes = Math.max(0, Math.ceil((expiration * 1000 - nowMs) / 60_000));
  if (minutes === 0) return "Expired";
  if (minutes >= 1440) return `${Math.floor(minutes / 1440)}d ${Math.floor(minutes % 1440 / 60)}h left`;
  if (minutes >= 60) return `${Math.floor(minutes / 60)}h ${minutes % 60}m left`;
  return `${minutes}m left`;
}
