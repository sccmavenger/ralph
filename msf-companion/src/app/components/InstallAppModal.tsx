"use client";

import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import { isStandalone, getPlatform, isWebView } from "@/lib/install-detect";
import { useInstallPrompt } from "@/lib/use-install-prompt";

export default function InstallAppModal() {
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const { deferredPrompt, promptInstall } = useInstallPrompt();
  const modalRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  // Determine visibility on mount
  useEffect(() => {
    async function detect() {
      if (isStandalone() || isWebView()) {
        setVisible(false);
      } else {
        setVisible(true);
      }
    }
    detect();
  }, []);

  // Focus trap & keyboard handling
  useEffect(() => {
    if (!visible || dismissed) return;

    previousFocusRef.current = document.activeElement as HTMLElement;

    // Focus the modal on open
    const timer = setTimeout(() => {
      modalRef.current?.focus();
    }, 100);

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setDismissed(true);
        return;
      }

      if (e.key === "Tab" && modalRef.current) {
        const focusable = modalRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) return;

        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [visible, dismissed]);

  // Restore focus on dismiss
  useEffect(() => {
    if (dismissed && previousFocusRef.current) {
      previousFocusRef.current.focus();
    }
  }, [dismissed]);

  if (!visible || dismissed) return null;

  const platform = getPlatform();

  function handleDismiss() {
    setDismissed(true);
  }

  function handleBackdropClick(e: React.MouseEvent) {
    if (e.target === e.currentTarget) {
      setDismissed(true);
    }
  }

  return (
    <div
      className="fixed inset-x-0 top-14 bottom-0 z-40 flex items-end"
      onClick={handleBackdropClick}
      data-testid="install-app-backdrop"
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={handleBackdropClick} />

      {/* Bottom sheet */}
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-label="Install MSF Companion"
        tabIndex={-1}
        data-testid="install-app-modal"
        className="relative z-10 w-full animate-slide-up rounded-t-2xl bg-[var(--color-surface)] px-6 pb-24 pt-6"
        style={{ marginBottom: 0 }}
      >
        {/* Dismiss button */}
        <button
          onClick={handleDismiss}
          data-testid="install-dismiss"
          className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full text-[var(--color-muted)] transition-colors hover:bg-[var(--color-surface-light)] hover:text-[var(--color-foreground)]"
          aria-label="Close install prompt"
        >
          ✕
        </button>

        <div className="flex flex-col items-center text-center">
          {/* App icon */}
          <div
            className="mb-4 flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl bg-[var(--color-background)]"
            data-testid="install-app-icon"
          >
            <Image
              src="/icons/icon-192.svg"
              alt="MSF Companion"
              width={48}
              height={48}
            />
          </div>

          <h2 className="mb-2 text-lg font-bold text-[var(--color-foreground)]">
            Install MSF Companion
          </h2>

          {/* Platform-specific instructions */}
          <div data-testid="install-instructions" className="mb-4 text-sm text-[var(--color-muted)]">
            {platform === "ios" && (
              <p>
                Tap the <strong>Share</strong> button{" "}
                <span className="inline-block text-base" aria-hidden="true">□↑</span>{" "}
                then tap <strong>&quot;Add to Home Screen&quot;</strong>
              </p>
            )}
            {platform === "android" && !deferredPrompt && (
              <p>
                Tap the <strong>menu</strong>{" "}
                <span className="inline-block text-base" aria-hidden="true">⋮</span>{" "}
                then tap <strong>&quot;Add to Home Screen&quot;</strong> or <strong>&quot;Install app&quot;</strong>
              </p>
            )}
            {platform === "android" && deferredPrompt && (
              <p>
                Install MSF Companion for the best experience — quick access from your home screen.
              </p>
            )}
            {platform === "unknown" && (
              <p>
                Add MSF Companion to your home screen for the best experience.
              </p>
            )}
          </div>

          {/* Native install button for Android with beforeinstallprompt */}
          {platform === "android" && deferredPrompt && (
            <button
              onClick={promptInstall}
              data-testid="install-action-btn"
              className="w-full rounded-lg bg-[var(--color-accent)] px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-blue-600 active:bg-blue-700"
            >
              Install
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
