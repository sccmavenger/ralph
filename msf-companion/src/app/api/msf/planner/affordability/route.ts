import { NextResponse } from "next/server";
import {
  getValidAccessTokenWithRefresh,
  refreshAccessToken,
} from "@/lib/auth";
import { msfApiFetch } from "@/lib/msf-api";
import { getScopelyId } from "@/lib/scopely-id";
import { prisma } from "@/lib/prisma";
import { getWalletByCommanderId } from "@/lib/wallet";
import type { WalletInput } from "@/lib/wallet";
import type { CostBook } from "@/lib/cost-bundle";
import type { ApiBalances } from "@/lib/affordability";
import {
  summarizeEventAffordability,
  type EventBadge,
  type EventBlockingChar,
} from "@/lib/event-affordability";
import { buildCostBill, type BillChar, type CostBill } from "@/lib/cost-bill";

export const dynamic = "force-dynamic";

/**
 * POST /api/msf/planner/affordability (US-007)
 *
 * Per-event affordability badges for the planner. This is a SEPARATE endpoint
 * from `/api/msf/planner/gaps` so the event cards + readiness bars render from
 * the gaps data immediately and the badge fills in progressively — badge
 * computation never blocks the initial card render, and the gaps route (and
 * its tests) are left completely untouched.
 *
 * Request body (the already-loaded gaps events):
 *   { events: [{ eventId, characters: EventBlockingChar[] }] }
 *
 * Response:
 *   { badges: { [eventId]: { tone, label } } }
 *
 * The wallet is self-reported (or absent); a missing wallet yields an
 * "Add wallet to see affordability" badge rather than a misleading verdict.
 */

interface RequestEvent {
  eventId: string;
  characters: EventBlockingChar[];
  /** Deduped under-gate characters (US-008) — priced into the full bill (US-009). */
  underGate?: BillChar[];
}

/** A cost line from the MSF cost book (item id + quantity). */
interface RawCostItem {
  item?: string | { id?: string };
  quantity?: number;
}

const GOLD_ITEM_ID = "SC";

function unauthorized() {
  return NextResponse.json(
    { error: "Unauthorized", code: "UNAUTHORIZED", retryable: false },
    { status: 401 },
  );
}

function itemId(item: RawCostItem["item"]): string {
  return typeof item === "string" ? item : (item?.id ?? "");
}

/**
 * Build the generic cost book used to price the planner deltas. Only the
 * yellow-star curves are fetched (the two dimensions the gaps data exposes:
 * gear tier + stars). Gear-tier gold is not exposed as a curve, so gold here
 * comes from star gates — the full itemised bill lives on the US-009 screen.
 * Fetch failures degrade to empty curves (badges still render).
 */
async function buildCostBook(token: string): Promise<CostBook> {
  const empty: CostBook = {
    gearTiers: {},
    abilityUpgradeCosts: {},
    characterLevelTotalXp: [],
    yellowStarTotalShards: {},
  };

  const [shards, costs] = await Promise.all([
    msfApiFetch<{ data?: Record<string, number> }>({
      path: "/game/v1/upgradeData/yellowStarTotalShards",
      accessToken: token,
    }).catch(() => null),
    msfApiFetch<{ data?: Record<string, RawCostItem[]> }>({
      path: "/game/v1/upgradeData/yellowStarTotalCosts?itemFormat=id",
      accessToken: token,
    }).catch(() => null),
  ]);

  const yellowStarTotalShards =
    shards?.data ?? (shards as Record<string, number> | null) ?? {};

  // Reduce the star cost lines to a cumulative gold-per-star curve.
  const rawCosts = costs?.data ?? (costs as Record<string, RawCostItem[]> | null);
  const yellowStarTotalGold: Record<string, number> = {};
  if (rawCosts) {
    for (const [star, lines] of Object.entries(rawCosts)) {
      let gold = 0;
      for (const line of lines ?? []) {
        if (itemId(line.item) === GOLD_ITEM_ID) gold += line.quantity ?? 0;
      }
      yellowStarTotalGold[star] = gold;
    }
  }

  return { ...empty, yellowStarTotalShards, yellowStarTotalGold };
}

