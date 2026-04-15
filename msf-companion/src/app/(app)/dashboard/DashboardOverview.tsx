"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import PlannerSummary from "@/app/components/PlannerSummary";
import DailyTipWidget from "@/app/components/DailyTipWidget";
import FarmingTargetsWidget from "@/app/components/FarmingTargetsWidget";
import WarMetaWidget from "@/app/components/WarMetaWidget";
import CrucibleMetaWidget from "@/app/components/CrucibleMetaWidget";
import OffersWidget from "@/app/components/OffersWidget";
import DailyBriefingWidget from "@/app/components/DailyBriefingWidget";
import { CharPortrait } from "@/app/components/CharPortrait";

const ORIGINS = ["COSMIC", "BIO", "MYSTIC", "TECH", "MUTANT", "SKILL"] as const;

const ORIGIN_COLORS: Record<string, string> = {
  COSMIC: "#9333ea",
  BIO: "#22c55e",
  MYSTIC: "#6366f1",
  TECH: "#06b6d4",
  MUTANT: "#eab308",
  SKILL: "#ef4444",
};

interface RosterChar {
  id: string;
  power?: number;
  yellowStars?: number;
  activeYellow?: number;
  redStars?: number;
  activeRed?: number;
  traits?: string[];
}

interface GameChar {
  id: string;
  name?: string;
  status?: string;
}

function formatStat(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return n.toString();
}

function StatBox({
  value,
  label,
  valueColor,
}: {
  value: string;
  label: string;
  valueColor?: string;
}) {
  return (
    <div className="flex flex-1 flex-col items-center rounded-xl border border-[var(--color-surface-light)] bg-[var(--color-surface)] py-3">
      <span
        className="text-lg font-bold"
        style={{ color: valueColor ?? "var(--color-foreground)" }}
      >
        {value}
      </span>
      <span className="text-[10px] text-[var(--color-muted)]">{label}</span>
    </div>
  );
}

function NavCard({
  icon,
  title,
  description,
  href,
}: {
  icon: string;
  title: string;
  description: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-start gap-3 rounded-xl bg-[var(--color-surface)] p-4 transition-colors active:bg-[var(--color-surface-light)]"
    >
      <span className="text-2xl">{icon}</span>
      <div>
        <h3 className="text-sm font-bold text-[var(--color-foreground)]">
          {title}
        </h3>
        <p className="text-xs text-[var(--color-muted)]">{description}</p>
      </div>
    </Link>
  );
}

