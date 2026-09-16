import { NextResponse } from "next/server";
import { getValidAccessTokenWithRefresh as getValidAccessToken } from "@/lib/auth";
import { msfApiFetch } from "@/lib/msf-api";
import { getSubscriptionTier, isPremium } from "@/lib/subscription";
import { CORE_ITEM_ID, GOLD_ITEM_ID } from "@/lib/cost-bundle";

export const dynamic = "force-dynamic";

const PER_PAGE = 50;
const MAX_PAGES = 200;

interface RawItem {
  id: string;
  name?: string;
  icon?: string;
  characterId?: string;
  tier?: number;
  isOrb?: boolean;
}

interface InventoryItem {
  id: string;
  name?: string;
  icon?: string;
  quantity: number | null;
  category: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalString(value: unknown): string | undefined {
  if (value == null) return undefined;
  if (typeof value !== "string") throw new Error("Invalid inventory item metadata");
  return value.trim() || undefined;
}

function optionalInteger(value: unknown, minimum: number): number | undefined {
  if (value == null) return undefined;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < minimum) {
    throw new Error("Invalid inventory numeric value");
  }
  return value;
}

function iconUrl(value: unknown): string | undefined {
  const candidate = optionalString(value);
  if (!candidate) return undefined;
  try {
    const url = new URL(candidate);
    return url.protocol === "https:" ? url.href : undefined;
  } catch {
    return undefined;
  }
}

function categorize(item: RawItem): string {
  const id = item.id.toLowerCase();
  const name = (item.name ?? "").toLowerCase();
  if (item.characterId) return "Shards";
  if (item.isOrb) return "Orbs";
  // ISO materials may also carry a tier. Do not put them in generic gear.
  if (id.includes("iso") || name.includes("iso-8") || name.includes("iso 8")) return "ISO-8 Items";
  if (item.tier != null) return "Gear";
  if (id.includes("training") || name.includes("training")) return "Training Materials";
  if (id.includes("ability") || name.includes("ability"))
    return "Ability Materials";
  if (item.id === GOLD_ITEM_ID || item.id === CORE_ITEM_ID || id.includes("currency") || name === "gold" || name === "power cores")
    return "Currency";
  return "Other";
}

function parseItem(entry: unknown): InventoryItem {
  if (!isRecord(entry) || (typeof entry.item !== "string" && !isRecord(entry.item))) {
    throw new Error("Invalid inventory entry");
  }
  if (entry.oneOf != null || entry.allOf != null || entry.chanceOf != null) {
    throw new Error("Inventory entry is not a definite owned item");
  }
  const raw = typeof entry.item === "string" ? { id: entry.item } : entry.item;
  const id = optionalString(raw.id);
  if (!id) throw new Error("Inventory item has no ID");
  if (raw.isOrb != null && typeof raw.isOrb !== "boolean") {
    throw new Error("Invalid inventory orb flag");
  }
  const item: RawItem = {
    id,
    name: optionalString(raw.name),
    icon: iconUrl(raw.icon),
    characterId: optionalString(raw.characterId),
    tier: optionalInteger(raw.tier, 0),
    isOrb: raw.isOrb === true,
  };
  // A missing balance is not evidence that the commander owns zero.
  const quantity = optionalInteger(entry.quantity, 0) ?? null;
  if (entry.maxQuantity != null && entry.maxQuantity !== quantity) {
    throw new Error("Inventory entry contains a quantity range");
  }
  return { id, name: item.name, icon: item.icon, quantity, category: categorize(item) };
}

async function fetchInventory(token: string): Promise<InventoryItem[]> {
  const items: InventoryItem[] = [];
  const seen = new Set<string>();
  let total: number | undefined;

  // /player/v1/inventory defaults to item IDs, not metadata. Its documented
  // pagination is page/perPage with meta.perTotal (msf-api/msf-api.yaml).
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const raw = await msfApiFetch<unknown>({
      path: "/player/v1/inventory",
      accessToken: token,
      params: {
        itemFormat: "object",
        quantityFormat: "int",
        lang: "en",
        page: String(page),
        perPage: String(PER_PAGE),
      },
    });
    if (!isRecord(raw) || !Array.isArray(raw.data) || raw.error != null) {
      throw new Error("Invalid inventory response");
    }
    if (raw.meta != null && !isRecord(raw.meta)) throw new Error("Invalid inventory pagination");
    const meta = isRecord(raw.meta) ? raw.meta : {};
    const reportedPage = optionalInteger(meta.page, 1);
    const reportedPageSize = optionalInteger(meta.perPage, 1);
    const reportedTotal = optionalInteger(meta.perTotal, 0);
    if ((reportedPage != null && reportedPage !== page) ||
        (reportedPageSize != null && reportedPageSize !== PER_PAGE) || raw.data.length > PER_PAGE) {
      throw new Error("Unexpected inventory page");
    }
    if (reportedTotal != null) {
      if (total != null && total !== reportedTotal) throw new Error("Inventory changed while loading");
      total = reportedTotal;
    }
    for (const entry of raw.data) {
      const item = parseItem(entry);
      if (seen.has(item.id)) throw new Error("Inventory page repeated an item");
      seen.add(item.id);
      items.push(item);
    }
    if (total != null) {
      if (items.length > total) throw new Error("Invalid inventory total");
      if (items.length === total) return items;
      if (raw.data.length < PER_PAGE) throw new Error("Incomplete inventory page");
    } else if (raw.data.length < PER_PAGE) {
      return items;
    }
  }
  throw new Error("Inventory pagination limit reached");
}

export async function GET() {
  const token = await getValidAccessToken();

  if (!token) {
    return NextResponse.json(
      { error: "Unauthorized", code: "UNAUTHORIZED", retryable: false },
      { status: 401 }
    );
  }

  const tier = await getSubscriptionTier();
  if (!isPremium(tier)) {
    return NextResponse.json(
      {
        error: "Premium subscription required",
        code: "PREMIUM_REQUIRED",
        retryable: false,
      },
      { status: 403 }
    );
  }

  try {
    const data = await fetchInventory(token);
    return NextResponse.json({ data }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (err) {
    console.error("MSF inventory fetch failed:", err);
    return NextResponse.json(
      {
        error: "Failed to load inventory data",
        code: "MSF_API_ERROR",
        retryable: true,
      },
      { status: 502 }
    );
  }
}
