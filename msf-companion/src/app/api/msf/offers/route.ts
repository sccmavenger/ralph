import { NextResponse } from "next/server";
import { getValidAccessTokenWithRefresh as getValidAccessToken } from "@/lib/auth";
import { msfApiFetch } from "@/lib/msf-api";
import { scoreOffers } from "@/lib/offer-scoring";
import { fetchNormalizedEvents } from "@/lib/planner-events";

export const dynamic = "force-dynamic";

interface OfferItem {
  id: string;
  name?: string;
  description?: string;
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
  webRewards?: OfferRewards;
  webRealCostRewards?: OfferRewards;
  itemCost?: {
    item: OfferItem;
    quantity?: number;
  };
}

interface RawOffer {
  id: string;
  name?: string;
  description?: string;
  locations?: string[];
  expiration?: number;
  remainingPurchases?: number;
  choices?: OfferChoice[];
}

interface OffersResponse {
  data?: RawOffer[];
}

export async function GET() {
  const accessToken = await getValidAccessToken();
  if (!accessToken) {
    return NextResponse.json(
      { error: "Not authenticated" },
      { status: 401 }
    );
  }

  try {
    const res = await msfApiFetch<OffersResponse>({
      path: "/player/v1/offers",
      accessToken,
    });

    const offers = (res.data ?? []).map((offer) => ({
      id: offer.id,
      name: offer.name ?? "Unknown Offer",
      description: offer.description ?? "",
      expiration: offer.expiration ?? null,
      remainingPurchases: offer.remainingPurchases ?? null,
      choices: (offer.choices ?? []).map((choice) => ({
        id: choice.id,
        art: choice.art ?? null,
        rewards: flattenRewards(choice.rewards),
        cost: choice.itemCost
          ? {
              itemName: choice.itemCost.item?.name ?? "Unknown",
              itemId: choice.itemCost.item?.id ?? "",
              quantity: choice.itemCost.quantity ?? 0,
            }
          : null,
      })),
    }));

    // Fetch roster and farming targets for scoring (best-effort)
    let rosterGaps: { characterId: string; characterName: string }[] = [];
    let farmingTargets: { characterId: string; characterName: string }[] = [];
    const ddCharacterIds: string[] = [];
    let upcomingEvents: { name: string; characterIds: string[] }[] = [];

    try {
      const [farmingRes, rosterRes, eventsResult] = await Promise.all([
        msfApiFetch<{ data?: { characterId: string; characterName: string }[] }>({
          path: "/player/v1/roster",
          accessToken,
          params: { statsFormat: "csv", charInfo: "none", costume: "none" },
        }).catch(() => null),
        fetch(new URL("/api/msf/farming/targets", "http://localhost:3000").toString(), {
          headers: { cookie: "" },
        }).catch(() => null),
        fetchNormalizedEvents(accessToken).catch(() => []),
      ]);

      // Build roster gaps: characters with low stars or levels
      if (farmingRes?.data) {
        rosterGaps = farmingRes.data
          .filter((c: Record<string, unknown>) => ((c.activeYellow as number) ?? 0) < 7)
          .map((c: Record<string, unknown>) => ({
            characterId: (c.id as string) ?? "",
            characterName: (c.name as string) ?? "",
          }));
      }

      if (rosterRes?.ok) {
        const ftData = await rosterRes.json().catch(() => ({}));
        farmingTargets = (ftData.targets ?? []).map((t: Record<string, unknown>) => ({
          characterId: (t.characterId as string) ?? "",
          characterName: (t.characterName as string) ?? "",
        }));
      }

      // Map events to character IDs for offer scoring
      if (Array.isArray(eventsResult) && eventsResult.length > 0) {
        upcomingEvents = eventsResult
          .filter((e) => e.requirements.specificCharacters.length > 0)
          .map((e) => ({
            name: e.name,
            characterIds: e.requirements.specificCharacters,
          }));
      }
    } catch {
      // Scoring data fetch failed — proceed with empty data
    }

    const scoredOffers = scoreOffers(offers, rosterGaps, farmingTargets, ddCharacterIds, upcomingEvents);

    return NextResponse.json({ data: scoredOffers });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";

    // Check if it's a scope/permission issue
    if (message.includes("403") || message.includes("Forbidden")) {
      return NextResponse.json(
        {
          error: "The m3p.f.pr.buy scope has not been authorized. Please log out and log back in to grant access to offers.",
          code: "SCOPE_REQUIRED",
        },
        { status: 403 }
      );
    }

    return NextResponse.json(
      { error: `Failed to fetch offers: ${message}` },
      { status: 500 }
    );
  }
}

function flattenRewards(rewards?: OfferRewards): { itemName: string; itemId: string; quantity: number }[] {
  if (!rewards) return [];
  const items: { itemName: string; itemId: string; quantity: number }[] = [];

  for (const r of rewards.allOf ?? []) {
    items.push({
      itemName: r.item?.name ?? "Unknown",
      itemId: r.item?.id ?? "",
      quantity: r.quantity ?? 0,
    });
  }

  for (const r of rewards.oneOf ?? []) {
    items.push({
      itemName: r.item?.name ?? "Unknown",
      itemId: r.item?.id ?? "",
      quantity: r.quantity ?? 0,
    });
  }

  return items;
}
