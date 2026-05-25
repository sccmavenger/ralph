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

/**
 * Per-node stat boosts as exposed by the MSF API. The `boosts` field can
 * arrive either as a CSV string (PRD-documented order: health,damage,armor,
 * focus,resist[,critDamageBonus,critChance,speed,dodgeChance,blockChance,
 * blockAmount,accuracy,damageReduction]) or as an object with the same
 * named properties. Each value is in tenths of a percent (e.g. 350 = 35.0%).
 */
export type NodeEffectBoosts =
  | string
  | {
      health?: number;
      damage?: number;
      armor?: number;
      focus?: number;
      resist?: number;
      [k: string]: number | undefined;
    };

export interface NodeEffects {
  boosts?: NodeEffectBoosts;
  [k: string]: unknown;
}

export interface EnemyUnit {
  id: string;
  name?: string;
  level?: number;
  gearTier?: number;
  activeYellow?: number;
  activeRed?: number;
  power?: number;
  stats?: Record<string, number>;
  nodeEffects?: NodeEffects | unknown;
  iso8?: { active?: string; level?: number; pips?: number };
  // US-008: ability tags surfaced by the solve route (sourced from
  // `extractAbilityTags`). Empty/omitted when tag extraction wasn't run
  // or returned no tags for this character.
  tags?: string[];
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

/**
 * Field order of the CSV form of `NodeEffects.boosts` per the MSF API spec
 * (StatBoost schema). The first five entries are the ones the PRD US-008
 * heuristic actually multiplies into power; the rest are kept so future
 * heuristics can read them without re-parsing.
 */
const BOOST_CSV_FIELDS = [
  "health",
  "damage",
  "armor",
  "focus",
  "resist",
  "critDamageBonus",
  "critChance",
  "speed",
  "dodgeChance",
  "blockChance",
  "blockAmount",
  "accuracy",
  "damageReduction",
] as const;

/** Fields whose sum drives the power-adjustment heuristic. */
const POWER_BOOST_FIELDS = ["health", "damage", "armor", "focus", "resist"] as const;

function parseBoosts(boosts: NodeEffectBoosts | undefined): Record<string, number> {
  if (!boosts) return {};
  if (typeof boosts === "string") {
    const parts = boosts.split(",");
    const out: Record<string, number> = {};
    for (let i = 0; i < parts.length && i < BOOST_CSV_FIELDS.length; i++) {
      const n = Number(parts[i]);
      if (Number.isFinite(n)) out[BOOST_CSV_FIELDS[i]] = n;
    }
    return out;
  }
  if (typeof boosts === "object") {
    const out: Record<string, number> = {};
    for (const k of Object.keys(boosts)) {
      const v = (boosts as Record<string, unknown>)[k];
      if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
    }
    return out;
  }
  return {};
}

/**
 * Adjusts a unit's `power` to account for per-node stat boosts.
 *
 * Heuristic (per PRD US-008): multiplier = 1 + sum(boosts) / 1000, where
 * boosts is the sum of the health, damage, armor, focus, and resist fields
 * of `unit.nodeEffects.boosts` (values are in tenths of a percent — e.g.
 * 350 = 35.0%). Units with no boosts (or no `nodeEffects`) are returned
 * unchanged.
 *
 * NOTE: This is a heuristic pending dev clarification on Q1 (difficulty
 * scaling). Real per-stat → power impact varies by character role and
 * gear/ISO setup; for now an additive aggregate of the five core stats is
 * the simplest signal that meaningfully reweights buffed cells against
 * unbuffed ones in the planner.
 */
export function applyNodeEffects(unit: EnemyUnit): EnemyUnit {
  const ne = (unit.nodeEffects ?? null) as NodeEffects | null;
  const parsed = parseBoosts(ne?.boosts);
  let sum = 0;
  for (const f of POWER_BOOST_FIELDS) {
    sum += parsed[f] ?? 0;
  }
  if (sum === 0 || typeof unit.power !== "number") return unit;
  const multiplier = 1 + sum / 1000;
  return { ...unit, power: Math.round(unit.power * multiplier) };
}

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
        if (unit) units.push(applyNodeEffects(unit));
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
