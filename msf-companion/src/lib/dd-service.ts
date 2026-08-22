import { msfApiFetch } from "@/lib/msf-api";
import { clearCacheByPrefix, getCached, setCache } from "@/lib/planner-cache";

// ── TypeScript Interfaces (mapped from API schemas) ──

export interface Iso8State {
  active?: string;
  striker?: number;
  fortifier?: number;
  healer?: number;
  skirmisher?: number;
  raider?: number;
}

export interface CharacterFilter {
  allTraits?: (string | { id: string })[];
  anyTraits?: (string | { id: string })[];
  exceptTraits?: (string | { id: string })[];
  anyCharacters?: string[];
  gearTier?: number;
  level?: number;
  activeYellow?: number;
  activeRed?: number;
  iso8Class?: string;
  iso8ClassLevel?: number;
}

export interface NodeRequirements {
  anyCharacterFilters?: CharacterFilter[];
  minCharacters?: number;
  maxCharacters?: number;
  missionCharacters?: boolean;
  specificCharacters?: string[];
  otherRequirements?: Record<string, unknown>;
}

export interface EnemyUnit {
  id: string;
  level?: number;
  activeYellow?: number;
  activeRed?: number;
  gearTier?: number;
  gearSlots?: unknown[];
  basic?: number;
  special?: number;
  ultimate?: number;
  passive?: number;
  iso8?: Iso8State;
  nodeEffects?: unknown[];
  difficultyBoost?: unknown;
  stats?: Record<string, number>;
  mission?: boolean;
  info?: {
    id?: string;
    name?: string;
    portrait?: string;
    traits?: (string | { id: string })[];
    invisibleTraits?: (string | { id: string })[];
  };
}

export interface CombatWave {
  units: EnemyUnit[];
  onFewerThan?: number;
  holdNextWaveUntil?: number;
}

export interface EnemyCombat {
  left?: { waves: CombatWave[] };
  right?: { waves: CombatWave[] };
}

export interface DDNode {
  roomId: string;
  name?: string;
  isBoss?: boolean;
  sectionName?: string;
  requirements?: NodeRequirements;
  combat?: EnemyCombat;
  combatId?: string;
  roomNW?: string;
  roomNE?: string;
  roomSE?: string;
  roomSW?: string;
}

export interface DDInfo {
  id: string;
  name?: string;
  rayCount?: number;
  rayDepth?: number;
  rays?: string[][];
  startingRoomId?: string;
  ddCompletion?: unknown;
  nodes: DDNode[];
  nodeCount?: number;
  meta?: {
    hashes?: {
      nodes?: string;
      chars?: string;
    };
  };
}

// ── Raw API response shapes ──

interface RawDDListResponse {
  data?: RawDDListItem[];
  meta?: { hashes?: { nodes?: string; chars?: string } };
}

interface RawDDListItem {
  id: string;
  name?: string;
  rayCount?: number;
  rayDepth?: number;
  rays?: string[][];
  startingRoomId?: string;
  ddCompletion?: unknown;
  combatNodesPerTeam?: number;
  rooms?: Record<string, RawRoomData>;
}

interface RawDDDetailResponse {
  data?: {
    id: string;
    name?: string;
    rayCount?: number;
    rayDepth?: number;
    rays?: string[][];
    startingRoomId?: string;
    ddCompletion?: unknown;
    rooms?: Record<string, RawRoomData>;
  };
  meta?: { hashes?: { nodes?: string; chars?: string } };
}

interface RawRoomData {
  name?: string;
  isBoss?: boolean;
  sectionName?: string;
  requirements?: RawNodeRequirements;
  combatId?: string;
  roomNW?: string;
  roomNE?: string;
  roomSE?: string;
  roomSW?: string;
}

interface RawNodeDetailResponse {
  data?: {
    name?: string;
    isBoss?: boolean;
    sectionName?: string;
    requirements?: RawNodeRequirements;
    combat?: EnemyCombat;
    combatId?: string;
    roomNW?: string;
    roomNE?: string;
    roomSE?: string;
    roomSW?: string;
  };
  meta?: { hashes?: { nodes?: string; chars?: string } };
}

type RawNodeRequirements = NodeRequirements | Array<NodeRequirements | null>;

// ── Cache keys & hash tracking ──

const CACHE_PREFIX = "dd:";
let storedNodeHash: string | null = null;
let storedCharHash: string | null = null;

function checkHashInvalidation(meta?: {
  hashes?: { nodes?: string; chars?: string };
}): boolean {
  if (!meta?.hashes) return false;
  const nodeHash = meta.hashes.nodes ?? null;
  const charHash = meta.hashes.chars ?? null;
  let invalidated = false;

  if (
    storedNodeHash !== null &&
    nodeHash !== null &&
    nodeHash !== storedNodeHash
  ) {
    invalidated = true;
  }
  if (
    storedCharHash !== null &&
    charHash !== null &&
    charHash !== storedCharHash
  ) {
    invalidated = true;
  }

  if (nodeHash !== null) storedNodeHash = nodeHash;
  if (charHash !== null) storedCharHash = charHash;

  return invalidated;
}

function invalidateDDCache(): void {
  clearCacheByPrefix(CACHE_PREFIX);
}

// ── Service Functions ──

