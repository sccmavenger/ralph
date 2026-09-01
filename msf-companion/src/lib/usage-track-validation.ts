const MAX_TRACKED_PAGE_LENGTH = 512;
const TRACKING_ORIGIN = "https://usage.invalid";

/**
 * Accept only canonical, site-relative application pathnames. Query strings,
 * fragments, admin/API endpoints, traversal, and protocol-relative values are
 * deliberately excluded so telemetry cannot be used to store arbitrary URLs.
 */
export function parseTrackedPagePath(value: unknown): string | null {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > MAX_TRACKED_PAGE_LENGTH ||
    value.trim() !== value ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\") ||
    /[?#\u0000-\u001f\u007f]/.test(value)
  ) {
    return null;
  }

  let parsed: URL;
  try {
    parsed = new URL(value, TRACKING_ORIGIN);
  } catch {
    return null;
  }

  if (
    parsed.origin !== TRACKING_ORIGIN ||
    parsed.pathname !== value ||
    parsed.search ||
    parsed.hash
  ) {
    return null;
  }

  if (
    value === "/api" ||
    value.startsWith("/api/") ||
    value === "/admin" ||
    value.startsWith("/admin/")
  ) {
    return null;
  }

  return value;
}
