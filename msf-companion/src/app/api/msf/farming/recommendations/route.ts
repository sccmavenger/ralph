import { NextResponse } from "next/server";
import { getValidAccessTokenWithRefresh, refreshAccessToken } from "@/lib/auth";
import { msfApiFetch } from "@/lib/msf-api";
import { fetchNormalizedEvents } from "@/lib/planner-events";
import { calculatePriorities } from "@/lib/investment-priority";
import { resolveGearToFarmableItems } from "@/lib/upgrade-calculator";
import { fetchCampaignNodes, type CampaignNode } from "@/lib/farming-service";

export const dynamic = "force-dynamic";

const PER_PAGE = 200;

interface RawRosterChar {
  id: string;
  level?: number;
  activeYellow?: number;
  gearTier?: number;
  power?: number;
  info?: {
    name?: string;
    portrait?: string;
    traits?: (string | { id: string })[];
  };
}

interface RawInventoryEntry {
  item?: string | { id?: string; name?: string };
  quantity?: number;
}

interface GapItem {
  itemId: string;
  itemName: string;
  needed: number;
  owned: number;
  deficit: number;
  farmable: boolean;
  sources: { characterName: string; currentGear: number; targetGear: number }[];
}

export interface Recommendation {
  nodeLabel: string;
  episodicName: string;
  chapterNumber: number;
  tierNumber: number;
  energyCost: number;
  score: number;
  deficitsAddressed: number;
  multiTargetBonus: number;
  addressedResources: {
    itemId: string;
    itemName: string;
    deficit: number;
    expectedValuePerRun: number;
  }[];
  benefitingCharacters: string[];
}

function traitId(t: string | { id: string }): string {
  return typeof t === "string" ? t : t.id;
}

async function fetchFullRoster(token: string): Promise<RawRosterChar[]> {
  const page1 = await msfApiFetch<{ data?: RawRosterChar[]; meta?: { perTotal?: number } }>({
    path: `/player/v1/roster?charInfo=full&traitFormat=id&page=1&perPage=${PER_PAGE}`,
    accessToken: token,
  });

  const allRaw: RawRosterChar[] = [...(page1.data ?? [])];
  const total = page1.meta?.perTotal ?? allRaw.length;

  if (total > PER_PAGE) {
    const pageCount = Math.ceil(total / PER_PAGE);
    const extra = await Promise.all(
      Array.from({ length: pageCount - 1 }, (_, i) =>
        msfApiFetch<{ data?: RawRosterChar[] }>({
          path: `/player/v1/roster?charInfo=full&traitFormat=id&page=${i + 2}&perPage=${PER_PAGE}`,
          accessToken: token,
        }),
      ),
    );
    for (const p of extra) allRaw.push(...(p.data ?? []));
  }

  return allRaw;
}

async function fetchInventoryMap(token: string): Promise<Map<string, number>> {
  const raw = await msfApiFetch<{ data?: RawInventoryEntry[] }>({
    path: "/player/v1/inventory?itemFormat=id",
    accessToken: token,
  });

  const map = new Map<string, number>();
  for (const entry of raw.data ?? []) {
    if (!entry.item) continue;
    const itemId = typeof entry.item === "string" ? entry.item : entry.item.id ?? "unknown";
    const qty = entry.quantity ?? 0;
    map.set(itemId, (map.get(itemId) ?? 0) + qty);
  }
  return map;
}

function computeGaps(
  priorities: ReturnType<typeof calculatePriorities>,
  resolutions: { priority: (typeof priorities)[number]; items: Awaited<ReturnType<typeof resolveGearToFarmableItems>> }[],
  inventoryMap: Map<string, number>,
): GapItem[] {
  const gapMap = new Map<string, GapItem>();

  for (const { priority, items } of resolutions) {
    for (const item of items) {
      const existing = gapMap.get(item.itemId);
      if (existing) {
        existing.needed += item.quantity;
        existing.farmable = existing.farmable && item.farmable;
        existing.sources.push({
          characterName: priority.name,
          currentGear: priority.currentGear,
          targetGear: priority.requiredGear,
        });
      } else {
        gapMap.set(item.itemId, {
          itemId: item.itemId,
          itemName: item.itemName,
          needed: item.quantity,
          owned: inventoryMap.get(item.itemId) ?? 0,
          deficit: 0,
          farmable: item.farmable,
          sources: [
            {
              characterName: priority.name,
              currentGear: priority.currentGear,
              targetGear: priority.requiredGear,
            },
          ],
        });
      }
    }
  }

  const gaps: GapItem[] = [];
  for (const gap of gapMap.values()) {
    gap.owned = inventoryMap.get(gap.itemId) ?? 0;
    gap.deficit = gap.needed - gap.owned;
    if (gap.deficit > 0) {
      gaps.push(gap);
    }
  }

  return gaps;
}

