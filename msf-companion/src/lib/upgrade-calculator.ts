import { msfApiFetch } from "@/lib/msf-api";
import { fetchCampaignNodes } from "@/lib/farming-service";

// Module-level cache with 1-hour TTL
const cache = new Map<string, { data: unknown; timestamp: number }>();
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

async function getCached<T>(
  key: string,
  fetcher: () => Promise<T>,
): Promise<T> {
  const cached = cache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data as T;
  }
  const data = await fetcher();
  cache.set(key, { data, timestamp: Date.now() });
  return data;
}

interface CostItem {
  item: string;
  quantity: number;
}

interface GearSlot {
  piece: string;
  level?: number;
}

interface GearTierData {
  slots: GearSlot[];
}

interface CharacterGearData {
  data?: {
    gearTiers?: Record<string, GearTierData>;
  };
  gearTiers?: Record<string, GearTierData>;
}

interface AbilityCosts {
  data?: Record<string, Record<string, CostItem[]>>;
}

interface StarShards {
  data?: Record<string, number>;
}

export interface GearCostResult {
  items: { itemId: string; quantity: number }[];
}

export interface AbilityCostResult {
  items: { itemId: string; quantity: number }[];
}

export interface StarCostResult {
  shardsNeeded: number;
}

export interface TotalCostResult {
  gearCost: GearCostResult;
  abilityCost: AbilityCostResult;
  starCost: StarCostResult;
}

export async function calculateGearCost(
  characterId: string,
  currentGearTier: number,
  targetGearTier: number,
  accessToken: string,
): Promise<GearCostResult> {
  if (targetGearTier <= currentGearTier) {
    return { items: [] };
  }

  const charData = await getCached<CharacterGearData>(
    `char-gear-${characterId}`,
    () =>
      msfApiFetch<CharacterGearData>({
        path: `/game/v1/characters/${characterId}?charInfo=full&itemFormat=id`,
        accessToken,
      }),
  );

  const gearTiers = charData.data?.gearTiers ?? charData.gearTiers ?? {};
  const itemMap = new Map<string, number>();

  for (let tier = currentGearTier + 1; tier <= targetGearTier; tier++) {
    const tierData =
      gearTiers[String(tier)] as GearTierData | undefined;
    if (!tierData?.slots) continue;

    for (const slot of tierData.slots) {
      if (slot.piece) {
        itemMap.set(slot.piece, (itemMap.get(slot.piece) ?? 0) + 1);
      }
    }
  }

  return {
    items: Array.from(itemMap.entries()).map(([itemId, quantity]) => ({
      itemId,
      quantity,
    })),
  };
}

export async function calculateAbilityCost(
  currentLevels: { basic: number; special: number; ultimate: number; passive: number },
  targetLevels: { basic: number; special: number; ultimate: number; passive: number },
  accessToken: string,
): Promise<AbilityCostResult> {
  const costsData = await getCached<AbilityCosts>(
    "abilityUpgradeCosts",
    () =>
      msfApiFetch<AbilityCosts>({
        path: "/game/v1/upgradeData/abilityUpgradeCosts?itemFormat=id",
        accessToken,
      }),
  );

  const costs = costsData.data ?? costsData;
  const itemMap = new Map<string, number>();

  const abilityTypes = ["basic", "special", "ultimate", "passive"] as const;
  for (const type of abilityTypes) {
    const current = currentLevels[type];
    const target = targetLevels[type];
    const typeCosts = (costs as Record<string, Record<string, CostItem[]>>)[type];
    if (!typeCosts) continue;

    for (let level = current + 1; level <= target; level++) {
      const levelCosts = typeCosts[String(level)];
      if (!levelCosts) continue;
      for (const cost of levelCosts) {
        if (cost.item && cost.quantity) {
          itemMap.set(cost.item, (itemMap.get(cost.item) ?? 0) + cost.quantity);
        }
      }
    }
  }

  return {
    items: Array.from(itemMap.entries()).map(([itemId, quantity]) => ({
      itemId,
      quantity,
    })),
  };
}

export async function calculateStarCost(
  currentStars: number,
  targetStars: number,
  accessToken: string,
): Promise<StarCostResult> {
  if (targetStars <= currentStars) {
    return { shardsNeeded: 0 };
  }

  const shardsData = await getCached<StarShards>(
    "yellowStarTotalShards",
    () =>
      msfApiFetch<StarShards>({
        path: "/game/v1/upgradeData/yellowStarTotalShards",
        accessToken,
      }),
  );

  const shards = shardsData.data ?? shardsData;
  const totalForTarget = (shards as Record<string, number>)[String(targetStars)] ?? 0;
  const totalForCurrent = (shards as Record<string, number>)[String(currentStars)] ?? 0;

  return { shardsNeeded: Math.max(0, totalForTarget - totalForCurrent) };
}

