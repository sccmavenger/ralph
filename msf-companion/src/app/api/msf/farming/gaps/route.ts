import { NextResponse } from "next/server";
import { getValidAccessTokenWithRefresh, refreshAccessToken } from "@/lib/auth";
import { msfApiFetch } from "@/lib/msf-api";
import { fetchNormalizedEvents } from "@/lib/planner-events";
import { calculatePriorities } from "@/lib/investment-priority";
import { resolveGearToFarmableItems } from "@/lib/upgrade-calculator";

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
    // Fetch roster, events, and inventory in parallel
    const [rosterRaw, events, inventoryMap] = await Promise.all([
      fetchFullRoster(token),
      fetchNormalizedEvents(token, forceRefresh),
      fetchInventoryMap(token),
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

    // Get priority characters that need gear upgrades
    const priorities = calculatePriorities(characters, events, new Map());

    if (priorities.length === 0) {
      return NextResponse.json({
        gaps: [],
        message: "Set investment priorities in the Planner first",
      });
    }

    // Filter to priorities that actually need gear upgrades
    const upgradeNeeded = priorities.filter((p) => p.requiredGear > p.currentGear);

    if (upgradeNeeded.length === 0) {
      return NextResponse.json({
        gaps: [],
        message: "All priority characters already meet gear requirements",
      });
    }

    // Resolve gear upgrades into base farmable items for each priority character
    const gapMap = new Map<string, GapItem>();

    // Process top priority characters (limit to top 10 to avoid excessive API calls)
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
            deficit: 0, // computed below
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

    // Compute deficits and filter
    const gaps: GapItem[] = [];
    for (const gap of gapMap.values()) {
      gap.owned = inventoryMap.get(gap.itemId) ?? 0;
      gap.deficit = gap.needed - gap.owned;
      if (gap.deficit > 0) {
        gaps.push(gap);
      }
    }

    // Sort by largest deficit first
    gaps.sort((a, b) => b.deficit - a.deficit);

    return NextResponse.json({ gaps });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    if (message.includes("401")) {
      const freshToken = await refreshAccessToken();
      if (freshToken) {
        // Retry with fresh token not implemented for this complex route;
        // instruct user to retry
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

    console.error("Farming gaps fetch failed:", err);
    return NextResponse.json(
      { error: "Failed to compute resource gaps", code: "MSF_API_ERROR", retryable: true },
      { status: 502 },
    );
  }
}