function StarDistribution({ characters }: { characters: RosterChar[] }) {
  const starCounts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0 };
  for (const c of characters) {
    const stars = c.yellowStars ?? c.activeYellow ?? 0;
    if (stars >= 1 && stars <= 7) starCounts[stars]++;
  }
  const total = characters.length || 1;

  const STAR_COLORS: Record<number, string> = {
    1: "#ef4444", 2: "#f97316", 3: "#eab308", 4: "#22c55e",
    5: "#3b82f6", 6: "#8b5cf6", 7: "#ec4899",
  };

  return (
    <div className="rounded-xl bg-[var(--color-surface)] p-4">
      <h3 className="mb-3 text-sm font-bold text-[var(--color-foreground)]">
        Star Level Distribution
      </h3>
      <div className="flex justify-between gap-1">
        {[1, 2, 3, 4, 5, 6, 7].map((star) => {
          const count = starCounts[star];
          const pct = Math.round((count / total) * 100);
          return (
            <div key={star} className="flex flex-col items-center gap-1">
              <span className="text-[10px] text-[var(--color-muted)]">
                {star}<span style={{ color: STAR_COLORS[star] }}>★</span>
              </span>
              <span className="text-sm font-bold text-[var(--color-foreground)]">{count}</span>
              <span className="text-[10px] text-[var(--color-muted)]">{pct}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function OriginBreakdown({ characters }: { characters: RosterChar[] }) {
  const counts: Record<string, number> = {};
  for (const o of ORIGINS) counts[o] = 0;
  for (const c of characters) {
    for (const t of c.traits ?? []) {
      const upper = t.toUpperCase();
      if (upper in counts) counts[upper]++;
    }
  }

  return (
    <div className="rounded-xl bg-[var(--color-surface)] p-4">
      <h3 className="mb-3 text-sm font-bold text-[var(--color-foreground)]">
        Origin Breakdown
      </h3>
      <div className="flex flex-wrap gap-2">
        {ORIGINS.map((origin) => (
          <span
            key={origin}
            className="rounded-full px-3 py-1 text-xs font-semibold text-white"
            style={{ backgroundColor: ORIGIN_COLORS[origin] }}
          >
            {origin} <span className="font-bold">{counts[origin]}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

export default function DashboardOverview({
  displayName,
  portrait,
  offersEnabled = false,
}: {
  displayName: string;
  portrait?: string | null;
  offersEnabled?: boolean;
}) {
  const [rosterChars, setRosterChars] = useState<RosterChar[]>([]);
  const [playableCount, setPlayableCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const fetchedRef = useRef(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [rosterRes, gameRes] = await Promise.all([
        fetch("/api/msf/roster"),
        fetch("/api/msf/characters"),
      ]);

      if (rosterRes.ok) {
        const rosterData = (await rosterRes.json()) as { data?: RosterChar[] };
        setRosterChars(
          (rosterData.data ?? []).sort((a, b) => (b.power ?? 0) - (a.power ?? 0))
        );
      }

      if (gameRes.ok) {
        const gameData = (await gameRes.json()) as { data?: GameChar[] };
        const playable = (gameData.data ?? []).filter(
          (c) => c.status === "playable"
        );
        setPlayableCount(playable.length);
      }
    } catch {
      // Non-critical — dashboard still renders
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!fetchedRef.current) {
      fetchedRef.current = true;
      fetchData();
    }
  }, [fetchData]);

  const tcp = rosterChars.reduce((sum, c) => sum + (c.power ?? 0), 0);
  const ownedCount = rosterChars.length;
  const avgPower = ownedCount > 0 ? Math.round(tcp / ownedCount) : 0;
  const completion = playableCount > 0 ? Math.round((ownedCount / playableCount) * 100) : 0;
  const sevenStarCount = rosterChars.filter(
    (c) => (c.yellowStars ?? c.activeYellow ?? 0) >= 7
  ).length;

  if (loading) {
    return (
      <div className="space-y-4 px-4 py-4">
        <div className="h-16 animate-pulse rounded-xl bg-[var(--color-surface)]" />
        <div className="grid grid-cols-2 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-20 animate-pulse rounded-xl bg-[var(--color-surface)]" />
          ))}
        </div>
        <div className="h-24 animate-pulse rounded-xl bg-[var(--color-surface)]" />
        <div className="h-24 animate-pulse rounded-xl bg-[var(--color-surface)]" />
      </div>
    );
  }

  return (
    <div className="space-y-4 px-4 py-4">
      {/* Welcome header */}
      <div className="flex items-center gap-3 rounded-xl bg-[var(--color-surface)] p-4">
        <CharPortrait
          src={portrait}
          name={displayName}
          imgClassName="h-12 w-12 rounded-full object-cover"
          fallbackClassName="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-yellow-500 to-red-500 text-lg font-bold text-white"
        />
        <div className="flex-1">
          <h2 className="text-base font-bold text-[var(--color-foreground)]">
            Welcome back, {displayName}
          </h2>
          <p className="text-xs text-[var(--color-muted)]">
            Your MSF Companion dashboard
          </p>
        </div>
      </div>

      {/* AI Tip of the Day */}
      <DailyTipWidget />

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-3">
        <StatBox value={formatStat(tcp)} label="TCP" valueColor="#22c55e" />
        <StatBox
          value={`${ownedCount} / ${playableCount || "?"}`}
          label="Roster"
          valueColor="#3b82f6"
        />
        <StatBox
          value={formatStat(avgPower)}
          label="Avg Power"
          valueColor="#f59e0b"
        />
        <StatBox
          value={`${completion}%`}
          label="Completion"
          valueColor="#22c55e"
        />
      </div>

      {/* Star Distribution */}
      <StarDistribution characters={rosterChars} />

      {/* Origin Breakdown */}
      <OriginBreakdown characters={rosterChars} />

      {/* Daily Briefing Widget */}
      <DailyBriefingWidget />

      {/* Farming Targets Widget */}
      <FarmingTargetsWidget />

      {/* War Meta Widget */}
      <WarMetaWidget />

      {/* Crucible Meta Widget */}
      <CrucibleMetaWidget />

      {/* Offers Widget — behind feature flag */}
      {offersEnabled && <OffersWidget />}

      {/* Planner Summary Widget */}
      <PlannerSummary />

      {/* Navigation cards */}
      <div className="space-y-3">
        <NavCard
          icon="📊"
          title="My Roster"
          description="Browse your unlocked characters with power stats, filters, and detailed breakdowns."
          href="/roster"
        />
        <NavCard
          icon="🦸"
          title="Character Database"
          description={`Explore all ${playableCount || ""} playable characters with portraits, traits, and abilities.`}
          href="/heroes"
        />
        <NavCard
          icon="⚔️"
          title="Team Builder"
          description="Build optimized teams with synergy insights and save your favorites."
          href="/teams"
        />
        <NavCard
          icon="📈"
          title="Fight Analyzer"
          description="Analyze game modes, enemy compositions, and find recommended teams."
          href="/analyze"
        />
        <NavCard
          icon="⚙️"
          title="Commander Profile"
          description="Manage your email, view snapshots, and account settings."
          href="/profile"
        />
      </div>
    </div>
  );
}
