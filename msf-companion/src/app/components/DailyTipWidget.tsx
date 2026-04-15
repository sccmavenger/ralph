"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

interface Tip {
  id: string;
  content: string;
  sourceCreatorName: string | null;
  sourceUrl: string | null;
  generatedAt: string;
}

export default function DailyTipWidget() {
  const [tip, setTip] = useState<Tip | null>(null);
  const [dismissed, setDismissed] = useState(false);

  const loadTip = useCallback(async () => {
    try {
      const res = await fetch("/api/advisor/daily-tip");
      if (res.ok) {
        const data = (await res.json()) as { tip: Tip | null };
        setTip(data.tip);
      }
    } catch {
      // Non-blocking
    }
  }, []);

  useEffect(() => {
    loadTip();
  }, [loadTip]);

  const handleDismiss = async () => {
    if (!tip) return;
    setDismissed(true);
    try {
      await fetch("/api/advisor/daily-tip", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipId: tip.id }),
      });
    } catch {
      // Non-blocking
    }
  };

  if (!tip || dismissed) return null;

  return (
    <div
      className="rounded-xl border border-[var(--color-surface-light)] bg-[var(--color-surface)] p-4"
      data-testid="daily-tip-widget"
    >
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-[var(--color-foreground)] flex items-center gap-1.5">
          <span className="text-yellow-400">💡</span>
          AI Tip of the Day
        </h3>
        <button
          onClick={handleDismiss}
          className="text-xs text-[var(--color-muted)] hover:text-[var(--color-foreground)] transition-colors"
          data-testid="dismiss-tip"
        >
          Dismiss
        </button>
      </div>

      <p className="text-sm text-[var(--color-foreground)] leading-relaxed mb-3">
        {tip.content}
      </p>

      {tip.sourceCreatorName && (
        <p className="text-xs text-[var(--color-muted)] mb-3">
          — {tip.sourceCreatorName}
        </p>
      )}

      <Link
        href="/advisor"
        className="inline-block rounded-full bg-[var(--color-accent)] px-4 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-80"
        data-testid="ask-ai-cta"
      >
        Ask AI Advisor →
      </Link>
    </div>
  );
}
