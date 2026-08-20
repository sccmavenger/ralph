"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";

interface BriefingReward {
  itemName: string;
  itemId: string;
  icon: string;
  quantity: number;
}

interface FreeOffer {
  id: string;
  name: string;
  expiration: number | null;
  rewards: BriefingReward[];
}

interface MilestoneBracket {
  points: number;
  goal: number;
  completedTier: number;
  goalTier: number;
  claimableTiers: number[];
}

interface MilestoneTier {
  tier: number;
  rewards: BriefingReward[];
}

interface Milestone {
  id: string;
  name: string;
  brackets: MilestoneBracket[];
  tiers: MilestoneTier[];
}

interface BriefingSummary {
  freeOfferCount: number;
  claimableMilestoneCount: number;
  totalActionItems: number;
}

interface DailyBriefingData {
  freeOffers: FreeOffer[];
  milestones: Milestone[];
  summary: BriefingSummary;
  offersError?: string;
  milestonesError?: string;
}

function formatCountdown(expiration: number | null): string {
  if (!expiration) return "";
  const now = Math.floor(Date.now() / 1000);
  const diff = expiration - now;
  if (diff <= 0) return "Expired";
  const hours = Math.floor(diff / 3600);
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days}d ${hours % 24}h`;
  const mins = Math.floor((diff % 3600) / 60);
  return `${hours}h ${mins}m`;
}

interface PreviewItem {
  key: string;
  icon: string;
  name: string;
  quantity: number;
  type: "milestone" | "offer";
  countdown?: string;
}

function buildPreviewItems(data: DailyBriefingData): PreviewItem[] {
  const items: PreviewItem[] = [];

  // Claimable milestones first
  for (const m of data.milestones) {
    const claimable = m.brackets.some((b) => b.claimableTiers.length > 0);
    if (!claimable) continue;
    // Find the first claimable tier's reward
    const firstBracket = m.brackets.find((b) => b.claimableTiers.length > 0);
    const claimableTier = firstBracket?.claimableTiers[0];
    const tierData = claimableTier != null ? m.tiers.find((t) => t.tier === claimableTier) : undefined;
    const reward = tierData?.rewards[0];
    items.push({
      key: `m-${m.id}`,
      icon: reward?.icon ?? "",
      name: reward?.itemName ?? m.name,
      quantity: reward?.quantity ?? 0,
      type: "milestone",
    });
  }

  // Then soonest-expiring free offers
  const sortedOffers = [...data.freeOffers].sort((a, b) => (a.expiration ?? Infinity) - (b.expiration ?? Infinity));
  for (const offer of sortedOffers) {
    const reward = offer.rewards[0];
    items.push({
      key: `o-${offer.id}`,
      icon: reward?.icon ?? "",
      name: reward?.itemName ?? offer.name,
      quantity: reward?.quantity ?? 0,
      type: "offer",
      countdown: formatCountdown(offer.expiration),
    });
  }

  return items.slice(0, 3);
}

function SkeletonWidget() {
  return (
    <div
      className="animate-pulse rounded-xl border border-[var(--color-surface-light)] bg-[var(--color-surface)] p-4 space-y-3"
      data-testid="daily-briefing-widget-skeleton"
    >
      <div className="h-4 w-40 rounded bg-[var(--color-surface-light)]" />
      <div className="h-8 w-12 rounded bg-[var(--color-surface-light)]" />
      {[1, 2, 3].map((i) => (
        <div key={i} className="flex items-center gap-3">
          <div className="h-5 w-5 rounded bg-[var(--color-surface-light)]" />
          <div className="flex-1 space-y-1">
            <div className="h-3 w-28 rounded bg-[var(--color-surface-light)]" />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function DailyBriefingWidget() {
  const [data, setData] = useState<DailyBriefingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [previewItems, setPreviewItems] = useState<PreviewItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const fetchedRef = useRef(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/msf/daily-briefing", { cache: "no-store" });
      const json = (await res.json().catch(() => null)) as
        | DailyBriefingData
        | { error?: string }
        | null;
      if (!res.ok) {
        throw new Error(
          json && "error" in json && json.error
            ? json.error
            : "Daily briefing is temporarily unavailable.",
        );
      }
      if (!json || !("summary" in json) || !json.summary) {
        throw new Error("Daily briefing returned an invalid response.");
      }

      setData(json);
      setPreviewItems(buildPreviewItems(json));
      if (json.offersError || json.milestonesError) {
        setError("Some briefing sources are temporarily unavailable.");
      }
    } catch (reason) {
      setData(null);
      setPreviewItems([]);
      setError(
        reason instanceof Error
          ? reason.message
          : "Daily briefing is temporarily unavailable.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (fetchedRef.current) return;
      fetchedRef.current = true;
      void fetchData();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [fetchData]);

  // Live countdown timer
  useEffect(() => {
    if (!data) return;
    const interval = setInterval(() => {
      setPreviewItems(buildPreviewItems(data));
    }, 60_000);
    return () => clearInterval(interval);
  }, [data]);

  if (loading) return <SkeletonWidget />;

  if (!data) {
    return (
      <div
        role="status"
        className="rounded-xl border border-[var(--color-surface-light)] bg-[var(--color-surface)] p-4"
        data-testid="daily-briefing-widget"
      >
        <h3 className="text-sm font-bold text-[var(--color-foreground)]">
          📋 Daily Briefing
        </h3>
        <p
          className="mt-2 text-xs text-[var(--color-muted)]"
          data-testid="daily-briefing-widget-error"
        >
          {error || "Daily briefing is temporarily unavailable."}
        </p>
        <button
          type="button"
          onClick={fetchData}
          className="mt-3 text-xs font-semibold text-[var(--color-accent)]"
          data-testid="daily-briefing-widget-retry"
        >
          Try again
        </button>
      </div>
    );
  }

  const totalItems = data.summary.totalActionItems ?? 0;

  return (
    <div
      className="rounded-xl border border-[var(--color-surface-light)] bg-[var(--color-surface)] p-4"
      data-testid="daily-briefing-widget"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold text-[var(--color-foreground)]">
          📋 Daily Briefing
        </h3>
        <Link
          href="/dashboard/daily-briefing"
          className="text-xs font-semibold text-[var(--color-accent)]"
          data-testid="daily-briefing-widget-link"
        >
          View All →
        </Link>
      </div>

      {error && (
        <div
          className="mb-3"
          role="status"
          data-testid="daily-briefing-widget-warning"
        >
          <p className="text-xs text-amber-300">{error}</p>
          <button
            type="button"
            onClick={fetchData}
            className="mt-1 text-xs font-semibold text-[var(--color-accent)]"
          >
            Try again
          </button>
        </div>
      )}

      {/* Summary count */}
      {totalItems > 0 && (
        <p className="text-2xl font-bold text-[var(--color-accent)] mb-3">
          {totalItems}
          <span className="ml-2 text-xs font-normal text-[var(--color-muted)]">
            action item{totalItems !== 1 ? "s" : ""}
          </span>
        </p>
      )}

      {/* Preview items or empty state */}
      {totalItems === 0 && !error ? (
        <p className="text-sm text-[var(--color-muted)]">
          You&apos;re all caught up! ✅
        </p>
      ) : totalItems > 0 ? (
        <div className="space-y-2">
          {previewItems.map((item) => (
            <div key={item.key} className="flex items-center gap-2">
              <span className="flex-shrink-0 text-sm">
                {item.type === "milestone" ? "🏆" : "🎁"}
              </span>
              <span className="text-xs text-[var(--color-foreground)] truncate flex-1">
                {item.name}
                {item.quantity > 0 && (
                  <span className="text-[var(--color-muted)]"> ×{item.quantity}</span>
                )}
              </span>
              {item.type === "milestone" && (
                <span className="text-[10px] font-semibold text-green-400">⚡ Claim</span>
              )}
              {item.type === "offer" && item.countdown && (
                <span className="text-[10px] text-[var(--color-muted)]">{item.countdown}</span>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-[var(--color-muted)]">
          Action-item status will return when all briefing sources are available.
        </p>
      )}
    </div>
  );
}