export async function calculateTotalCost(
  characterId: string,
  currentState: {
    gearTier: number;
    stars: number;
    abilities: { basic: number; special: number; ultimate: number; passive: number };
  },
  targetState: {
    gearTier: number;
    stars: number;
    abilities: { basic: number; special: number; ultimate: number; passive: number };
  },
  accessToken: string,
): Promise<TotalCostResult> {
  const [gearCost, abilityCost, starCost] = await Promise.all([
    calculateGearCost(characterId, currentState.gearTier, targetState.gearTier, accessToken),
    calculateAbilityCost(currentState.abilities, targetState.abilities, accessToken),
    calculateStarCost(currentState.stars, targetState.stars, accessToken),
  ]);

  return { gearCost, abilityCost, starCost };
}

// ── Gear-to-Items Resolution ──

interface RawItemObject {
  id?: string;
  name?: string;
  flatCost?: RawItemCost[];
}

interface RawItemCost {
  item: string | RawItemObject;
  quantity?: number;
}

interface ItemDetailResponse {
  data?: RawItemObject;
}

export interface FarmableItem {
  itemId: string;
  itemName: string;
  quantity: number;
  farmable: boolean;
}

/**
 * Resolve a character's gear tier upgrade into the specific base farmable items needed.
 *
 * 1. Calls calculateGearCost() to get gear piece IDs
 * 2. For each gear piece, fetches item detail with pieceFlatCost=full to get smallest-unit costs
 * 3. Items with no flatCost (already base items) are returned as-is
 * 4. Items whose flatCost resolves to items not found in any campaign node are tagged farmable: false
 */
export async function resolveGearToFarmableItems(
  characterId: string,
  currentGearTier: number,
  targetGearTier: number,
  accessToken: string,
): Promise<FarmableItem[]> {
  const gearCost = await calculateGearCost(
    characterId,
    currentGearTier,
    targetGearTier,
    accessToken,
  );

  if (gearCost.items.length === 0) return [];

  // Fetch item details in parallel (each cached individually)
  const itemDetails = await Promise.all(
    gearCost.items.map((gi) => fetchItemDetail(gi.itemId, accessToken)),
  );

  // Flatten gear pieces into base farmable items
  const baseItemMap = new Map<string, { itemName: string; quantity: number }>();

  for (let i = 0; i < gearCost.items.length; i++) {
    const gearPiece = gearCost.items[i];
    const detail = itemDetails[i];

    if (detail?.flatCost && detail.flatCost.length > 0) {
      // Has flatCost — use the smallest-unit items
      for (const cost of detail.flatCost) {
        const itemId = typeof cost.item === "string" ? cost.item : cost.item?.id ?? "unknown";
        const itemName = typeof cost.item === "string" ? cost.item : cost.item?.name ?? cost.item?.id ?? "unknown";
        const qty = (cost.quantity ?? 1) * gearPiece.quantity;
        const existing = baseItemMap.get(itemId);
        if (existing) {
          existing.quantity += qty;
        } else {
          baseItemMap.set(itemId, { itemName, quantity: qty });
        }
      }
    } else {
      // No flatCost — this is already a base item
      const itemId = gearPiece.itemId;
      const itemName = detail?.name ?? detail?.id ?? gearPiece.itemId;
      const existing = baseItemMap.get(itemId);
      if (existing) {
        existing.quantity += gearPiece.quantity;
      } else {
        baseItemMap.set(itemId, { itemName, quantity: gearPiece.quantity });
      }
    }
  }

  // Determine which items are farmable from campaign nodes
  const farmableIds = await getFarmableItemIds(accessToken);

  return Array.from(baseItemMap.entries()).map(([itemId, info]) => ({
    itemId,
    itemName: info.itemName,
    quantity: info.quantity,
    farmable: farmableIds.has(itemId),
  }));
}

/**
 * Fetch a single item's detail with flatCost. Cached with 1-hour TTL.
 */
async function fetchItemDetail(
  itemId: string,
  accessToken: string,
): Promise<RawItemObject | null> {
  return getCached<RawItemObject | null>(
    `item-detail-${itemId}`,
    async () => {
      try {
        const res = await msfApiFetch<ItemDetailResponse>({
          path: `/game/v1/items/${encodeURIComponent(itemId)}?pieceFlatCost=full&pieceInfo=full&itemFormat=id&lang=en`,
          accessToken,
        });
        return res.data ?? null;
      } catch {
        return null;
      }
    },
  );
}

/**
 * Build a Set of item IDs that appear in campaign node rewards.
 * Uses fetchCampaignNodes which is itself cached.
 */
async function getFarmableItemIds(accessToken: string): Promise<Set<string>> {
  return getCached<Set<string>>(
    "farmable-item-ids",
    async () => {
      try {
        const nodes = await fetchCampaignNodes(accessToken);
        const ids = new Set<string>();
        for (const node of nodes) {
          for (const reward of node.rewards) {
            ids.add(reward.itemId);
          }
        }
        return ids;
      } catch {
        // If campaign data is unavailable, assume all items are farmable
        return new Set<string>();
      }
    },
  );
}
