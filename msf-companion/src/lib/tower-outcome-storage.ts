/**
 * Tower Planner — post-fight outcome storage & personal-margin suggestion (US-007).
 *
 * Stores a rolling list of fight outcomes in localStorage under the single
 * key `tower-planner-outcomes`. Pure helpers (margin storage pattern, see
 * `tower-margin-storage.ts`) accept an optional `storage` arg so unit tests
 * don't need a DOM.
 */

import {
  SAFETY_MARGIN_DEFAULT,
  SAFETY_MARGIN_MAX,
  SAFETY_MARGIN_MIN,
  clampSafetyMargin,
} from "./tower-margin-storage";

export const OUTCOMES_STORAGE_KEY = "tower-planner-outcomes";
/** Cap the rolling list so localStorage doesn't grow unbounded across events. */
export const OUTCOMES_MAX_STORED = 100;
/** Window of most-recent outcomes used to compute the suggested margin. */
export const OUTCOMES_WINDOW = 20;
/** Minimum number of outcomes in the window before we surface any suggestion. */
export const OUTCOMES_MIN_FOR_SUGGESTION = 5;

export type FightOutcome = "wonEasily" | "wonBarely" | "lost";

export interface OutcomeEntry {
  towerEventId: string;
  roomId: string;
  outcome: FightOutcome;
  recommendedTeam: string[]; // character ids
  opponentPower: number;
  timestamp: number; // ms epoch
}

export interface OutcomeStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function getDefaultStorage(): OutcomeStorage | null {
  if (typeof globalThis === "undefined") return null;
  const ls = (globalThis as { localStorage?: OutcomeStorage }).localStorage;
  return ls ?? null;
}

function isOutcomeEntry(v: unknown): v is OutcomeEntry {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.towerEventId === "string" &&
    typeof o.roomId === "string" &&
    (o.outcome === "wonEasily" || o.outcome === "wonBarely" || o.outcome === "lost") &&
    Array.isArray(o.recommendedTeam) &&
    o.recommendedTeam.every((x) => typeof x === "string") &&
    typeof o.opponentPower === "number" &&
    typeof o.timestamp === "number"
  );
}

/**
 * Read the persisted outcome list. Returns [] when storage is unavailable,
 * the key is missing, or the JSON is malformed.
 */
export function loadOutcomes(
  storage: OutcomeStorage | null = getDefaultStorage(),
): OutcomeEntry[] {
  if (!storage) return [];
  try {
    const raw = storage.getItem(OUTCOMES_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isOutcomeEntry);
  } catch {
    return [];
  }
}

/**
 * Append `entry` to the rolling list and persist. Trims to `OUTCOMES_MAX_STORED`
 * keeping the most recent entries.
 */
export function recordOutcome(
  entry: OutcomeEntry,
  storage: OutcomeStorage | null = getDefaultStorage(),
): OutcomeEntry[] {
  const next = [...loadOutcomes(storage), entry];
  const trimmed =
    next.length > OUTCOMES_MAX_STORED
      ? next.slice(next.length - OUTCOMES_MAX_STORED)
      : next;
  if (storage) {
    try {
      storage.setItem(OUTCOMES_STORAGE_KEY, JSON.stringify(trimmed));
    } catch {
      /* ignore quota errors */
    }
  }
  return trimmed;
}

/** Clear all stored outcomes. */
export function clearOutcomes(
  storage: OutcomeStorage | null = getDefaultStorage(),
): void {
  if (!storage) return;
  try {
    storage.removeItem(OUTCOMES_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export interface OutcomeTally {
  total: number;
  wonEasily: number;
  wonBarely: number;
  lost: number;
  lostPct: number; // 0-100, rounded to nearest int
  wonEasilyPct: number; // 0-100, rounded to nearest int
}

/**
 * Tally the most recent `windowSize` outcomes. Counts are integers; pcts are
 * rounded ints over `total` (0 when total === 0).
 */
export function tallyOutcomes(
  outcomes: OutcomeEntry[],
  windowSize: number = OUTCOMES_WINDOW,
): OutcomeTally {
  const slice = outcomes.slice(-Math.max(0, windowSize));
  const total = slice.length;
  let wonEasily = 0;
  let wonBarely = 0;
  let lost = 0;
  for (const o of slice) {
    if (o.outcome === "wonEasily") wonEasily++;
    else if (o.outcome === "wonBarely") wonBarely++;
    else if (o.outcome === "lost") lost++;
  }
  const pct = (n: number) => (total === 0 ? 0 : Math.round((n / total) * 100));
  return {
    total,
    wonEasily,
    wonBarely,
    lost,
    lostPct: pct(lost),
    wonEasilyPct: pct(wonEasily),
  };
}

export interface MarginSuggestion {
  suggestedMargin: number; // clamped/snapped via clampSafetyMargin
  text: string;
}

/**
 * Build the suggested personal margin (if any) given recent outcomes and the
 * user's current slider value.
 *
 * Rules:
 *  - Need at least OUTCOMES_MIN_FOR_SUGGESTION outcomes in the window.
 *  - If lostPct >= 20: suggest currentMargin + 0.10 (clamped to MAX).
 *  - Else if total >= 10, lost === 0, wonEasilyPct >= 70: suggest currentMargin - 0.05 (clamped to MIN).
 *  - Otherwise: null.
 *
 * If the suggestion equals the current margin (after clamping), returns null
 * — no point displaying "Suggested: 1.50x" when the user is already at MAX.
 */
export function generateMarginSuggestion(
  outcomes: OutcomeEntry[],
  currentMargin: number,
): MarginSuggestion | null {
  const tally = tallyOutcomes(outcomes, OUTCOMES_WINDOW);
  if (tally.total < OUTCOMES_MIN_FOR_SUGGESTION) return null;

  const current = clampSafetyMargin(currentMargin);
  const fmt = (m: number) => `${m.toFixed(2)}x`;

  if (tally.lostPct >= 20) {
    const target = clampSafetyMargin(current + 0.1);
    if (target <= current || target > SAFETY_MARGIN_MAX) return null;
    return {
      suggestedMargin: target,
      text: `Suggested: ${fmt(target)} — your last ${tally.total} fights at ${fmt(
        current,
      )} lost ${tally.lostPct}% of the time.`,
    };
  }

  if (tally.total >= 10 && tally.lost === 0 && tally.wonEasilyPct >= 70) {
    const target = clampSafetyMargin(current - 0.05);
    if (target >= current || target < SAFETY_MARGIN_MIN) return null;
    return {
      suggestedMargin: target,
      text: `Suggested: ${fmt(target)} — your last ${tally.total} fights at ${fmt(
        current,
      )} won easily ${tally.wonEasilyPct}% of the time.`,
    };
  }

  return null;
}

// Re-export so callers don't need a second import.
export { SAFETY_MARGIN_DEFAULT };