export async function fetchAllDDs(
  accessToken: string,
  forceRefresh = false,
): Promise<DDInfo[]> {
  const cacheKey = `${CACHE_PREFIX}list`;

  if (!forceRefresh) {
    const cached = getCached<DDInfo[]>(cacheKey);
    if (cached) return cached;
  }

  const raw = await msfApiFetch<RawDDListResponse>({
    path: "/game/v1/dds?lang=en&raidInfo=full&raidMap=full",
    accessToken,
  });

  if (checkHashInvalidation(raw.meta)) {
    invalidateDDCache();
  }

  const dds: DDInfo[] = (raw.data ?? []).map((item) => {
    const rayRoomIds = combatRoomIds(item.rays, item.startingRoomId);

    // A DD map can contain gaps and branching paths, so rayCount*rayDepth is
    // not a node count. The starting room is a non-combat map entrance, so it
    // must not be included in the planner's combat-node total.
    const roomCount = item.rooms
      ? Object.keys(item.rooms).filter(
          (roomId) => roomId !== item.startingRoomId,
        ).length
      : rayRoomIds.length > 0
        ? rayRoomIds.length
        : (item.combatNodesPerTeam ?? 0);

    return {
      id: item.id,
      name: item.name,
      rayCount: item.rayCount,
      rayDepth: item.rayDepth,
      rays: item.rays,
      startingRoomId: item.startingRoomId,
      ddCompletion: item.ddCompletion,
      nodes: [],
      nodeCount: roomCount,
      meta: raw.meta,
    };
  });

  setCache(cacheKey, dds);
  return dds;
}

export async function fetchDD(
  ddId: string,
  accessToken: string,
  forceRefresh = false,
): Promise<DDInfo> {
  const cacheKey = `${CACHE_PREFIX}detail:${ddId}`;

  if (!forceRefresh) {
    const cached = getCached<DDInfo>(cacheKey);
    if (cached) return cached;
  }

  const raw = await msfApiFetch<RawDDDetailResponse>({
    path: `/game/v1/dds/${encodeURIComponent(ddId)}?lang=en&nodeInfo=full&nodeReqs=full`,
    accessToken,
  });

  if (checkHashInvalidation(raw.meta)) {
    invalidateDDCache();
  }

  const data = raw.data;
  if (!data) {
    throw new DDServiceError(404, `Dark Dimension '${ddId}' not found`);
  }

  // Current live responses expose the map as a sparse rays grid and may omit
  // the legacy rooms object. The starting room is the non-combat entrance, so
  // build selectable nodes from every other room and then enrich them with
  // room metadata when it is present.
  const orderedRoomIds = combatRoomIds(data.rays, data.startingRoomId);
  if (orderedRoomIds.length === 0 && data.rooms) {
    orderedRoomIds.push(
      ...Object.keys(data.rooms).filter(
        (roomId) => roomId !== data.startingRoomId,
      ),
    );
  }
  const nodes: DDNode[] = orderedRoomIds.map((roomId) => {
    const room = data.rooms?.[roomId];
    return {
      roomId,
      name: room?.name,
      isBoss: room?.isBoss,
      sectionName: room?.sectionName,
      requirements: normalizeRequirements(room?.requirements),
      combatId: room?.combatId,
      roomNW: room?.roomNW,
      roomNE: room?.roomNE,
      roomSE: room?.roomSE,
      roomSW: room?.roomSW,
    };
  });

  const dd: DDInfo = {
    id: data.id,
    name: data.name,
    rayCount: data.rayCount,
    rayDepth: data.rayDepth,
    rays: data.rays,
    startingRoomId: data.startingRoomId,
    ddCompletion: data.ddCompletion,
    nodes,
    meta: raw.meta,
  };

  setCache(cacheKey, dd);
  return dd;
}

export async function fetchNode(
  ddId: string,
  roomId: string,
  accessToken: string,
  forceRefresh = false,
): Promise<DDNode> {
  const cacheKey = `${CACHE_PREFIX}node:${ddId}:${roomId}`;

  if (!forceRefresh) {
    const cached = getCached<DDNode>(cacheKey);
    if (cached) return cached;
  }

  const raw = await msfApiFetch<RawNodeDetailResponse>({
    path: `/game/v1/dds/${encodeURIComponent(ddId)}/${encodeURIComponent(roomId)}?lang=en&nodeInfo=full&nodeReqs=full&nodeCombat=full&charInfo=full`,
    accessToken,
  });

  if (checkHashInvalidation(raw.meta)) {
    invalidateDDCache();
  }

  const data = raw.data;
  if (!data) {
    throw new DDServiceError(404, `Node '${roomId}' in DD '${ddId}' not found`);
  }
  if (Object.keys(data).length === 0) {
    throw new DDServiceError(
      502,
      `Node '${roomId}' data is temporarily unavailable from the game API`,
    );
  }

  const node: DDNode = {
    roomId,
    name: data.name,
    isBoss: data.isBoss,
    sectionName: data.sectionName,
    requirements: normalizeRequirements(data.requirements),
    combat: data.combat,
    combatId: data.combatId,
    roomNW: data.roomNW,
    roomNE: data.roomNE,
    roomSE: data.roomSE,
    roomSW: data.roomSW,
  };

  setCache(cacheKey, node);
  return node;
}

function uniqueRoomIds(rays?: string[][]): string[] {
  if (!rays) return [];
  return [...new Set(rays.flat().filter((roomId) => roomId.trim().length > 0))];
}

function combatRoomIds(
  rays?: string[][],
  startingRoomId?: string,
): string[] {
  return uniqueRoomIds(rays).filter((roomId) => roomId !== startingRoomId);
}

function normalizeRequirements(
  requirements?: RawNodeRequirements,
): NodeRequirements | undefined {
  if (!Array.isArray(requirements)) return requirements;
  // Per the MSF schema, index 0 represents normal difficulty. DD currently
  // has no difficulty selector, so normal is the only honest planner target.
  return requirements[0] ?? undefined;
}

// ── Error type ──

export class DDServiceError extends Error {
  public readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "DDServiceError";
    this.status = status;
  }
}
