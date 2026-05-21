import { NextResponse } from "next/server";
import { msfApiFetch } from "@/lib/msf-api";
import { getValidAccessTokenWithRefresh } from "@/lib/auth";

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
  startTime: number | string;
  endTime: number | string;
  type: string;
  subName?: string;
  cardArt?: string;
  popupArt?: string;
  popupDetails?: string;
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

function calculateCurrentWeek(startTime: string | number): number {
  const start = typeof startTime === "number" || !isNaN(Number(startTime))
    ? Number(startTime) * 1000
    : new Date(startTime).getTime();
  const now = Date.now();
  const diffDays = (now - start) / (1000 * 60 * 60 * 24);
  return diffDays < 7 ? 1 : 2;
}

export async function GET(request?: Request) {
  const searchParams = request ? new URL(request.url).searchParams : new URLSearchParams();
  const debug = searchParams.get("debug") === "true";

  try {
    const accessToken = await getMsfBearerToken();

    // 1. Fetch active events
    const eventsData = await msfApiFetch<{ data: TowerEvent[] }>({
      path: "/game/v1/events",
      accessToken,
      params: { eventInfo: "full", perPage: "100" },
    });

    const now = new Date().toISOString();
    const nowUnix = Math.floor(Date.now() / 1000);
    
    // Debug: show all pickYourPoison events
    if (debug) {
      const allPYP = eventsData.data.filter((e) => e.type === "pickYourPoison");
      const allTowerish = eventsData.data.filter((e) => 
        (e.name || "").toLowerCase().includes("tower") || (e.id || "").toLowerCase().includes("tower")
      );
      // Don't return early - fall through to layout debug below
      if (searchParams.get("level") === "events") {
        return NextResponse.json({ 
          debug: true,
          now,
          nowUnix,
          totalEvents: eventsData.data.length,
          pickYourPoisonEvents: allPYP.map(e => ({ id: e.id, name: e.name, type: e.type, startTime: e.startTime, endTime: e.endTime })),
          towerNamedEvents: allTowerish.map(e => ({ id: e.id, name: e.name, type: e.type, startTime: e.startTime, endTime: e.endTime })),
        });
      }
    }

    const towerEvents = eventsData.data.filter(
      (e) =>
        e.type === "pickYourPoison" &&
        ((e.name || "").toLowerCase().includes("tower") || (e.id || "").toLowerCase().includes("tower")) &&
        Number(e.startTime) <= nowUnix &&
        Number(e.endTime) >= nowUnix
    );

    if (towerEvents.length === 0) {
      return NextResponse.json({ active: false, tower: null, towers: [] });
    }

    // 2. Fetch list of available tower definitions
    const towersData = await msfApiFetch<{ data: Array<{ id: string; name?: string }> }>({
        path: "/game/v1/survivalTowers",
        accessToken,
    });
    const allTowers = towersData.data || [];

    // Pair each event to a tower definition by matching the tower-def's `name`
    // (fetched from each tower's layout) against the event's `name`. The list endpoint
    // doesn't include names, so we pre-fetch layouts for candidate towers per family.
    function familyKeyword(name: string): string {
      const n = (name || "").toLowerCase();
      if (n.includes("mighty")) return "mighty";
      if (n.includes("war")) return "war";
      if (n.includes("accursed")) return "accursed";
      if (n.includes("fantastic")) return "fantastic4mcu";
      if (n.includes("magneto")) return "magnetopf";
      return "default";
    }
    // Collect candidate tower IDs per family.
    const candidateIds = new Set<string>();
    for (const ev of towerEvents) {
      const family = familyKeyword(ev.name || "");
      const matching =
        family === "default"
          ? allTowers.filter((t) => /^survivaltower_\d+$/.test(t.id))
          : allTowers.filter((t) => t.id.toLowerCase().includes(family));
      for (const t of matching) candidateIds.add(t.id);
    }
    // Cache layouts so we only fetch each tower-def once across this whole request.
    type Layout = { id?: string; name?: string; rays?: string[][] };
    const layoutById = new Map<string, Layout>();
    await Promise.all(
      [...candidateIds].map(async (tid) => {
        try {
          const r = await msfApiFetch<{ data?: Layout }>({
            path: `/game/v1/survivalTowers/${tid}`,
            accessToken,
          });
          layoutById.set(tid, r.data || {});
        } catch {
          layoutById.set(tid, {});
        }
      })
    );
    const eventToTowerId = new Map<string, string>();
    for (const ev of towerEvents) {
      const family = familyKeyword(ev.name || "");
      const matching =
        family === "default"
          ? allTowers.filter((t) => /^survivaltower_\d+$/.test(t.id))
          : allTowers.filter((t) => t.id.toLowerCase().includes(family));
      const evName = (ev.name || "").trim().toUpperCase();
      const evIsOmega = /\bomega\b/i.test(ev.name || "");
      // 1) Exact name match against the tower-def's `name`.
      let best = matching.find(
        (t) => (layoutById.get(t.id)?.name || "").trim().toUpperCase() === evName
      );
      // 2) Fall back to OMEGA-flag parity between event name and tower-def name.
      if (!best) {
        best = matching.find((t) => {
          const tName = layoutById.get(t.id)?.name || "";
          return /\bomega\b/i.test(tName) === evIsOmega;
        });
      }
      // 3) Last resort: any candidate.
      if (!best) best = matching[0];
      if (best) eventToTowerId.set(ev.id, best.id);
    }

    // Debug: dump pairing decisions before fetching layouts
    if (debug) {
      const layout = await msfApiFetch<{ data?: { id?: string; rays?: string[][] } }>({
        path: `/game/v1/survivalTowers/${eventToTowerId.get(towerEvents[0].id) || allTowers[0]?.id}`,
        accessToken,
      });
      return NextResponse.json({
        rawLayout: layout,
        towerEvent: { id: towerEvents[0].id, name: towerEvents[0].name },
        allTowers,
        allTowerEvents: towerEvents.map((e) => ({ id: e.id, name: e.name, start: e.startTime, end: e.endTime })),
        pairing: [...eventToTowerId.entries()].map(([eid, tid]) => ({ eventId: eid, towerId: tid })),
      });
    }

    // 2b. Try to fetch player event progress (requires user OAuth, not Hydra creds).
    // Maps eventId -> completedTier (number of cells the player has cleared in that tower).
    const completedTierByEvent = new Map<string, number>();
    try {
      const userToken = await getValidAccessTokenWithRefresh();
      if (userToken) {
        const playerEvents = await msfApiFetch<{
          data: Array<{
            id: string;
            pickYourPoison?: {
              brackets?: Array<{ objective?: { progress?: { completedTier?: number } } }>;
            };
          }>;
        }>({
          path: "/player/v1/events",
          accessToken: userToken,
          params: { eventInfo: "full", perPage: "100" },
        });
        for (const pe of playerEvents.data || []) {
          const tier = pe.pickYourPoison?.brackets?.[0]?.objective?.progress?.completedTier;
          if (typeof tier === "number") completedTierByEvent.set(pe.id, tier);
        }
      }
    } catch (err) {
      // Non-fatal: progress auto-detection is optional.
      console.warn("Tower events: failed to fetch player progress", err);
    }

    // 3. Build tower objects using the cached layouts; no additional fetches needed.
    const towers = towerEvents.map((towerEvent) => {
        const towerId = eventToTowerId.get(towerEvent.id) || allTowers[0]?.id;
        if (!towerId) return null;
        const layoutData = layoutById.get(towerId) || {};
        const rawRays: string[][] = layoutData.rays || [];
        const rays = rawRays
          .map((roomIds: string[], index: number) => {
            const rayLetter = String.fromCharCode(65 + index);
            return {
              id: rayLetter,
              rooms: roomIds
                .filter((id: string) => id && id.trim() !== "")
                .map((id: string) => ({ id, name: id })),
            };
          })
          .filter((ray) => ray.rooms.length > 0);
        return {
          id: layoutData.id || towerId,
          eventId: towerEvent.id,
          name: towerEvent.name,
          subName: towerEvent.subName,
          cardArt: towerEvent.cardArt,
          popupArt: towerEvent.popupArt,
          popupDetails: towerEvent.popupDetails,
          endDate: new Date(Number(towerEvent.endTime) * 1000).toISOString(),
          currentWeek: calculateCurrentWeek(towerEvent.startTime),
          rayCount: rawRays.length,
          totalRooms: rays.reduce((sum, r) => sum + r.rooms.length, 0),
          rays,
          completedTier: completedTierByEvent.get(towerEvent.id) ?? null,
        };
      });
    const validTowers = towers.filter((t): t is NonNullable<typeof t> => t !== null);

    return NextResponse.json({
      active: validTowers.length > 0,
      tower: validTowers[0] || null, // backward-compat
      towers: validTowers,
    });
  } catch (error: any) {
    console.error("Tower API Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
