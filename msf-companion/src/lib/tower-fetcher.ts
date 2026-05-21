import { msfApiFetch } from "./msf-api";

const HYDRA_TOKEN_URL = "https://hydra-public.prod.m3.scopelypv.com/oauth2/token";

let cachedToken: { token: string; expiresAt: number } | null = null;

export async function getMsfBearerToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.token;
  }
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
  if (!response.ok) throw new Error(`Failed to obtain MSF API token: ${response.status}`);
  const data = (await response.json()) as { access_token: string; expires_in?: number };
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
  };
  return data.access_token;
}

interface RawCharFilter {
  allTraits?: Array<string | { id: string }>;
  anyTraits?: Array<string | { id: string }>;
  anyCharacters?: string[];
  gearTier?: number;
  activeYellow?: number;
  level?: number;
}

interface RawRequirements {
  minCharacters?: number;
  maxCharacters?: number;
  anyCharacterFilters?: RawCharFilter[];
  specificCharacters?: string[];
}

interface RoomDetailResponse {
  data?: {
    name?: string;
    subName?: string;
    requirements?: RawRequirements;
    combatId?: string;
  };
}

export interface CharacterFilter {
  allTraits: string[];
  anyTraits: string[];
  anyCharacters: string[];
  gearTier: number;
  minStars: number;
  minLevel: number;
}

export interface TowerRoomRequirements {
  // Legacy / display convenience fields (flattened across all filters).
  traits: string[];
  minGearTier: number;
  minStars: number;
  minLevel: number;
  minCharacters: number;
  maxCharacters: number;
  specificCharacters: string[];
  // Structured filters — preserve OR-of-ANDs semantics from MSF API.
  // A character qualifies if it matches ANY filter (each filter requires ALL its constraints).
  filters: CharacterFilter[];
}

export interface TowerRoom {
  id: string;
  rayId: string;
  name: string;
  requirements: TowerRoomRequirements;
  week: 1 | 2;
}

const RAY_ORDER = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"];

function traitId(t: string | { id: string }): string {
  return typeof t === "string" ? t : t.id;
}

function flattenRequirements(raw: RawRequirements | undefined): TowerRoomRequirements {
  const traits = new Set<string>();
  const specificCharacters = new Set<string>();
  let minGearTier = 0;
  let minStars = 0;
  let minLevel = 0;
  const filters: CharacterFilter[] = [];

  if (raw?.anyCharacterFilters) {
    for (const f of raw.anyCharacterFilters) {
      const allTraits = (f.allTraits ?? []).map(traitId);
      const anyTraits = (f.anyTraits ?? []).map(traitId);
      const anyCharacters = f.anyCharacters ?? [];
      const fGear = f.gearTier ?? 0;
      const fStars = f.activeYellow ?? 0;
      const fLevel = f.level ?? 0;

      filters.push({
        allTraits,
        anyTraits,
        anyCharacters,
        gearTier: fGear,
        minStars: fStars,
        minLevel: fLevel,
      });

      for (const t of allTraits) traits.add(t);
      for (const t of anyTraits) traits.add(t);
      for (const c of anyCharacters) specificCharacters.add(c);
      if (fGear) minGearTier = Math.max(minGearTier, fGear);
      if (fStars) minStars = Math.max(minStars, fStars);
      if (fLevel) minLevel = Math.max(minLevel, fLevel);
    }
  }
  if (raw?.specificCharacters) {
    for (const c of raw.specificCharacters) specificCharacters.add(c);
  }

  return {
    traits: [...traits],
    minGearTier,
    minStars,
    minLevel,
    minCharacters: raw?.minCharacters || raw?.maxCharacters || 5,
    maxCharacters: raw?.maxCharacters ?? 5,
    specificCharacters: [...specificCharacters],
    filters,
  };
}

interface TowerLayoutResponse {
  data?: {
    rays?: string[][];
  };
}

// Module-scoped cache so concurrent requests for rooms+readiness don't duplicate 58 API calls.
const roomCache = new Map<string, { rooms: TowerRoom[]; expiresAt: number }>();
const inFlight = new Map<string, Promise<TowerRoom[]>>();
const ROOM_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export async function fetchTowerRooms(towerId: string, accessToken?: string): Promise<TowerRoom[]> {
  const cached = roomCache.get(towerId);
  if (cached && cached.expiresAt > Date.now()) return cached.rooms;

  const pending = inFlight.get(towerId);
  if (pending) return pending;

  const promise = doFetchTowerRooms(towerId, accessToken).finally(() => {
    inFlight.delete(towerId);
  });
  inFlight.set(towerId, promise);
  return promise;
}

async function doFetchTowerRooms(towerId: string, accessToken?: string): Promise<TowerRoom[]> {
  const token = accessToken ?? (await getMsfBearerToken());

  // 1. Fetch layout
  const layout = await msfApiFetch<TowerLayoutResponse>({
    path: `/game/v1/survivalTowers/${towerId}`,
    accessToken: token,
  });
  const rays = layout.data?.rays ?? [];

  // 2. Fetch per-room details in parallel
  const roomFetches: Promise<TowerRoom | null>[] = [];
  for (let rayIndex = 0; rayIndex < rays.length; rayIndex++) {
    const rayLetter = RAY_ORDER[rayIndex] ?? String.fromCharCode(65 + rayIndex);
    const week: 1 | 2 = rayIndex < 6 ? 1 : 2;
    for (const roomId of rays[rayIndex]) {
      if (!roomId || roomId.trim() === "") continue;
      roomFetches.push(
        msfApiFetch<RoomDetailResponse>({
          path: `/game/v1/survivalTowers/${towerId}/${roomId}?nodeReqs=full&pieceInfo=full&traitFormat=id`,
          accessToken: token,
        })
          .then((detail): TowerRoom => ({
            id: roomId,
            rayId: rayLetter,
            name: detail.data?.name || roomId,
            requirements: flattenRequirements(detail.data?.requirements),
            week,
          }))
          .catch((err) => {
            console.error(`Failed to fetch tower room ${roomId}:`, err);
            return null;
          }),
      );
    }
  }

  const results = await Promise.all(roomFetches);
  const rooms = results.filter((r): r is TowerRoom => r !== null);

  rooms.sort((a, b) => {
    if (a.rayId !== b.rayId) return a.rayId.localeCompare(b.rayId);
    return a.id.localeCompare(b.id);
  });

  roomCache.set(towerId, { rooms, expiresAt: Date.now() + ROOM_CACHE_TTL });
  return rooms;
}

export function clearTowerRoomCache(towerId?: string): void {
  if (towerId) roomCache.delete(towerId);
  else roomCache.clear();
}
