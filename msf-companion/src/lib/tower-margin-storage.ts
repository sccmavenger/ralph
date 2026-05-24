/**
 * Tower Planner — safety-margin persistence (US-006).
 *
 * Stores the user-tuned safety margin per tower event in localStorage under
 * the key `tower-planner-margin:${towerEventId}`. Helpers are pure and
 * accept an optional `storage` argument so they're trivially unit-testable
 * without mocking globals.
 */

export const SAFETY_MARGIN_MIN = 1.0;
export const SAFETY_MARGIN_MAX = 1.5;
export const SAFETY_MARGIN_STEP = 0.05;
export const SAFETY_MARGIN_DEFAULT = 1.1;

const KEY_PREFIX = "tower-planner-margin:";

export interface MarginStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  readonly length: number;
  key(index: number): string | null;
}

function getDefaultStorage(): MarginStorage | null {
  if (typeof globalThis === "undefined") return null;
  const ls = (globalThis as { localStorage?: MarginStorage }).localStorage;
  return ls ?? null;
}

/**
 * Clamp `value` into the [MIN, MAX] window and snap to the nearest STEP
 * (rounded to 2 decimal places to avoid float noise like 1.1500000000000001).
 */
export function clampSafetyMargin(value: number): number {
  if (Number.isNaN(value)) return SAFETY_MARGIN_DEFAULT;
  // Infinity is handled naturally by Math.min/Math.max (clamps to MAX/MIN).
  const clamped = Math.min(SAFETY_MARGIN_MAX, Math.max(SAFETY_MARGIN_MIN, value));
  const stepped = Math.round(clamped / SAFETY_MARGIN_STEP) * SAFETY_MARGIN_STEP;
  return Math.round(stepped * 100) / 100;
}

function keyFor(towerEventId: string): string {
  return `${KEY_PREFIX}${towerEventId}`;
}

/**
 * Load the persisted safety margin for `towerEventId`, falling back to
 * SAFETY_MARGIN_DEFAULT when missing, malformed, or storage is unavailable.
 */
export function loadSafetyMargin(
  towerEventId: string | null | undefined,
  storage: MarginStorage | null = getDefaultStorage(),
): number {
  if (!towerEventId || !storage) return SAFETY_MARGIN_DEFAULT;
  try {
    const raw = storage.getItem(keyFor(towerEventId));
    if (raw == null) return SAFETY_MARGIN_DEFAULT;
    const parsed = Number.parseFloat(raw);
    if (!Number.isFinite(parsed)) return SAFETY_MARGIN_DEFAULT;
    return clampSafetyMargin(parsed);
  } catch {
    return SAFETY_MARGIN_DEFAULT;
  }
}

/**
 * Persist `value` (after clamping) for `towerEventId`. No-op when storage
 * is unavailable or `towerEventId` is empty.
 */
export function saveSafetyMargin(
  towerEventId: string | null | undefined,
  value: number,
  storage: MarginStorage | null = getDefaultStorage(),
): void {
  if (!towerEventId || !storage) return;
  try {
    storage.setItem(keyFor(towerEventId), String(clampSafetyMargin(value)));
  } catch {
    /* ignore quota/serialization errors */
  }
}

/**
 * Remove any persisted safety-margin entries whose key does NOT match
 * `currentEventId`. Called when the active tower changes so stale entries
 * don't accumulate across events.
 */
export function clearOtherEventMargins(
  currentEventId: string | null | undefined,
  storage: MarginStorage | null = getDefaultStorage(),
): void {
  if (!storage) return;
  const keep = currentEventId ? keyFor(currentEventId) : null;
  try {
    const toRemove: string[] = [];
    for (let i = 0; i < storage.length; i++) {
      const k = storage.key(i);
      if (k && k.startsWith(KEY_PREFIX) && k !== keep) toRemove.push(k);
    }
    for (const k of toRemove) storage.removeItem(k);
  } catch {
    /* ignore */
  }
}
