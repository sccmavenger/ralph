"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { CompactStars } from "@/app/components/StarDisplay";
import { CharPortrait } from "@/app/components/CharPortrait";

interface FarmingNode {
  campaignName: string;
  campaignId: string;
  chapter: number;
  tier: number;
  nodeLabel: string;
  energyCost: number;
  rewardType: "yellowStar" | "redStar";
}

interface FarmingTarget {
  characterId: string;
  characterName: string;
  portrait: string;
  currentYellowStars: number;
  currentRedStars: number;
  nodes: FarmingNode[];
  priorityTier: string;
  priorityReason: string;
  priorityScore: number;
}

const TIER_BADGES: Record<string, { label: string; className: string }> = {
  event: { label: "⚡ Event", className: "bg-purple-600 text-white" },
  "close-to-max": { label: "⭐ Close to Max", className: "bg-yellow-600 text-white" },
  "war-meta": { label: "⚔️ War Meta", className: "bg-blue-600 text-white" },
  farmable: { label: "🎯 Farmable", className: "bg-gray-600 text-white" },
};

function SkeletonWidget() {
  return (
    <div
      className="animate-pulse rounded-xl border border-[var(--color-surface-light)] bg-[var(--color-surface)] p-4 space-y-3"
      data-testid="farming-widget-skeleton"
    >
      <div className="h-4 w-40 rounded bg-[var(--color-surface-light)]" />
      {[1, 2, 3].map((i) => (
        <div key={i} className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-[var(--color-surface-light)]" />
          <div className="flex-1 space-y-1">
            <div className="h-3 w-28 rounded bg-[var(--color-surface-light)]" />
            <div className="h-2 w-20 rounded bg-[var(--color-surface-light)]" />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function FarmingTargetsWidget() {
  const [targets, setTargets] = useState<FarmingTarget[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;

    async function fetchData() {
      try {
        const res = await fetch("/api/msf/farming/targets");
        if (res.ok) {
          const data = await res.json();
          setTargets(data.targets ?? []);
          setTotalCount(data.totalCount ?? 0);
        }
      } catch {
        // fail silently
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, []);

  if (loading) return <SkeletonWidget />;

  if (targets.length === 0) {
    return (
      <div
        className="rounded-xl border border-[var(--color-surface-light)] bg-[var(--color-surface)] p-4"
        data-testid="farming-targets-widget"
      >
        <h3 className="text-sm font-bold text-[var(--color-foreground)] mb-3">
          Daily Farming Targets
        </h3>
        <p className="text-sm text-[var(--color-muted)]" data-testid="farming-widget-empty">
          All campaign characters maxed! 🎉
        </p>
      </div>
    );
  }

  const top5 = targets.slice(0, 5);

  return (
    <div
      className="rounded-xl border border-[var(--color-surface-light)] bg-[var(--color-surface)] p-4"
      data-testid="farming-targets-widget"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold text-[var(--color-foreground)]">
          Daily Farming Targets
          <span className="ml-2 text-[10px] font-normal text-[var(--color-muted)]">
            {totalCount} character{totalCount !== 1 ? "s" : ""} to farm
          </span>
        </h3>
        <Link
          href="/dashboard/farming"
          className="text-xs font-semibold text-[var(--color-accent)]"
          data-testid="farming-widget-link"
        >
          View All →
        </Link>
      </div>

      {/* Top 5 entries */}
      <div className="space-y-3">
        {top5.map((target) => {
          const badge = TIER_BADGES[target.priorityTier] ?? TIER_BADGES.farmable;
          const firstNode = target.nodes[0];

          return (
            <div
              key={target.characterId}
              className="flex items-center gap-3"
              data-testid="farming-widget-entry"
            >
              {/* Portrait */}
              <CharPortrait
                  src={target.portrait}
                  name={target.characterName}
                  imgClassName="h-10 w-10 rounded-full object-cover flex-shrink-0"
                  fallbackClassName="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--color-surface-light)] text-xs font-bold text-[var(--color-muted)] flex-shrink-0"
                />

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-xs font-semibold text-[var(--color-foreground)] truncate">
                    {target.characterName}
                  </span>
                  <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-semibold ${badge.className}`}>
                    {badge.label}
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <CompactStars yellowStars={target.currentYellowStars} redStars={target.currentRedStars} />
                </div>
                {firstNode && (
                  <p className="text-[10px] text-[var(--color-muted)] mt-0.5">
                    {firstNode.nodeLabel}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>


    </div>
  );
}
