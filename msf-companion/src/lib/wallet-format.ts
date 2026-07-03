/**
 * Display/parse helpers for the wallet input sheet (US-003).
 *
 * The sheet shows thousands-formatted values (e.g. `1,840,000`) while the API
 * only ever receives raw non-negative integers. These pure helpers keep the
 * formatting/validation logic testable independently of React.
 */

/** Strips everything except ASCII digits. Negatives, decimals, letters and
 * separators are all discarded — so `-100`, `12.3.4` and `abc` can never
 * produce a negative or non-integer value. */
export function digitsOnly(raw: string): string {
  return (raw ?? "").replace(/\D+/g, "");
}

/**
 * Formats raw user input for display with thousands separators. Leading zeros
 * are trimmed so `007` shows as `7`; empty/zero-length input shows as an empty
 * string. Never returns commas around a partial/invalid number.
 */
export function formatWalletNumber(raw: string): string {
  const digits = digitsOnly(raw).replace(/^0+(?=\d)/, "");
  if (digits === "") return "";
  return Number(digits).toLocaleString("en-US");
}

/**
 * Parses display/user input into the raw integer sent to the API, or `null`
 * when there is no valid non-negative integer (empty input). Because
 * {@link digitsOnly} discards signs and decimals, the result is always a
 * non-negative safe-ish integer.
 */
export function parseWalletNumber(raw: string): number | null {
  const digits = digitsOnly(raw);
  if (digits === "") return null;
  const value = Number(digits);
  if (!Number.isSafeInteger(value)) return null;
  return value;
}

/** True when the field currently holds a valid non-negative integer that is
 * safe to send to the API. Empty input is invalid (Save is blocked). */
export function isValidWalletValue(raw: string): boolean {
  return parseWalletNumber(raw) !== null;
}

/**
 * Compact display used by the wallet strip (US-004). Large balances are
 * abbreviated to match the approved mockup — Gold `1,840,000` shows as `1.84M`
 * while smaller values (e.g. Cores `6,120`) keep full thousands separators.
 * Values `< 1,000,000` are never abbreviated. Trailing zeros in the decimal
 * part are trimmed (`2,000,000` -> `2M`, `1,500,000` -> `1.5M`).
 */
export function formatWalletCompact(value: number): string {
  if (!Number.isFinite(value) || value < 0) return "0";
  const abbreviate = (n: number, suffix: string): string => {
    const rounded = Math.round(n * 100) / 100;
    // Trim trailing zeros: 1.84 -> "1.84", 2.00 -> "2", 1.50 -> "1.5".
    return `${parseFloat(rounded.toFixed(2))}${suffix}`;
  };
  if (value >= 1_000_000_000) return abbreviate(value / 1_000_000_000, "B");
  if (value >= 1_000_000) return abbreviate(value / 1_000_000, "M");
  return Math.round(value).toLocaleString("en-US");
}

/**
 * Relative-age label for the wallet strip, derived from `confirmedAt`
 * (US-004 / TC-004.2). Returns `confirmed today`, `confirmed 1d ago`,
 * `confirmed 2d ago`, … Returns an empty string when there is no timestamp.
 */
export function formatConfirmedAgo(
  confirmedAt: string | Date | null | undefined,
  now: Date = new Date(),
): string {
  if (!confirmedAt) return "";
  const then = confirmedAt instanceof Date ? confirmedAt : new Date(confirmedAt);
  const time = then.getTime();
  if (Number.isNaN(time)) return "";
  const days = Math.floor((now.getTime() - time) / 86_400_000);
  if (days <= 0) return "confirmed today";
  if (days === 1) return "confirmed 1d ago";
  return `confirmed ${days}d ago`;
}

/** Default staleness threshold (US-011): a wallet confirmed more than this many
 * days ago is considered "stale" and gets a gentle re-confirm nudge. */
export const WALLET_STALE_DAYS = 7;

/**
 * True when a wallet's `confirmedAt` is OLDER than the staleness threshold
 * (US-011 / TC-011.1..2). Used to decide whether the wallet strip shows the
 * subtle "confirm your gold?" nudge.
 *
 * - Absent/invalid `confirmedAt` -> NOT stale (nothing to re-confirm yet; the
 *   first-run "Add your wallet" prompt covers that case instead).
 * - Boundary is strict: exactly `thresholdDays` old is NOT yet stale; the nudge
 *   appears only once the age exceeds the threshold.
 */
export function isWalletStale(
  confirmedAt: string | Date | null | undefined,
  now: Date = new Date(),
  thresholdDays: number = WALLET_STALE_DAYS,
): boolean {
  if (!confirmedAt) return false;
  const then = confirmedAt instanceof Date ? confirmedAt : new Date(confirmedAt);
  const time = then.getTime();
  if (Number.isNaN(time)) return false;
  const days = (now.getTime() - time) / 86_400_000;
  return days > thresholdDays;
}
