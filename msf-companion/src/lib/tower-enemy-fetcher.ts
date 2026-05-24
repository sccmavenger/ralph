/**
 * Tower enemy team fetcher.
 *
 * Fetches the real enemy team for a tower combat cell via
 * `/game/v1/nodeCombats/{combatId}` and exposes typed `EnemyTeam`
 * objects (with normalized `EnemyUnit` rows) to the solver and UI.
 *
 * Uses an in-memory cache keyed by `combatId`. The cache is invalidated
 * whenever the API reports a new `meta.hashes.nodes` value, mirroring
 * the pattern in {@link file://./dd-service.ts}.
 */

import { msfApiFetch } from "@/lib/msf-api";

// ── Public types ──────────────────────────────────────────────────────────

export interface EnemyUnit {
  id: string;
  name?: string;
  level?: number;
  gearTier?: number;
  activeYellow?: number;
  activeRed?: number;
  power?: number;
  stats?: Record<string, number>;
  nodeEffects?: unknown;
  iso8?: { active?: string; level?: number; pips?: number };
}

export interface EnemyTeam {
  combatId: string;
  units: EnemyUnit[];
  totalPower: number;
}

export interface RoomWithCombatId {
  id: string;
  combatId?: string | null;
}

// ── Raw API response shapes ──────────────────────────────────────────────

interface RawCharacterInfo {
  id?: string;
  name?: string;
}

interface RawCharacterInstance {
  id?: string;
  level?: number;
  gearTier?: number;
  activeYellow?: number;
  activeRed?: number;
  power?: number;
  stats?: Record<string, number>;
  nodeEffects?: unknown;
  iso8?: { active?: string; level?: number; pips?: number };
  info?: RawCharacterInfo;
}

interface RawCombatWave {
  units?: RawCharacterInstance[];
}

interface RawCombatSide {
  waves?: RawCombatWave[];
}

interface RawNodeCombatResponse {
  data?: {
    left?: RawCombatSide;
    right?: RawCombatSide;
  };
  meta?: { hashes?: { nodes?: string; chars?: string } };
}

// ── Cache & hash tracking ────────────────────────────────────────────────

const enemyCache = new Map<string, EnemyTeam>();
let storedNodeHash: string | null = null;

/**
 * Returns true and updates the stored hash if the incoming `meta.hashes.nodes`
 * differs from the previously seen value (matches checkHashInvalidation in
 * dd-service.ts).
 */
function checkHashInvalidation(meta?: {
  hashes?: { nodes?: string; chars?: string };
}): boolean {
  if (!meta?.hashes) return false;
  const nodeHash = meta.hashes.nodes ?? null;
  let invalidated = false;

  if (storedNodeHash !== null && nodeHash !== null && nodeHash !== storedNodeHash) {
    invalidated = true;
  }
  if (nodeHash !== null) storedNodeHash = nodeHash;

  return invalidated;
}

/** Clears the in-memory enemy team cache. Exported for tests and meta-sync use. */
export function clearEnemyTeamCache(): void {
  enemyCache.clear();
  storedNodeHash = null;
}

// ── Normalization ────────────────────────────────────────────────────────

function normalizeUnit(raw: RawCharacterInstance): EnemyUnit | null {
  const id = raw.id ?? raw.info?.id;
  if (!id) return null;
  return {
    id,
    name: raw.info?.name,
    level: raw.level,
    gearTier: raw.gearTier,
    activeYellow: raw.activeYellow,
    activeRed: raw.activeRed,
    power: raw.power,
    stats: raw.stats,
    nodeEffects: raw.nodeEffects,
    iso8: raw.iso8,
  };
}

function buildEnemyTeam(combatId: string, raw: RawNodeCombatResponse): EnemyTeam {
  const sides: RawCombatSide[] = [];
  if (raw.data?.left) sides.push(raw.data.left);
  if (raw.data?.right) sides.push(raw.data.right);

  const units: EnemyUnit[] = [];
  for (const side of sides) {
    for (const wave of side.waves ?? []) {
      for (const rawUnit of wave.units ?? []) {
        const unit = normalizeUnit(rawUnit);
        if (unit) units.push(unit);
      }
    }
  }

  const totalPower = units.reduce((sum, u) => sum + (u.power ?? 0), 0);
  return { combatId, units, totalPower };
}

// ── Public API ───────────────────────────────────────────────────────────

/**
 * Fetches the enemy team for a single tower combat cell. Results are cached
 * in-memory keyed by `combatId`. Cache is invalidated automatically when the
 * upstream `meta.hashes.nodes` value changes.
 */
export async function getEnemyTeam(
  combatId: string,
  towerId: string,
  accessToken: string,
): Promise<EnemyTeam> {
  const cached = enemyCache.get(combatId);
  if (cached) return cached;

  const raw = await msfApiFetch<RawNodeCombatResponse>({
    path: `/game/v1/nodeCombats/${encodeURIComponent(combatId)}`,
    accessToken,
    params: {
      charInfo: "full",
      difficulty: "0",
      difficultyGroup: towerId,
    },
  });

  if (checkHashInvalidation(raw.meta)) {
    enemyCache.clear();
  }

  const team = buildEnemyTeam(combatId, raw);
  enemyCache.set(combatId, team);
  return team;
}

/**
 * Fetches enemy teams for a list of tower rooms in parallel. Rooms without a
 * `combatId` resolve to `null` at the matching array index. Individual fetch
 * failures are propagated by rejecting the returned promise; callers that need
 * graceful per-room degradation should wrap each call in `Promise.allSettled`
 * (see /api/tower/solve route in US-002).
 */
export async function getEnemyTeamsForRooms(
  rooms: ReadonlyArray<RoomWithCombatId>,
  towerId: string,
  accessToken: string,
): Promise<Array<EnemyTeam | null>> {
  return Promise.all(
    rooms.map((room) =>
      room.combatId
        ? getEnemyTeam(room.combatId, towerId, accessToken)
        : Promise.resolve(null),
    ),
  );
}
