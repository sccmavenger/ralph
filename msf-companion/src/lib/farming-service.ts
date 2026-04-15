/**
 * Farming Service — fetches and normalizes campaign node reward data from the MSF API.
 *
 * Flow:
 * 1. Fetch campaign episodic list from /game/v1/episodics/campaign
 * 2. For each campaign, fetch chapter-level data with nodeRewards=full
 * 3. Parse the ItemQuantity reward trees into flat reward lists per node
 * 4. Cache the results using planner-cache (1-hour TTL)
 */

import { msfApiFetch } from "@/lib/msf-api";
import { getCached, setCache } from "@/lib/planner-cache";

// ── Types ──

export type RewardType =
  | "GEAR"
  | "SHARD"
  | "CONSUMABLE"
  | "ABILITY_MATERIAL"
  | "ISOITEM";

export interface NodeReward {
  itemId: string;
  itemName: string;
  icon?: string;
  quantity: number;
  maxQuantity?: number;
  weight?: number;
  expectedValue: number;
  type: RewardType;
  characterId?: string;
}

export interface CampaignNode {
  episodicId: string;
  episodicName: string;
  chapterNumber: number;
  tierNumber: number;
  nodeName: string;
  energyCost: number;
  rewards: NodeReward[];
}

// ── Raw API Types ──

interface RawItem {
  id?: string;
  name?: string;
  icon?: string;
  characterId?: string;
  tier?: number;
  stats?: unknown;
  isOrb?: boolean;
}

interface RawItemQuantity {
  item?: string | RawItem;
  oneOf?: RawItemQuantity[];
  allOf?: RawItemQuantity[];
  chanceOf?: RawItemQuantity;
  quantity?: number;
  maxQuantity?: number;
  weight?: number;
  pulls?: number;
}

interface RawNodeInfo {
  name?: string;
  energyCost?: number;
  isBoss?: boolean;
  rewards?: RawItemQuantity;
  firstTimeRewards?: RawItemQuantity;
  limitedRewards?: RawItemQuantity;
}

interface RawChapterInfo {
  numTiers?: number;
  tiers?: Record<string, RawNodeInfo>;
}

interface RawEpisodicInfo {
  id: string;
  name?: string;
  nodeName?: string;
  numChapters?: number;
  chapters?: Record<string, RawChapterInfo>;
}

interface EpisodicListResponse {
  data?: RawEpisodicInfo[];
  meta?: { hashes?: Record<string, string>; page?: number; perPage?: number; pages?: number };
}

interface ChapterResponse {
  data?: RawEpisodicInfo;
  meta?: Record<string, unknown>;
}

// ── Item Type Classification ──

function classifyItemType(item: string | RawItem): RewardType {
  if (typeof item === "string") {
    const id = item.toLowerCase();
    if (id.includes("shard")) return "SHARD";
    if (id.includes("iso") || id.includes("ion_")) return "ISOITEM";
    if (id.includes("ability") || id.includes("catalyst")) return "ABILITY_MATERIAL";
    if (id.includes("gear") || id.includes("piece_") || id.includes("orb_gear")) return "GEAR";
    return "CONSUMABLE";
  }

  if (item.characterId) return "SHARD";
  if (item.tier !== undefined || item.stats) return "GEAR";

  const id = (item.id || "").toLowerCase();
  const name = (item.name || "").toLowerCase();
  if (id.includes("iso") || name.includes("iso") || id.includes("ion_")) return "ISOITEM";
  if (id.includes("ability") || id.includes("catalyst") || name.includes("ability")) return "ABILITY_MATERIAL";
  if (id.includes("gear") || id.includes("piece_") || id.includes("orb_gear")) return "GEAR";
  return "CONSUMABLE";
}

function getItemId(item: string | RawItem): string {
  return typeof item === "string" ? item : item.id || "unknown";
}

function getItemName(item: string | RawItem): string {
  if (typeof item === "string") return item;
  return item.name || item.id || "Unknown";
}

function getItemIcon(item: string | RawItem): string | undefined {
  if (typeof item === "string") return undefined;
  return item.icon || undefined;
}

// ── ItemQuantity Tree Parser ──

/**
 * Recursively flatten an ItemQuantity tree into a list of rewards with expected values.
 *
 * - `item` leaf: expectedValue = midpoint(quantity, maxQuantity) × multiplier
 * - `allOf`: each child drops — recurse each
 * - `oneOf`: weighted random selection — expectedValue per child = childQty × (weight/total) × pulls
 * - `chanceOf`: chance-based — recurse child with multiplier × pulls
 */
function flattenRewards(
  iq: RawItemQuantity | undefined,
  multiplier = 1,
): NodeReward[] {
  if (!iq) return [];
  const results: NodeReward[] = [];

  // Leaf node
  if (iq.item !== undefined) {
    const rawQty = iq.quantity ?? 1;
    const qty = iq.maxQuantity ? (rawQty + iq.maxQuantity) / 2 : rawQty;
    const expectedValue = qty * multiplier;

    const icon = getItemIcon(iq.item);
    const reward: NodeReward = {
      itemId: getItemId(iq.item),
      itemName: getItemName(iq.item),
      ...(icon ? { icon } : {}),
      quantity: rawQty,
      maxQuantity: iq.maxQuantity,
      weight: iq.weight,
      expectedValue,
      type: classifyItemType(iq.item),
    };
    if (typeof iq.item !== "string" && iq.item.characterId) {
      reward.characterId = iq.item.characterId;
    }
    results.push(reward);
    return results;
  }

  // allOf: all children drop
  if (iq.allOf) {
    for (const child of iq.allOf) {
      results.push(...flattenRewards(child, multiplier));
    }
  }

  // oneOf: weighted random selection
  if (iq.oneOf) {
    const totalWeight = iq.oneOf.reduce((sum, c) => sum + (c.weight ?? 1), 0);
    const pulls = iq.pulls ?? 1;
    for (const child of iq.oneOf) {
      const childWeight = child.weight ?? 1;
      const prob = (childWeight / totalWeight) * pulls;
      results.push(...flattenRewards(child, multiplier * prob));
    }
  }

  // chanceOf: chance-based
  if (iq.chanceOf) {
    const pulls = iq.pulls ?? 1;
    results.push(...flattenRewards(iq.chanceOf, multiplier * pulls));
  }

  return results;
}

