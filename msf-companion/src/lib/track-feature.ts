"use client";

/**
 * Client-side feature usage tracking.
 * Posts to /api/usage-track which records the event server-side.
 * Fire-and-forget — never blocks UI.
 */
export function trackFeature(featureName: string, metadata?: Record<string, unknown>): void {
  try {
    const body = JSON.stringify({ feature: featureName, metadata });
    // Use sendBeacon for fire-and-forget (works even on page unload)
    if (navigator.sendBeacon) {
      navigator.sendBeacon("/api/usage-track", new Blob([body], { type: "application/json" }));
    } else {
      fetch("/api/usage-track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        keepalive: true,
      }).catch(() => {});
    }
  } catch {
    // Never throw from tracking
  }
}
