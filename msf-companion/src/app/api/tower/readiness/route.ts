import { NextRequest, NextResponse } from "next/server";
import { getValidAccessTokenWithRefresh as getValidAccessToken } from "@/lib/auth";
import { msfApiFetch } from "@/lib/msf-api";
import { calculateRoomReadiness, RoomReadiness, Character } from "@/lib/tower-readiness";
import { fetchTowerRooms } from "@/lib/tower-fetcher";

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

export async function GET(request: NextRequest) {
  const userToken = await getValidAccessToken();
  if (!userToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const towerId = searchParams.get("towerId");

  if (!towerId) {
    return NextResponse.json({ error: "towerId query parameter required" }, { status: 400 });
  }

  try {
    // Run roster fetch and tower-rooms fetch in parallel.
    const [rosterData, rooms] = await Promise.all([
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

    const readinessMap: Record<string, RoomReadiness> = {};
    for (const room of rooms) {
      const req = room.requirements;
      readinessMap[room.id] = calculateRoomReadiness(
        roster,
        {
          traits: req.traits,
          minGearTier: req.minGearTier,
          minStars: req.minStars,
          minLevel: req.minLevel,
          filters: req.filters,
          specificCharacters: req.specificCharacters,
        },
        req.minCharacters || 5,
      );
    }

    return NextResponse.json(readinessMap);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Tower readiness API error:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
