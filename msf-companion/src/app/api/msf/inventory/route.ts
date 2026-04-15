import { NextResponse } from "next/server";
import { getValidAccessTokenWithRefresh as getValidAccessToken } from "@/lib/auth";
import { msfApiFetch } from "@/lib/msf-api";
import { getSubscriptionTier, isPremium } from "@/lib/subscription";

export const dynamic = "force-dynamic";

interface RawItem {
  id?: string;
  name?: string;
  characterId?: string;
  tier?: number;
  isOrb?: boolean;
}

interface RawInventoryEntry {
  item?: RawItem | string;
  quantity?: number;
}

function categorize(item: RawItem): string {
  const id = (item.id ?? "").toLowerCase();
  const name = (item.name ?? "").toLowerCase();
  if (item.characterId) return "Shards";
  if (item.tier != null) return "Gear";
  if (item.isOrb) return "Orbs";
  if (id.includes("ability") || id.includes("training") || name.includes("ability") || name.includes("training"))
    return "Ability Materials";
  if (id.includes("iso") || name.includes("iso")) return "ISO-8 Items";
  if (id.includes("gold") || id.includes("currency") || name.includes("gold"))
    return "Currency";
  return "Other";
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
    const raw = await msfApiFetch<{ data?: RawInventoryEntry[] }>({
      path: "/player/v1/inventory",
      accessToken: token,
    });

    const data = (raw.data ?? [])
      .filter((e) => e.item != null)
      .map((e) => {
        const item =
          typeof e.item === "string"
            ? { id: e.item }
            : (e.item as RawItem);
        return {
          id: item.id ?? "unknown",
          name: item.name,
          quantity: e.quantity ?? 0,
          category: categorize(item),
        };
      });

    return NextResponse.json({ data });
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
