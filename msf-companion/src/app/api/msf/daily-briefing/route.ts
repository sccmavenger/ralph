import { NextResponse } from "next/server";
import { getValidAccessTokenWithRefresh as getValidAccessToken } from "@/lib/auth";
import { msfApiFetch } from "@/lib/msf-api";

export const dynamic = "force-dynamic";

/* ── Types ─────────────────────────────────────────────────────── */

interface OfferItem {
  id: string;
  name?: string;
  icon?: string;
}

interface OfferReward {
  item: OfferItem;
  quantity: number;
}

interface OfferRewards {
  allOf?: OfferReward[];
  oneOf?: OfferReward[];
}

interface OfferChoice {
  id: number;
  art?: string;
  rewards?: OfferRewards;
  freeCost?: unknown;
  itemCost?: unknown;
  premiumCurrencyCost?: unknown;
  realMoneyCost?: unknown;
  webRewards?: OfferRewards;
  webRealCostRewards?: OfferRewards;
}

interface RawOffer {
  id: string;
  name?: string;
  description?: string;
  expiration?: number;
  remainingPurchases?: number;
  choices?: OfferChoice[];
  chain?: { id: string; index: number };
}

interface OffersResponse {
  data?: RawOffer[];
}

interface MilestoneTierReward {
  item: OfferItem;
  quantity: number;
}

interface MilestoneTierRewards {
  allOf?: MilestoneTierReward[];
}

interface MilestoneTier {
  rewards?: MilestoneTierRewards;
}

interface MilestoneProgress {
  completedTier?: number;
  goalTier?: number;
  claimableTiers?: number[];
  points?: number;
  goal?: number;
}

interface MilestoneBracket {
  objective?: {
    progress?: MilestoneProgress;
  };
  tiers?: Record<string, MilestoneTier>;
}

interface CappedScoring {
  cap?: number;
  soFar?: number;
  methods?: { description?: string; points?: number }[];
}

interface MilestoneScoring {
  cappedScorings?: CappedScoring[];
  methods?: { description?: string; points?: number }[];
}

interface RawEvent {
  id: string;
  name?: string;
  type?: string;
  startTime?: number;
  endTime?: number;
  milestone?: {
    milestoneType?: string;
    brackets?: MilestoneBracket[];
    scoring?: MilestoneScoring;
  };
}

interface EventsResponse {
  data?: RawEvent[];
  meta?: { page?: number; perPage?: number; perTotal?: number };
}

/* ── Helpers ───────────────────────────────────────────────────── */

function flattenRewards(rewards: OfferRewards | undefined): { itemName: string; itemId: string; icon: string; quantity: number }[] {
  if (!rewards) return [];
  const items: { itemName: string; itemId: string; icon: string; quantity: number }[] = [];
  for (const r of rewards.allOf ?? []) {
    items.push({
      itemName: r.item?.name ?? "Unknown",
      itemId: r.item?.id ?? "",
      icon: r.item?.icon ?? "",
      quantity: r.quantity ?? 0,
    });
  }
  for (const r of rewards.oneOf ?? []) {
    items.push({
      itemName: r.item?.name ?? "Unknown",
      itemId: r.item?.id ?? "",
      icon: r.item?.icon ?? "",
      quantity: r.quantity ?? 0,
    });
  }
  return items;
}

function isFreeChoice(choice: OfferChoice): boolean {
  return !!choice.freeCost && !choice.itemCost && !choice.premiumCurrencyCost && !choice.realMoneyCost;
}

function isFreeOffer(offer: RawOffer): boolean {
  return offer.choices?.some(isFreeChoice) ?? false;
}

/* ── Route Handler ─────────────────────────────────────────────── */