/**
 * Merge duplicate items in a reward list (same itemId) by summing expectedValue.
 */
function mergeRewards(rewards: NodeReward[]): NodeReward[] {
  const map = new Map<string, NodeReward>();
  for (const r of rewards) {
    const existing = map.get(r.itemId);
    if (existing) {
      existing.expectedValue += r.expectedValue;
      // Keep the higher raw quantity for display
      if (r.quantity > existing.quantity) {
        existing.quantity = r.quantity;
        existing.maxQuantity = r.maxQuantity;
      }
      // Preserve icon if not already set
      if (!existing.icon && r.icon) {
        existing.icon = r.icon;
      }
    } else {
      map.set(r.itemId, { ...r });
    }
  }
  return Array.from(map.values());
}

// ── Main Fetch Logic ──

const CACHE_KEY = "farming:campaign-nodes";

/**
 * Fetch and normalize all campaign nodes with their repeatable rewards.
 * Uses progressive loading: fetch episodic list, then chapters in parallel batches of 5.
 */
export async function fetchCampaignNodes(
  accessToken: string,
  forceRefresh = false,
  onProgress?: (loaded: number, total: number) => void,
): Promise<CampaignNode[]> {
  if (!forceRefresh) {
    const cached = getCached<CampaignNode[]>(CACHE_KEY);
    if (cached) return cached;
  }

  // Step 1: Fetch campaign episodic list
  const episodics = await fetchEpisodicList(accessToken);
  if (!episodics.length) return [];

  // Step 2: Build list of chapter requests
  const chapterRequests: { episodicId: string; episodicName: string; nodeName: string; chapter: number }[] = [];
  for (const ep of episodics) {
    const numChapters = ep.numChapters ?? 0;
    for (let ch = 1; ch <= numChapters; ch++) {
      chapterRequests.push({
        episodicId: ep.id,
        episodicName: ep.name || ep.id,
        nodeName: ep.nodeName || ep.name || ep.id,
        chapter: ch,
      });
    }
  }

  // Step 3: Fetch chapters in parallel batches of 5
  const allNodes: CampaignNode[] = [];
  const batchSize = 5;
  let loaded = 0;

  for (let i = 0; i < chapterRequests.length; i += batchSize) {
    const batch = chapterRequests.slice(i, i + batchSize);
    const results = await Promise.allSettled(
      batch.map((req) =>
        fetchChapterNodes(
          accessToken,
          req.episodicId,
          req.episodicName,
          req.nodeName,
          req.chapter,
        ),
      ),
    );

    for (const result of results) {
      if (result.status === "fulfilled") {
        allNodes.push(...result.value);
      } else {
        console.warn("Chapter fetch failed:", result.reason);
      }
    }

    loaded += batch.length;
    onProgress?.(loaded, chapterRequests.length);
  }

  // Step 4: Cache the result
  setCache(CACHE_KEY, allNodes);
  return allNodes;
}

/**
 * Fetch the list of campaign episodics with pagination.
 */
async function fetchEpisodicList(accessToken: string): Promise<RawEpisodicInfo[]> {
  const all: RawEpisodicInfo[] = [];
  let page = 1;
  const perPage = 100;

  while (true) {
    const res = await msfApiFetch<EpisodicListResponse>({
      path: `/game/v1/episodics/campaign?lang=en&page=${page}&perPage=${perPage}`,
      accessToken,
    });

    if (res.data) {
      all.push(...res.data);
    }

    const totalPages = res.meta?.pages ?? 1;
    if (page >= totalPages) break;
    page++;
  }

  return all;
}

/**
 * Fetch a single chapter's tiers and parse node rewards.
 */
async function fetchChapterNodes(
  accessToken: string,
  episodicId: string,
  episodicName: string,
  nodeName: string,
  chapterNumber: number,
): Promise<CampaignNode[]> {
  const res = await msfApiFetch<ChapterResponse>({
    path: `/game/v1/episodics/campaign/${episodicId}/${chapterNumber}?nodeRewards=full&nodeInfo=part&lang=en`,
    accessToken,
  });

  const nodes: CampaignNode[] = [];
  const epData = res.data;
  if (!epData?.chapters) return nodes;

  // Chapter data is keyed by chapter number
  const chapterData = epData.chapters[String(chapterNumber)];
  if (!chapterData?.tiers) return nodes;

  for (const [tierStr, nodeInfo] of Object.entries(chapterData.tiers)) {
    const tierNumber = parseInt(tierStr, 10);
    if (!nodeInfo) continue;

    // Only index repeatable rewards — skip firstTimeRewards and limitedRewards
    const rawRewards = flattenRewards(nodeInfo.rewards);
    const rewards = mergeRewards(rawRewards);

    // Use nodeName prefix (e.g. "HEROES") + chapter-tier for node label
    const nodeLabel =
      nodeInfo.name || `${nodeName} ${chapterNumber}-${tierNumber}`;

    nodes.push({
      episodicId,
      episodicName,
      chapterNumber,
      tierNumber,
      nodeName: nodeLabel,
      energyCost: nodeInfo.energyCost ?? 0,
      rewards,
    });
  }

  return nodes;
}