/** Resolve the authenticated commander's self-reported wallet (or null). */
async function loadWallet(): Promise<WalletInput | null> {
  const scopelyId = await getScopelyId(true);
  if (!scopelyId) return null;
  const commander = await prisma.commander.findUnique({
    where: { scopelyId },
    select: { id: true },
  });
  if (!commander) return null;
  const wallet = await getWalletByCommanderId(commander.id);
  return wallet ? { gold: wallet.gold, cores: wallet.cores } : null;
}

/** A single raw inventory line (`{ item, quantity }`). */
interface RawInventoryEntry {
  item?: string | { id?: string };
  quantity?: number;
}

/**
 * Load API-readable balances (ability materials + training XP) for the full
 * bill's "have" column. Best-effort: fetch failures degrade to empty balances
 * (the bill still renders — required stays real, have shows 0). Training XP is
 * not exposed as a distinct inventory line, so it defaults to 0 (the planner
 * deltas carry no level cost, so the XP row is 0/0 anyway).
 */
async function loadApiBalances(token: string): Promise<ApiBalances> {
  const raw = await msfApiFetch<{ data?: RawInventoryEntry[] }>({
    path: "/player/v1/inventory",
    accessToken: token,
  }).catch(() => null);

  const abilityMats: Record<string, number> = {};
  for (const entry of raw?.data ?? []) {
    const id = itemId(entry.item);
    if (id) abilityMats[id] = (abilityMats[id] ?? 0) + (entry.quantity ?? 0);
  }
  return { abilityMats, trainingXp: 0 };
}

export async function POST(request: Request) {
  const scopelyId = await getScopelyId(true);
  if (!scopelyId) return unauthorized();

  const token = await getValidAccessTokenWithRefresh();
  if (!token) return unauthorized();

  let body: { events?: RequestEvent[] };
  try {
    body = (await request.json()) as { events?: RequestEvent[] };
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body", code: "INVALID_INPUT", retryable: false },
      { status: 400 },
    );
  }

  const events = Array.isArray(body.events) ? body.events : [];

  try {
    const [book, wallet] = await Promise.all([
      buildCostBook(token),
      loadWallet(),
    ]);

    // API-readable balances for the full bill's "have" column (best-effort).
    const api: ApiBalances = await loadApiBalances(token);

    const badges: Record<string, EventBadge> = {};
    const bills: Record<string, CostBill> = {};
    for (const event of events) {
      if (!event?.eventId) continue;
      const chars = Array.isArray(event.characters) ? event.characters : [];
      // Badge uses only the wallet-tracked currencies (empty api is fine).
      badges[event.eventId] = summarizeEventAffordability(
        chars,
        book,
        wallet,
        { abilityMats: {}, trainingXp: 0 },
      ).badge;

      // Full itemised bill (US-009) across the deduped under-gate characters.
      const underGate = Array.isArray(event.underGate) ? event.underGate : [];
      bills[event.eventId] = buildCostBill(underGate, book, wallet, api);
    }

    return NextResponse.json({ badges, bills });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    if (message.includes("552") || message.includes("553")) {
      return NextResponse.json(
        { error: "Game servers are in maintenance.", code: "MAINTENANCE", retryable: true },
        { status: 503 },
      );
    }

    console.error("Planner affordability failed:", err);

    if (message.includes("401")) {
      const freshToken = await refreshAccessToken();
      if (!freshToken) {
        return NextResponse.json(
          { error: "Session expired. Please log in again.", code: "TOKEN_EXPIRED", retryable: false },
          { status: 401 },
        );
      }
    }

    return NextResponse.json(
      { error: "Failed to compute affordability", code: "MSF_API_ERROR", retryable: true },
      { status: 502 },
    );
  }
}
