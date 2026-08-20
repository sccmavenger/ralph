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
import TowerEventWidget from "@/app/components/TowerEventWidget";
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

type LoadStatus = "loading" | "ready" | "error";

interface ApiEnvelope<T> {
  data?: T;
  error?: string;
}

async function fetchDashboardResource<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: "no-store" });
  const body = (await response.json().catch(() => null)) as ApiEnvelope<T> | null;

  if (!response.ok) {
    throw new Error(body?.error || "The MSF service did not return data.");
  }

  if (!body || !Array.isArray(body.data)) {
    throw new Error("The MSF service returned an invalid response.");
  }

  return body.data;
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
    <div
      className="flex flex-1 flex-col items-center rounded-xl border border-[var(--color-surface-light)] bg-[var(--color-surface)] py-3"
      data-testid={`dashboard-stat-${label.toLowerCase().replace(/\s+/g, "-")}`}
    >
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
      data-testid={`dashboard-nav-${title.toLowerCase().replace(/\s+/g, "-")}`}
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
  const [rosterStatus, setRosterStatus] = useState<LoadStatus>("loading");
  const [catalogStatus, setCatalogStatus] = useState<LoadStatus>("loading");
  const [rosterError, setRosterError] = useState<string | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const fetchedRef = useRef(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setRosterStatus("loading");
    setCatalogStatus("loading");
    setRosterError(null);
    setCatalogError(null);

    const [rosterResult, catalogResult] = await Promise.allSettled([
      fetchDashboardResource<RosterChar[]>("/api/msf/roster"),
      fetchDashboardResource<GameChar[]>("/api/msf/characters"),
    ]);

    if (rosterResult.status === "fulfilled") {
      setRosterChars(
        [...rosterResult.value].sort((a, b) => (b.power ?? 0) - (a.power ?? 0)),
      );
      setRosterStatus("ready");
    } else {
      setRosterChars([]);
      setRosterStatus("error");
      setRosterError(rosterResult.reason instanceof Error ? rosterResult.reason.message : "Roster data is unavailable.");
    }

    if (catalogResult.status === "fulfilled") {
      const playable = catalogResult.value.filter(
        (character) => character.status?.toLowerCase() === "playable",
      );
      setPlayableCount(playable.length);
      setCatalogStatus("ready");
    } else {
      setPlayableCount(0);
      setCatalogStatus("error");
      setCatalogError(catalogResult.reason instanceof Error ? catalogResult.reason.message : "Character catalog data is unavailable.");
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (fetchedRef.current) return;
      fetchedRef.current = true;
      void fetchData();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [fetchData]);

  const tcp = rosterChars.reduce((sum, c) => sum + (c.power ?? 0), 0);
  const ownedCount = rosterChars.length;
  const avgPower = ownedCount > 0 ? Math.round(tcp / ownedCount) : 0;
  const completion = rosterStatus === "ready" && catalogStatus === "ready" && playableCount > 0
    ? Math.min(100, Math.round((ownedCount / playableCount) * 100))
    : null;

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
          <h1 className="text-base font-bold text-[var(--color-foreground)]">
            Welcome back, {displayName}
          </h1>
          <p className="text-xs text-[var(--color-muted)]">
            Your MSF Companion dashboard
          </p>
        </div>
      </div>

      {/* AI Tip of the Day */}
      <DailyTipWidget />

      {(rosterStatus === "error" || catalogStatus === "error") && (
        <div
          role="alert"
          className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4"
          data-testid="dashboard-data-error"
        >
          <p className="text-sm font-semibold text-amber-300">
            Some commander stats could not be refreshed
          </p>
          <div className="mt-1 space-y-1 text-xs text-[var(--color-muted)]">
            {rosterStatus === "error" && <p>Roster: {rosterError}</p>}
            {catalogStatus === "error" && <p>Character catalog: {catalogError}</p>}
          </div>
          <button
            type="button"
            onClick={fetchData}
            className="mt-3 rounded-lg border border-amber-400/50 px-3 py-1.5 text-xs font-semibold text-amber-200 transition-colors hover:bg-amber-500/10"
            data-testid="dashboard-data-retry"
          >
            Try again
          </button>
        </div>
      )}

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-3">
        <StatBox
          value={rosterStatus === "ready" ? formatStat(tcp) : "—"}
          label="TCP"
          valueColor="#22c55e"
        />
        <StatBox
          value={`${rosterStatus === "ready" ? ownedCount : "—"} / ${catalogStatus === "ready" && playableCount > 0 ? playableCount : "—"}`}
          label="Roster"
          valueColor="#3b82f6"
        />
        <StatBox
          value={rosterStatus === "ready" ? formatStat(avgPower) : "—"}
          label="Avg Power"
          valueColor="#f59e0b"
        />
        <StatBox
          value={completion === null ? "—" : `${completion}%`}
          label="Completion"
          valueColor="#22c55e"
        />
      </div>

      {rosterStatus === "ready" ? (
        <>
          {/* Star Distribution */}
          <StarDistribution characters={rosterChars} />

          {/* Origin Breakdown */}
          <OriginBreakdown characters={rosterChars} />
        </>
      ) : (
        <div
          className="rounded-xl border border-[var(--color-surface-light)] bg-[var(--color-surface)] p-4 text-xs text-[var(--color-muted)]"
          data-testid="roster-breakdown-unavailable"
        >
          Star and origin breakdowns will return when roster data is available.
        </div>
      )}

      {/* Tower Event Widget */}
      <TowerEventWidget />

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
          description={catalogStatus === "ready" && playableCount > 0
            ? `Explore all ${playableCount} playable characters with portraits, traits, and abilities.`
            : "Explore playable characters with portraits, traits, and abilities."}
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
