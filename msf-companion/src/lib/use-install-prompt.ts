"use client";

import { useEffect, useRef, useCallback, useState } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/**
 * Hook that captures the `beforeinstallprompt` event (Chrome/Samsung Internet)
 * so the install modal can trigger the native install dialog on Android.
 */
export function useInstallPrompt() {
  const deferredRef = useRef<BeforeInstallPromptEvent | null>(null);
  const [hasPrompt, setHasPrompt] = useState(false);

  useEffect(() => {
    function handler(e: Event) {
      e.preventDefault();
      deferredRef.current = e as BeforeInstallPromptEvent;
      setHasPrompt(true);
    }
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const promptInstall = useCallback(async () => {
    if (!deferredRef.current) return;
    await deferredRef.current.prompt();
    deferredRef.current = null;
    setHasPrompt(false);
  }, []);

  return {
    deferredPrompt: hasPrompt,
    promptInstall,
  };
}