function rankNodes(
  nodes: CampaignNode[],
  gaps: GapItem[],
): Recommendation[] {
  if (gaps.length === 0) return [];

  // Build deficit lookup
  const deficitMap = new Map<string, GapItem>();
  for (const g of gaps) {
    deficitMap.set(g.itemId, g);
  }

  // Build character-source lookup: itemId → character names
  const itemCharacters = new Map<string, Set<string>>();
  for (const g of gaps) {
    const charNames = new Set<string>();
    for (const s of g.sources) charNames.add(s.characterName);
    itemCharacters.set(g.itemId, charNames);
  }

  const recommendations: Recommendation[] = [];

  for (const node of nodes) {
    // Check if this node addresses any deficits
    const addressedResources: Recommendation["addressedResources"] = [];
    const benefitingChars = new Set<string>();

    for (const reward of node.rewards) {
      const gap = deficitMap.get(reward.itemId);
      if (gap && reward.expectedValue > 0) {
        addressedResources.push({
          itemId: reward.itemId,
          itemName: reward.itemName,
          deficit: gap.deficit,
          expectedValuePerRun: reward.expectedValue,
        });
        const chars = itemCharacters.get(reward.itemId);
        if (chars) {
          for (const c of chars) benefitingChars.add(c);
        }
      }
    }

    if (addressedResources.length === 0) continue;

    // Score using the ranking formula from the PRD:
    // sum(deficit × expectedValue) / energyCost × multiTargetBonus
    const energyCost = node.energyCost || 1;
    const deficitsAddressed = addressedResources.length;
    const multiTargetBonus = deficitsAddressed > 1 ? 1 + 0.1 * (deficitsAddressed - 1) : 1;

    const weightedSum = addressedResources.reduce(
      (sum, r) => sum + r.deficit * r.expectedValuePerRun,
      0,
    );
    const score = (weightedSum / energyCost) * multiTargetBonus;

    recommendations.push({
      nodeLabel: node.nodeName || `${node.episodicName} ${node.chapterNumber}-${node.tierNumber}`,
      episodicName: node.episodicName,
      chapterNumber: node.chapterNumber,
      tierNumber: node.tierNumber,
      energyCost,
      score,
      deficitsAddressed,
      multiTargetBonus,
      addressedResources,
      benefitingCharacters: [...benefitingChars],
    });
  }

  // Sort by score descending, return top 10
  recommendations.sort((a, b) => b.score - a.score);
  return recommendations.slice(0, 10);
}

export async function GET(request: Request) {
  const token = await getValidAccessTokenWithRefresh();

  if (!token) {
    return NextResponse.json(
      { error: "Unauthorized", code: "UNAUTHORIZED", retryable: false },
      { status: 401 },
    );
  }

  const url = new URL(request.url);
  const forceRefresh = url.searchParams.get("refresh") === "true";

  try {
    // Fetch all data in parallel: roster, events, inventory, campaign nodes
    const [rosterRaw, events, inventoryMap, campaignNodes] = await Promise.all([
      fetchFullRoster(token),
      fetchNormalizedEvents(token, forceRefresh),
      fetchInventoryMap(token),
      fetchCampaignNodes(token, forceRefresh),
    ]);

    // Build characters for priority calculation
    const characters = rosterRaw.map((c) => ({
      id: c.id,
      name: c.info?.name ?? c.id,
      portrait: c.info?.portrait ?? "",
      traits: (c.info?.traits ?? []).map(traitId),
      gearTier: c.gearTier ?? 0,
      stars: c.activeYellow ?? 0,
    }));

    // Get priority characters needing gear upgrades
    const priorities = calculatePriorities(characters, events, new Map());

    if (priorities.length === 0) {
      return NextResponse.json({
        recommendations: [],
        message: "You're all caught up! No farming needed for current priorities.",
      });
    }

    const upgradeNeeded = priorities.filter((p) => p.requiredGear > p.currentGear);

    if (upgradeNeeded.length === 0) {
      return NextResponse.json({
        recommendations: [],
        message: "You're all caught up! No farming needed for current priorities.",
      });
    }

    // Resolve gear upgrades into base farmable items (top 10)
    const topPriorities = upgradeNeeded.slice(0, 10);

    const resolutions = await Promise.all(
      topPriorities.map((p) =>
        resolveGearToFarmableItems(p.characterId, p.currentGear, p.requiredGear, token)
          .then((items) => ({ priority: p, items }))
          .catch((err) => {
            console.warn(`Failed to resolve gear for ${p.name}:`, err);
            return { priority: p, items: [] as Awaited<ReturnType<typeof resolveGearToFarmableItems>> };
          }),
      ),
    );

    // Compute gaps (items with deficit > 0)
    const gaps = computeGaps(topPriorities as unknown as ReturnType<typeof calculatePriorities>, resolutions, inventoryMap);

    if (gaps.length === 0) {
      return NextResponse.json({
        recommendations: [],
        message: "You're all caught up! No farming needed for current priorities.",
      });
    }

    // Only consider farmable gaps for node ranking
    const farmableGaps = gaps.filter((g) => g.farmable);

    if (farmableGaps.length === 0) {
      return NextResponse.json({
        recommendations: [],
        message: "You're all caught up! No farming needed for current priorities.",
      });
    }

    // Rank campaign nodes by how well they address deficits
    const recommendations = rankNodes(campaignNodes, farmableGaps);

    return NextResponse.json({
      recommendations,
      disclaimer: "Some nodes may require campaign progression you haven't completed yet.",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    if (message.includes("401")) {
      const freshToken = await refreshAccessToken();
      if (freshToken) {
        // Complex route — instruct user to retry
      }
      return NextResponse.json(
        { error: "Session expired. Please log in again.", code: "TOKEN_EXPIRED", retryable: false },
        { status: 401 },
      );
    }

    if (message.includes("552") || message.includes("553")) {
      return NextResponse.json(
        { error: "Game servers are in maintenance.", code: "MAINTENANCE", retryable: true },
        { status: 503 },
      );
    }

    if (message.includes("472")) {
      return NextResponse.json(
        { error: "Response too large — try again shortly.", code: "RESPONSE_TOO_LARGE", retryable: true },
        { status: 502 },
      );
    }

    console.error("Farming recommendations fetch failed:", err);
    return NextResponse.json(
      { error: "Failed to compute farming recommendations", code: "MSF_API_ERROR", retryable: true },
      { status: 502 },
    );
  }
}
