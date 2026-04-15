"use client";

import { useState, useEffect } from "react";

export default function PushNotificationPrompt() {
  const [showPrompt, setShowPrompt] = useState(false);

  useEffect(() => {
    // Only show on secure contexts with notification support
    if (!("Notification" in window) || !("serviceWorker" in navigator)) return;

    // Don't show if already granted or denied
    if (Notification.permission !== "default") return;

    // Don't show if already dismissed this session
    const dismissed = sessionStorage.getItem("push-prompt-dismissed");
    if (dismissed) return;

    // Show after a short delay
    const timer = setTimeout(() => setShowPrompt(true), 3000);
    return () => clearTimeout(timer);
  }, []);

  const handleAllow = async () => {
    setShowPrompt(false);
    try {
      const permission = await Notification.requestPermission();
      if (permission === "granted") {
        const registration = await navigator.serviceWorker.ready;
        const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
        if (!vapidPublicKey) return;

        const subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: vapidPublicKey,
        });

        const subJson = subscription.toJSON();
        await fetch("/api/push-subscription", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            endpoint: subJson.endpoint,
            keys: subJson.keys,
          }),
        });
      }
    } catch {
      // Non-blocking
    }
  };

  const handleDismiss = () => {
    setShowPrompt(false);
    sessionStorage.setItem("push-prompt-dismissed", "true");
  };

  if (!showPrompt) return null;

  return (
    <div
      className="fixed top-16 left-4 right-4 z-50 rounded-xl border border-[var(--color-surface-light)] bg-[var(--color-surface)] p-4 shadow-lg"
      data-testid="push-notification-prompt"
    >
      <div className="flex items-start gap-3">
        <span className="text-2xl">🔔</span>
        <div className="flex-1">
          <p className="text-sm font-medium text-[var(--color-foreground)]">
            Get notified about events & meta shifts
          </p>
          <p className="text-xs text-[var(--color-muted)] mt-0.5">
            Stay ahead with real-time alerts about new events and team recommendations.
          </p>
        </div>
      </div>
      <div className="flex gap-2 mt-3 justify-end">
        <button
          onClick={handleDismiss}
          className="rounded-full px-4 py-1.5 text-xs text-[var(--color-muted)] hover:text-[var(--color-foreground)] transition-colors"
          data-testid="push-not-now"
        >
          Not now
        </button>
        <button
          onClick={handleAllow}
          className="rounded-full bg-[var(--color-accent)] px-4 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-80"
          data-testid="push-allow"
        >
          Enable notifications
        </button>
      </div>
    </div>
  );
}
