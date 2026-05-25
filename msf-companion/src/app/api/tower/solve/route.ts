import { NextRequest, NextResponse } from "next/server";
import { getValidAccessTokenWithRefresh as getValidAccessToken } from "@/lib/auth";
import { msfApiFetch } from "@/lib/msf-api";
import { fetchTowerRooms } from "@/lib/tower-fetcher";
import { getEnemyTeam, type EnemyTeam } from "@/lib/tower-enemy-fetcher";
import { extractAbilityTags } from "@/lib/tower-ability-tags";
import type { Character } from "@/lib/tower-readiness";
import type { RoomForSolver, MetaTeam } from "@/lib/tower-solver";

export const dynamic = "force-dynamic";

interface RosterCharacter {
  id: string;
  info?: { name?: string; traits?: Array<string | { id: string }> };
  gearTier?: number;
  activeYellow?: number;
  level?: number;
  power?: number;
}

interface RosterResponse {
  data?: RosterCharacter[];
}

export async function POST(request: NextRequest) {
  const userToken = await getValidAccessToken();
  if (!userToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const { towerId, clearedRooms, metaTeams } = body as {
      towerId?: string;
      clearedRooms?: string[];
      metaTeams?: MetaTeam[];
    };

    if (!towerId) {
      return NextResponse.json({ error: "towerId required in request body" }, { status: 400 });
    }

    const [rosterData, towerRooms] = await Promise.all([
      msfApiFetch<RosterResponse>({
        path: "/player/v1/roster?charInfo=full&traitFormat=id&page=1&perPage=500",
        accessToken: userToken,
      }),
      fetchTowerRooms(towerId),
    ]);

    const roster: Character[] = (rosterData.data || [])
      .filter((c) => (c.power || 0) > 0) // only owned/unlocked characters
      .map((c) => ({
        id: c.id,
        name: c.info?.name || c.id,
        traits: (c.info?.traits || []).map((t) => (typeof t === "string" ? t : t.id)),
        gearTier: c.gearTier || 1,
        stars: c.activeYellow || 1,
        level: c.level || 1,
        power: c.power || 0,
      }));

    const solverRooms: RoomForSolver[] = towerRooms.map((r) => ({
      id: r.id,
      name: r.name,
      requirements: {
        traits: r.requirements.traits,
        minGearTier: r.requirements.minGearTier,
        minStars: r.requirements.minStars,
        minLevel: r.requirements.minLevel,
        filters: r.requirements.filters,
        specificCharacters: r.requirements.specificCharacters,
      },
      minCharacters: r.requirements.minCharacters || 5,
    }));

    const { solveTowerAllocation } = await import("@/lib/tower-solver");

    // Fetch real opponent teams per room. Use allSettled so a single failed
    // combatId doesn't break the whole response — failures are surfaced via
    // roomFetchErrors and the UI can fall back to legacy entry-req selection.
    const fetchableRooms = towerRooms.filter(
      (r): r is typeof r & { combatId: string } =>
        typeof r.combatId === "string" && r.combatId.length > 0,
    );
    const enemyResults = await Promise.allSettled(
      fetchableRooms.map((r) => getEnemyTeam(r.combatId, towerId, userToken)),
    );

    const opponentPowers: Record<string, number> = {};
    const opponentTeams: Record<string, EnemyTeam> = {};
    const roomFetchErrors: string[] = [];
    enemyResults.forEach((res, idx) => {
      const room = fetchableRooms[idx];
      if (res.status === "fulfilled") {
        opponentPowers[room.id] = res.value.totalPower;
        opponentTeams[room.id] = res.value;
      } else {
        console.error(
          `Failed to fetch enemy team for room ${room.id} (combatId=${room.combatId}):`,
          res.reason,
        );
        roomFetchErrors.push(room.combatId);
      }
    });

    // US-006: fetch ability tags ONCE for every character that could matter
    // (opponent units + the player's roster) so the solver can re-rank
    // candidate teams by composite score. extractAbilityTags is cached per
    // character + meta hash so this is cheap on repeat calls.
    const opponentCharIds = new Set<string>();
    for (const team of Object.values(opponentTeams)) {
      for (const unit of team.units) {
        if (unit.id) opponentCharIds.add(unit.id);
      }
    }
    const rosterCharIds = roster.map((c) => c.id);
    const allCharIds = Array.from(
      new Set<string>([...opponentCharIds, ...rosterCharIds]),
    );

    let tagsRecord: Record<string, string[]> | undefined;
    try {
      if (allCharIds.length > 0) {
        tagsRecord = await extractAbilityTags(allCharIds, userToken);
      }
    } catch (err) {
      console.error("Failed to extract ability tags for tower solve:", err);
    }

    const opponentTagsByRoom = new Map<string, string[]>();
    if (tagsRecord) {
      for (const [roomId, team] of Object.entries(opponentTeams)) {
        const tags = new Set<string>();
        for (const unit of team.units) {
          for (const t of tagsRecord[unit.id] ?? []) tags.add(t);
        }
        opponentTagsByRoom.set(roomId, Array.from(tags));
      }
    }
    const opponentPowersMap = new Map<string, number>(
      Object.entries(opponentPowers),
    );

    const result = solveTowerAllocation(
      solverRooms,
      roster,
      metaTeams || [],
      clearedRooms,
      {
        opponentPowers: opponentPowersMap,
        ...(tagsRecord
          ? {
              opponentTags: opponentTagsByRoom,
              characterTags: tagsRecord,
            }
          : {}),
      },
    );

    const assignments: Record<string, unknown> = {};
    result.assignments.forEach((value, key) => {
      assignments[key] = value;
    });

    // US-006: include the solver inputs in the response so the client can
    // re-run `solveTowerAllocation` locally when the user adjusts the safety
    // margin slider — no follow-up API call needed.
    return NextResponse.json({
      assignments,
      unassignableRooms: result.unassignableRooms,
      opponentPowers,
      opponentTeams,
      roomFetchErrors,
      solverInputs: {
        roster,
        solverRooms,
        metaTeams: metaTeams || [],
        clearedRooms: clearedRooms || [],
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Tower solve API error:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
