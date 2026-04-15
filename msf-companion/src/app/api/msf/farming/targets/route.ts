import { NextResponse } from "next/server";
import { getValidAccessTokenWithRefresh, refreshAccessToken } from "@/lib/auth";
import { msfApiFetch } from "@/lib/msf-api";
import { fetchCampaignNodes, CampaignNode } from "@/lib/farming-service";
import { fetchNormalizedEvents } from "@/lib/planner-events";
import { calculatePriorities } from "@/lib/investment-priority";

export const dynamic = "force-dynamic";

// ── Types ──

interface FarmingNode {
  campaignName: string;
  campaignId: string;
  chapter: number;
  tier: number;
  nodeLabel: string;
  energyCost: number;
  rewardType: "yellowStar" | "redStar";
}

type PriorityTier = "event" | "close-to-max" | "farmable";

interface FarmingTarget {
  characterId: string;
  characterName: string;
  portrait: string;
  currentYellowStars: number;
  currentRedStars: number;
  nodes: FarmingNode[];
  priorityTier: PriorityTier;
  priorityReason: string;
  priorityScore: number;
}

// ── Roster Types ──

const PER_PAGE = 200;

interface RawRosterChar {
  id: string;
  level?: number;
  activeYellow?: number;
  activeRed?: number;
  gearTier?: number;
  power?: number;
  info?: {
    name?: string;
    portrait?: string;
    traits?: (string | { id: string })[];
  };
}

function traitId(t: string | { id: string }): string {
  return typeof t === "string" ? t : t.id;
}

// ── Helpers ──

