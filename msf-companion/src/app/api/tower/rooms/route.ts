import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { msfApiFetch } from "@/lib/msf-api";

export const dynamic = "force-dynamic";

interface RoomRequirements {
  traits: string[];
  minGearTier: number;
  minStars: number;
  minLevel: number;
}

interface TowerRoom {
  id: string;
  rayId: string;
  name: string;
  requirements: RoomRequirements;
  week: 1 | 2;
}

interface ApiRoom {
  id: string;
  name?: string;
  traits?: string[];
  minGearTier?: number;
  minStars?: number;
  minLevel?: number;
  week?: number;
}

interface ApiRay {
  id: string;
  rooms: ApiRoom[];
}

interface TowerDetailResponse {
  rays: ApiRay[];
}

const RAY_ORDER = ["a", "b", "c"];

function getRayOrder(rayId: string): number {
  const lower = rayId.toLowerCase();
  for (let i = 0; i < RAY_ORDER.length; i++) {
    if (lower.includes(RAY_ORDER[i])) return i;
  }
  return 99;
}

export async function GET(request: NextRequest) {
  const session = await getSession();

  if (!session.accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const towerId = searchParams.get("towerId");

  if (!towerId) {
    return NextResponse.json({ error: "towerId query parameter required" }, { status: 400 });
  }

  try {
    const data = await msfApiFetch<TowerDetailResponse>({
      path: `/player/v1/survivalTowers/${towerId}`,
      accessToken: session.accessToken,
    });

    const rooms: TowerRoom[] = [];

    for (const ray of data.rays) {
      for (const room of ray.rooms) {
        rooms.push({
          id: room.id,
          rayId: ray.id,
          name: room.name || `Room ${room.id}`,
          requirements: {
            traits: room.traits || [],
            minGearTier: room.minGearTier || 1,
            minStars: room.minStars || 1,
            minLevel: room.minLevel || 1,
          },
          week: (room.week === 2 ? 2 : 1) as 1 | 2,
        });
      }
    }

    // Sort by ray order (A, B, C) then by room position within ray
    rooms.sort((a, b) => {
      const rayDiff = getRayOrder(a.rayId) - getRayOrder(b.rayId);
      if (rayDiff !== 0) return rayDiff;
      return a.id.localeCompare(b.id);
    });

    return NextResponse.json(rooms);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    if (message.includes("404")) {
      return NextResponse.json({ error: "Tower not found" }, { status: 404 });
    }
    console.error("Tower rooms API error:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
