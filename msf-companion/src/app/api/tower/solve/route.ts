import { NextRequest, NextResponse } from "next/server";
import { getValidAccessTokenWithRefresh as getValidAccessToken } from "@/lib/auth";
import { msfApiFetch } from "@/lib/msf-api";
import { fetchTowerRooms } from "@/lib/tower-fetcher";
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
    const result = solveTowerAllocation(solverRooms, roster, metaTeams || [], clearedRooms);

    const assignments: Record<string, unknown> = {};
    result.assignments.forEach((value, key) => {
      assignments[key] = value;
    });

    return NextResponse.json({
      assignments,
      unassignableRooms: result.unassignableRooms,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Tower solve API error:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
