"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import Link from "next/link";
import { CompactStars } from "@/app/components/StarDisplay";import { CharPortrait } from "@/app/components/CharPortrait";
/* ── Types ─────────────────────────────────────────────────────── */

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

/* ── Constants ─────────────────────────────────────────────────── */

const TIER_BADGES: Record<string, { label: string; className: string }> = {
  event: { label: "⚡ Event", className: "bg-purple-600 text-white" },
  "close-to-max": { label: "⭐ Close to Max", className: "bg-yellow-600 text-white" },
  "war-meta": { label: "⚔️ War Meta", className: "bg-blue-600 text-white" },
  farmable: { label: "🎯 Farmable", className: "bg-gray-600 text-white" },
};

type FilterKey = "all" | "needYellow" | "needRed" | "event";

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "needYellow", label: "Need Yellow Stars" },
  { key: "needRed", label: "Need Red Stars" },
  { key: "event", label: "Event Priority" },
];

interface PrioritySection {
  key: string;
  title: string;
  tiers: string[];
}

const PRIORITY_SECTIONS: PrioritySection[] = [
  { key: "event", title: "Event Priority", tiers: ["event"] },
  { key: "close-to-max", title: "Close to Max", tiers: ["close-to-max"] },
  { key: "all-farmable", title: "All Farmable", tiers: ["war-meta", "farmable"] },
];

/* ── Skeleton ──────────────────────────────────────────────────── */

function SkeletonPage() {
  return (
    <div className="px-4 py-4 space-y-4" data-testid="farming-page-skeleton">
      <div className="h-4 w-24 rounded bg-[var(--color-surface-light)] animate-pulse" />
      <div className="h-6 w-56 rounded bg-[var(--color-surface-light)] animate-pulse" />
      <div className="flex gap-2">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-8 w-28 rounded-full bg-[var(--color-surface-light)] animate-pulse" />
        ))}
      </div>
      <div className="h-4 w-64 rounded bg-[var(--color-surface-light)] animate-pulse" />
      {[1, 2, 3, 4, 5, 6].map((i) => (
        <div key={i} className="animate-pulse rounded-xl bg-[var(--color-surface)] p-4 flex items-center gap-3">
          <div className="h-12 w-12 rounded-full bg-[var(--color-surface-light)]" />
          <div className="flex-1 space-y-2">
            <div className="h-3 w-32 rounded bg-[var(--color-surface-light)]" />
            <div className="h-2 w-48 rounded bg-[var(--color-surface-light)]" />
            <div className="h-2 w-24 rounded bg-[var(--color-surface-light)]" />
          </div>
        </div>
      ))}
    </div>
  );
}

/* ── Character Card ────────────────────────────────────────────── */

