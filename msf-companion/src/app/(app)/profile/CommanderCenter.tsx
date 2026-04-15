"use client";

import Link from "next/link";

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

export default function CommanderCenter({
  displayName,
  tcp,
  rosterCount,
  totalGameChars,
  avgPower,
  sevenStarCount,
  sevenRedStarCount,
  highPowerCount,
  email,
}: {
  displayName: string;
  tcp: number;
  rosterCount: number;
  totalGameChars: number;
  avgPower: number;
  sevenStarCount: number;
  sevenRedStarCount: number;
  highPowerCount: number;
  email: string | null;
}) {
  return (
    <div className="px-4 py-4">
      {/* Commander header */}
      <div className="mb-4 flex items-center gap-3 rounded-xl bg-[var(--color-surface)] p-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-yellow-500 to-red-500 text-lg font-bold text-white">
          {displayName[0].toUpperCase()}
        </div>
        <div className="flex-1">
          <h2 className="text-base font-bold text-[var(--color-foreground)]">
            Commander Center
          </h2>
          <p className="text-xs text-[var(--color-muted)]">
            Welcome back, {displayName}
          </p>
        </div>
        <button
          onClick={() => window.location.reload()}
          className="rounded-lg bg-[var(--color-surface-light)] px-3 py-1 text-xs text-[var(--color-muted)]"
        >
          ↻ Sync
        </button>
      </div>

      {/* Stats grid */}
      <div className="mb-4 grid grid-cols-2 gap-3">
        <StatBox value={formatStat(tcp)} label="TCP" valueColor="#22c55e" />
        <StatBox
          value={`${rosterCount} / ${totalGameChars || "?"}`}
          label="Roster"
          valueColor="#3b82f6"
        />
        <StatBox
          value={formatStat(avgPower)}
          label="Avg Power"
          valueColor="#f59e0b"
        />
        <StatBox
          value={String(sevenStarCount)}
          label="7★ Characters"
          valueColor="#eab308"
        />
        <StatBox
          value={String(sevenRedStarCount)}
          label="7 Red★"
          valueColor="#ef4444"
        />
        <StatBox
          value={String(highPowerCount)}
          label="100K+ Power"
          valueColor="#8b5cf6"
        />
      </div>

      {/* Navigation cards */}
      <div className="space-y-3">
        <NavCard
          icon="📊"
          title="Roster Analytics"
          description="Deep-dive into your roster stats, origin breakdown, and characters that need investment."
          href="/roster"
        />
        <NavCard
          icon="🦸"
          title="Character Database"
          description={`Browse all ${totalGameChars || ""} playable characters with filters for origin, role, team, and more.`}
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
      </div>
    </div>
  );
}