export async function GET() {
  const accessToken = await getValidAccessToken();
  if (!accessToken) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let freeOffers: {
    id: string;
    name: string;
    description: string;
    expiration: number | null;
    remainingPurchases: number | null;
    rewards: { itemName: string; itemId: string; icon: string; quantity: number }[];
    art: string | null;
    chain: { id: string; index: number } | null;
    webBonusRewards: { itemName: string; itemId: string; icon: string; quantity: number }[];
  }[] = [];
  let offersError: string | undefined;

  let milestones: {
    id: string;
    name: string;
    startTime: number | null;
    endTime: number | null;
    milestoneType: string;
    brackets: {
      points: number;
      goal: number;
      completedTier: number;
      goalTier: number;
      claimableTiers: number[];
    }[];
    tiers: { tier: number; rewards: { itemName: string; itemId: string; icon: string; quantity: number }[] }[];
    scoring: {
      methods: { description: string; points: number }[];
      cappedScorings: { cap: number; soFar: number; methods: { description: string; points: number }[] }[];
    } | null;
  }[] = [];
  let milestonesError: string | undefined;

  // Fetch offers (best-effort)
  try {
    const offersRes = await msfApiFetch<OffersResponse>({
      path: "/player/v1/offers",
      accessToken,
      params: { itemFormat: "object" },
    });

    freeOffers = (offersRes.data ?? [])
      .filter(isFreeOffer)
      .map((offer) => {
        // Get rewards from the first free choice
        const freeChoice = offer.choices?.find(isFreeChoice);
        const rewards = freeChoice ? flattenRewards(freeChoice.rewards) : [];
        const art = freeChoice?.art ?? null;

        // Web bonus rewards
        const webBonus = [
          ...flattenRewards(freeChoice?.webRewards),
          ...flattenRewards(freeChoice?.webRealCostRewards),
        ];

        return {
          id: offer.id,
          name: offer.name ?? "Unknown Offer",
          description: offer.description ?? "",
          expiration: offer.expiration ?? null,
          remainingPurchases: offer.remainingPurchases ?? null,
          rewards,
          art,
          chain: offer.chain ?? null,
          webBonusRewards: webBonus,
        };
      });
  } catch (err) {
    offersError = err instanceof Error ? err.message : String(err);
  }

  // Fetch events (paginated at perPage=10)
  try {
    const allEvents: RawEvent[] = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const eventsRes = await msfApiFetch<EventsResponse>({
        path: "/player/v1/events",
        accessToken,
        params: {
          eventInfo: "full",
          objRewards: "part",
          perPage: "10",
          page: String(page),
        },
      });

      const pageData = eventsRes.data ?? [];
      allEvents.push(...pageData);

      const perTotal = eventsRes.meta?.perTotal ?? 0;
      const perPage = eventsRes.meta?.perPage ?? 10;
      hasMore = page * perPage < perTotal;
      page++;
    }

    milestones = allEvents
      .filter((e) => e.type === "milestone")
      .map((event) => {
        const brackets = (event.milestone?.brackets ?? []).map((b) => {
          const progress = b.objective?.progress;
          return {
            points: progress?.points ?? 0,
            goal: progress?.goal ?? 0,
            completedTier: progress?.completedTier ?? 0,
            goalTier: progress?.goalTier ?? 0,
            claimableTiers: progress?.claimableTiers ?? [],
          };
        });

        // Extract tier rewards from the first bracket
        const firstBracket = event.milestone?.brackets?.[0];
        const tierRewards: { tier: number; rewards: { itemName: string; itemId: string; icon: string; quantity: number }[] }[] = [];
        if (firstBracket?.tiers) {
          for (const [tierNum, tierData] of Object.entries(firstBracket.tiers)) {
            tierRewards.push({
              tier: parseInt(tierNum, 10),
              rewards: flattenRewards(tierData.rewards),
            });
          }
        }

        // Scoring info
        const scoring = event.milestone?.scoring
          ? {
              methods: (event.milestone.scoring.methods ?? []).map((m) => ({
                description: m.description ?? "",
                points: m.points ?? 0,
              })),
              cappedScorings: (event.milestone.scoring.cappedScorings ?? []).map((cs) => ({
                cap: cs.cap ?? 0,
                soFar: cs.soFar ?? 0,
                methods: (cs.methods ?? []).map((m) => ({
                  description: m.description ?? "",
                  points: m.points ?? 0,
                })),
              })),
            }
          : null;

        return {
          id: event.id,
          name: event.name ?? "Unknown Event",
          startTime: event.startTime ?? null,
          endTime: event.endTime ?? null,
          milestoneType: event.milestone?.milestoneType ?? "solo",
          brackets,
          tiers: tierRewards,
          scoring,
        };
      });
  } catch (err) {
    milestonesError = err instanceof Error ? err.message : String(err);
  }

  // Summary
  const freeOfferCount = freeOffers.length;
  const claimableMilestoneCount = milestones.filter(
    (m) => m.brackets.some((b) => b.claimableTiers.length > 0)
  ).length;

  const response: Record<string, unknown> = {
    freeOffers,
    milestones,
    summary: {
      freeOfferCount,
      claimableMilestoneCount,
      totalActionItems: freeOfferCount + claimableMilestoneCount,
    },
  };

  if (offersError) response.offersError = offersError;
  if (milestonesError) response.milestonesError = milestonesError;

  return NextResponse.json(response);
}