function CharacterCard({ target }: { target: FarmingTarget }) {
  const badge = TIER_BADGES[target.priorityTier] ?? TIER_BADGES.farmable;

  return (
    <div
      className="rounded-xl border border-[var(--color-surface-light)] bg-[var(--color-surface)] p-4"
      data-testid="farming-target-card"
    >
      <div className="flex items-start gap-3">
        {/* Portrait */}
        <CharPortrait
          src={target.portrait}
          name={target.characterName}
          imgClassName="h-12 w-12 rounded-full object-cover flex-shrink-0"
          fallbackClassName="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-surface-light)] text-sm font-bold text-[var(--color-muted)] flex-shrink-0"
        />

        {/* Info */}
        <div className="flex-1 min-w-0">
          {/* Name + Badge */}
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <span className="text-sm font-semibold text-[var(--color-foreground)] truncate">
              {target.characterName}
            </span>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap ${badge.className}`}>
              {badge.label}
            </span>
          </div>

          {/* Stars */}
          <div className="flex items-center gap-3 mb-2">
            <CompactStars yellowStars={target.currentYellowStars} redStars={target.currentRedStars} />
          </div>

          {/* Reason */}
          <p className="text-[11px] text-[var(--color-muted)] mb-2">{target.priorityReason}</p>

          {/* Nodes */}
          <div className="space-y-1">
            {target.nodes.map((node, idx) => (
              <div
                key={`${node.campaignId}-${node.chapter}-${node.tier}-${idx}`}
                className="flex flex-wrap items-center gap-1.5 text-[11px] text-[var(--color-foreground)]"
              >
                <span>{node.rewardType === "redStar" ? "🔴" : "🟡"}</span>
                <span className="font-medium">{node.nodeLabel}</span>
                {node.energyCost > 0 && (
                  <>
                    <span className="text-[var(--color-muted)]">·</span>
                    <span className="text-[var(--color-muted)]">{node.energyCost} energy</span>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Main Component ────────────────────────────────────────────── */

export default function FarmingFullPageClient() {
  const [targets, setTargets] = useState<FarmingTarget[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<FilterKey>("all");
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

  /* Apply filter */
  const filteredTargets = useMemo(() => {
    switch (activeFilter) {
      case "needYellow":
        return targets.filter((t) => t.currentYellowStars < 7);
      case "needRed":
        return targets.filter((t) => t.currentRedStars < 7);
      case "event":
        return targets.filter((t) => t.priorityTier === "event");
      default:
        return targets;
    }
  }, [targets, activeFilter]);

  /* Count total nodes across filtered targets */
  const totalNodeCount = useMemo(
    () => filteredTargets.reduce((sum, t) => sum + t.nodes.length, 0),
    [filteredTargets],
  );

  /* Group into priority sections */
  const sections = useMemo(() => {
    return PRIORITY_SECTIONS.map((section) => ({
      ...section,
      targets: filteredTargets.filter((t) => section.tiers.includes(t.priorityTier)),
    })).filter((s) => s.targets.length > 0);
  }, [filteredTargets]);

  if (loading) return <SkeletonPage />;

  return (
    <div className="px-4 py-4 max-w-3xl mx-auto">
      {/* Back link */}
      <Link
        href="/dashboard"
        className="mb-3 inline-block text-xs text-[var(--color-accent)] hover:underline"
        data-testid="farming-back-link"
      >
        ← Back to Dashboard
      </Link>

      {/* Title */}
      <h1
        className="text-xl font-bold text-[var(--color-foreground)] mb-4"
        data-testid="farming-page-title"
      >
        Daily Farming Targets
      </h1>

      {/* Filter chips */}
      <div className="flex flex-wrap gap-2 mb-3" data-testid="farming-filter-bar">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setActiveFilter(f.key)}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
              activeFilter === f.key
                ? "bg-[var(--color-accent)] text-white"
                : "bg-[var(--color-surface)] text-[var(--color-muted)] border border-[var(--color-surface-light)] hover:border-[var(--color-accent)]"
            }`}
            data-testid={`farming-filter-${f.key}`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Count */}
      <p className="text-xs text-[var(--color-muted)] mb-4" data-testid="farming-count">
        {filteredTargets.length} character{filteredTargets.length !== 1 ? "s" : ""} across{" "}
        {totalNodeCount} campaign node{totalNodeCount !== 1 ? "s" : ""}
      </p>

      {/* Sections */}
      {sections.length === 0 ? (
        <p className="text-sm text-[var(--color-muted)]" data-testid="farming-empty">
          No characters match the current filter.
        </p>
      ) : (
        <div className="space-y-6">
          {sections.map((section) => (
            <div key={section.key}>
              <h2 className="text-sm font-bold text-[var(--color-foreground)] mb-3">
                {section.title}
                <span className="ml-2 text-[var(--color-muted)] font-normal">
                  ({section.targets.length})
                </span>
              </h2>
              <div className="grid gap-3 grid-cols-1">
                {section.targets.map((target) => (
                  <CharacterCard key={target.characterId} target={target} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
