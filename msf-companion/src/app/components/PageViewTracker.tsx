"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

function sendPageView(pathname: string): void {
  try {
    const body = JSON.stringify({ page: pathname });
    if (navigator.sendBeacon) {
      const queued = navigator.sendBeacon(
        "/api/usage-track",
        new Blob([body], { type: "application/json" }),
      );
      if (queued) return;
    }

    fetch("/api/usage-track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => {});
  } catch {
    // Telemetry must never interrupt navigation.
  }
}

/** Records both the initial authenticated page and subsequent client routes. */
export default function PageViewTracker() {
  const pathname = usePathname();
  const lastTrackedPath = useRef<string | null>(null);

  useEffect(() => {
    if (!pathname || lastTrackedPath.current === pathname) return;
    lastTrackedPath.current = pathname;
    sendPageView(pathname);
  }, [pathname]);

  return null;
}
