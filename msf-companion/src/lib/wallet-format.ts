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