async function fetchFullRoster(
  token: string,
): Promise<RawRosterChar[]> {
  const page1 = await msfApiFetch<{
    data?: RawRosterChar[];
    meta?: { perTotal?: number };
  }>({
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

/**
 * Extract farmable character entries from campaign nodes.
 * SHARD_* items -> yellowStar (regular campaign character shards)
 * RS_* items -> redStar (Incursion red-star promotion nodes)
 */
function buildFarmableMap(
  nodes: CampaignNode[],
): Map<string, { characterId: string; nodes: FarmingNode[] }> {
  const map = new Map<string, { characterId: string; nodes: FarmingNode[] }>();

  for (const node of nodes) {
    for (const reward of node.rewards) {
      const itemId = reward.itemId;
      let characterId: string | undefined;
      let rewardType: "yellowStar" | "redStar" | undefined;

      if (itemId.startsWith("SHARD_")) {
        // e.g. SHARD_WOLVERINE => characterId = WOLVERINE
        characterId = reward.characterId ?? itemId.replace(/^SHARD_/, "");
        rewardType = "yellowStar";
      } else if (itemId.startsWith("RS_")) {
        // e.g. RS_DAREDEVIL_5 => characterId = DAREDEVIL (remove _N suffix)
        const withoutPrefix = itemId.replace(/^RS_/, "");
        // Remove the trailing _N (star level)
        characterId = withoutPrefix.replace(/_\d+$/, "");
        rewardType = "redStar";
      }

      if (!characterId || !rewardType) continue;

      let entry = map.get(characterId);
      if (!entry) {
        entry = { characterId, nodes: [] };
        map.set(characterId, entry);
      }

      entry.nodes.push({
        campaignName: node.episodicName,
        campaignId: node.episodicId,
        chapter: node.chapterNumber,
        tier: node.tierNumber,
        nodeLabel: node.nodeName,
        energyCost: node.energyCost,
        rewardType,
      });
    }
  }

  return map;
}

// ── Route Handler ──

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
    // Fetch campaign nodes, roster, and events in parallel
    const [campaignNodes, rosterRaw, events] = await Promise.all([
      fetchCampaignNodes(token, forceRefresh),
      fetchFullRoster(token),
      fetchNormalizedEvents(token, forceRefresh),
    ]);

    // Build farmable character -> node map
    const farmableMap = buildFarmableMap(campaignNodes);

    // Build roster lookup: characterId -> { yellowStars, redStars, name, portrait, traits, gearTier }
    const rosterLookup = new Map<
      string,
      {
        name: string;
        portrait: string;
        yellowStars: number;
        redStars: number;
        traits: string[];
        gearTier: number;
      }
    >();
    for (const c of rosterRaw) {
      rosterLookup.set(c.id, {
        name: c.info?.name ?? c.id,
        portrait: c.info?.portrait ?? "",
        yellowStars: c.activeYellow ?? 0,
        redStars: c.activeRed ?? 0,
        traits: (c.info?.traits ?? []).map(traitId),
        gearTier: c.gearTier ?? 0,
      });
    }

    // Calculate event priorities
    const characters = rosterRaw.map((c) => ({
      id: c.id,
      name: c.info?.name ?? c.id,
      portrait: c.info?.portrait ?? "",
      traits: (c.info?.traits ?? []).map(traitId),
      gearTier: c.gearTier ?? 0,
      stars: c.activeYellow ?? 0,
    }));
    const priorities = calculatePriorities(characters, events, new Map());
    const eventCharMap = new Map<string, { score: number; reason: string }>();
    for (const p of priorities) {
      eventCharMap.set(p.characterId, {
        score: p.score,
        reason: `Event priority #${p.rank}: ${p.events.map((e) => e.name).join(", ")}`,
      });
    }

    // Build farming targets
    const targets: FarmingTarget[] = [];

    for (const [characterId, farmEntry] of farmableMap) {
      const roster = rosterLookup.get(characterId);
      const yellowStars = roster?.yellowStars ?? 0;
      const redStars = roster?.redStars ?? 0;

      // Exclude characters at 7 yellow AND 7 red
      if (yellowStars >= 7 && redStars >= 7) continue;

      const name = roster?.name ?? characterId;
      const portrait = roster?.portrait ?? "";

      // Determine priority tier
      let priorityTier: PriorityTier;
      let priorityReason: string;
      let priorityScore: number;

      const eventInfo = eventCharMap.get(characterId);

      if (eventInfo) {
        priorityTier = "event";
        priorityReason = eventInfo.reason;
        priorityScore = eventInfo.score;
      } else if (yellowStars >= 5 || redStars >= 5) {
        priorityTier = "close-to-max";
        const maxStars = Math.max(yellowStars, redStars);
        priorityReason = `Close to max: ${yellowStars}Y/${redStars}R stars`;
        priorityScore = maxStars;
      } else {
        priorityTier = "farmable";
        priorityReason = "Campaign farmable";
        priorityScore = 0;
      }

      targets.push({
        characterId,
        characterName: name,
        portrait,
        currentYellowStars: yellowStars,
        currentRedStars: redStars,
        nodes: farmEntry.nodes,
        priorityTier,
        priorityReason,
        priorityScore,
      });
    }

    // Sort within each tier
    const tierOrder: Record<PriorityTier, number> = {
      event: 0,
      "close-to-max": 1,
      farmable: 2,
    };

    targets.sort((a, b) => {
      const tierDiff = tierOrder[a.priorityTier] - tierOrder[b.priorityTier];
      if (tierDiff !== 0) return tierDiff;

      if (a.priorityTier === "event") {
        // Event: sort by priority score descending
        return b.priorityScore - a.priorityScore;
      }
      if (a.priorityTier === "close-to-max") {
        // Close-to-max: sort by stars descending
        return b.priorityScore - a.priorityScore;
      }
      // Farmable: sort alphabetically
      return a.characterName.localeCompare(b.characterName);
    });

    return NextResponse.json({
      targets,
      totalCount: targets.length,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    // Token expired — try refresh once
    if (message.includes("401")) {
      const freshToken = await refreshAccessToken();
      if (freshToken) {
        try {
          // Retry with fresh token - simplified retry
          const [campaignNodes, rosterRaw] = await Promise.all([
            fetchCampaignNodes(freshToken, true),
            fetchFullRoster(freshToken),
          ]);
          const farmableMap = buildFarmableMap(campaignNodes);
          const rosterLookup = new Map<string, { yellowStars: number; redStars: number }>();
          for (const c of rosterRaw) {
            rosterLookup.set(c.id, {
              yellowStars: c.activeYellow ?? 0,
              redStars: c.activeRed ?? 0,
            });
          }
          // If retry succeeds, return minimal response
          const targets: FarmingTarget[] = [];
          for (const [characterId, farmEntry] of farmableMap) {
            const roster = rosterLookup.get(characterId);
            const ys = roster?.yellowStars ?? 0;
            const rs = roster?.redStars ?? 0;
            if (ys >= 7 && rs >= 7) continue;
            const rosterFull = rosterRaw.find((c) => c.id === characterId);
            targets.push({
              characterId,
              characterName: rosterFull?.info?.name ?? characterId,
              portrait: rosterFull?.info?.portrait ?? "",
              currentYellowStars: ys,
              currentRedStars: rs,
              nodes: farmEntry.nodes,
              priorityTier: "farmable",
              priorityReason: "Campaign farmable",
              priorityScore: 0,
            });
          }
          targets.sort((a, b) => a.characterName.localeCompare(b.characterName));
          return NextResponse.json({ targets, totalCount: targets.length });
        } catch {
          // Second attempt also failed
        }
      }
      return NextResponse.json(
        {
          error: "Session expired. Please log in again.",
          code: "TOKEN_EXPIRED",
          retryable: false,
        },
        { status: 401 },
      );
    }

    if (message.includes("552") || message.includes("553")) {
      return NextResponse.json(
        {
          error: "Game servers are in maintenance. Please try again later.",
          code: "MAINTENANCE",
          retryable: true,
        },
        { status: 503 },
      );
    }

    if (message.includes("472")) {
      return NextResponse.json(
        {
          error: "Response too large — try again shortly.",
          code: "RESPONSE_TOO_LARGE",
          retryable: true,
        },
        { status: 502 },
      );
    }

    console.error("Farming targets fetch failed:", err);
    return NextResponse.json(
      {
        error: "Failed to load farming targets",
        code: "MSF_API_ERROR",
        retryable: true,
      },
      { status: 502 },
    );
  }
}
