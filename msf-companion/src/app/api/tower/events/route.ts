import { NextResponse } from "next/server";
import { msfApiFetch } from "@/lib/msf-api";

const HYDRA_TOKEN_URL = "https://hydra-public.prod.m3.scopelypv.com/oauth2/token";
const MSF_API_KEY = process.env.MSF_API_KEY || "";

async function getMsfBearerToken(): Promise<string> {
  const clientId = process.env.SCOPELY_CLIENT_ID;
  const clientSecret = process.env.SCOPELY_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("SCOPELY_CLIENT_ID or SCOPELY_CLIENT_SECRET not configured");
  }

  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const response = await fetch(HYDRA_TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basicAuth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "Unknown error");
    throw new Error(`Failed to obtain MSF API token: ${response.status} ${text}`);
  }

  const data = (await response.json()) as { access_token: string; expires_in: number };
  return data.access_token;
}

interface TowerEvent {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
  type: string;
}

interface TowerLayout {
  id: string;
  name: string;
  rays: Array<{
    id: string;
    rooms: Array<{
      id: string;
      name: string;
    }>;
  }>;
}

function calculateCurrentWeek(startTime: string): number {
  const start = new Date(startTime).getTime();
  const now = Date.now();
  const diffDays = (now - start) / (1000 * 60 * 60 * 24);
  return Math.floor(diffDays / 7) + 1;
}

export async function GET() {
  try {
    const accessToken = await getMsfBearerToken();

    // 1. Fetch active events
    const eventsData = await msfApiFetch<{ data: TowerEvent[] }>({
      path: "/game/v1/events",
      accessToken,
      params: { eventInfo: "full", perPage: "100" },
    });

    const now = new Date().toISOString();
    const towerEvent = eventsData.data.find(
      (e) =>
        e.type === "pickYourPoison" &&
        (e.name.toLowerCase().includes("tower") || e.id.toLowerCase().includes("tower")) &&
        e.startTime <= now &&
        e.endTime >= now
    );

    if (!towerEvent) {
      return NextResponse.json({ active: false, tower: null });
    }

    // 2. Fetch tower layout
    // First get all towers to find the right one (events don't always contain the tower layout directly)
    const towersData = await msfApiFetch<{ data: Array<{ id: string; name: string }> }>({
        path: "/game/v1/survivalTowers",
        accessToken,
    });

    // Strategy: Match tower by name or ID if possible, or take the one that's linked
    // For now, let's assume we can find a matching tower or fetch detail for a known one.
    // The PRD says "Cross-references with /game/v1/survivalTowers to get tower layout"
    
    // Often there's only one active survival tower.
    const towerInfo = towersData.data[0]; 
    if (!towerInfo) {
        return NextResponse.json({ active: false, tower: null });
    }

    const layout = await msfApiFetch<TowerLayout>({
        path: `/game/v1/survivalTowers/${towerInfo.id}`,
        accessToken,
    });

    return NextResponse.json({
      active: true,
      tower: {
        id: towerInfo.id,
        name: towerInfo.name,
        endDate: towerEvent.endTime,
        currentWeek: calculateCurrentWeek(towerEvent.startTime),
        rays: layout.rays.map(ray => ({
            id: ray.id,
            rooms: ray.rooms.map(room => ({
                id: room.id,
                name: room.name
            }))
        }))
      },
    });
  } catch (error: any) {
    console.error("Tower API Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
