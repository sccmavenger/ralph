/**
 * Install detection utilities for PWA install prompt.
 * Detects standalone mode, platform, and in-app browser WebViews.
 */

/** Returns true when the app is running as an installed PWA (standalone mode). */
export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;

  // iOS Safari proprietary property
  if ("standalone" in window.navigator && (navigator as unknown as { standalone: boolean }).standalone === true) {
    return true;
  }

  // W3C display-mode: standalone media query
  if (window.matchMedia("(display-mode: standalone)").matches) {
    return true;
  }

  return false;
}

/** Detects the user's mobile platform. */
export function getPlatform(): "ios" | "android" | "unknown" {
  if (typeof navigator === "undefined") return "unknown";

  const ua = navigator.userAgent;

  // iPadOS 13+ reports as MacIntel with touch points
  if (
    navigator.platform === "MacIntel" &&
    navigator.maxTouchPoints > 1
  ) {
    return "ios";
  }

  // iOS (iPhone, iPad, iPod)
  if (/iPhone|iPad|iPod/.test(ua)) {
    return "ios";
  }

  // Android (including Samsung Internet)
  if (/Android/i.test(ua)) {
    return "android";
  }

  return "unknown";
}

/** Returns true when running inside an in-app browser WebView (Facebook, Instagram, Twitter, LinkedIn). */
export function isWebView(): boolean {
  if (typeof navigator === "undefined") return false;

  const ua = navigator.userAgent;
  return /FBAN|FBAV|Instagram|Twitter|LinkedInApp/i.test(ua);
}
