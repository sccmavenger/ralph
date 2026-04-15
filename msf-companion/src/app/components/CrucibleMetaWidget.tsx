"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";

/* ---------- Types ---------- */

interface RosterComparison {
  characterId: string;
  characterName: string;
  portrait: string;
  owned: boolean;
  gearTier: number;
  yellowStars: number;
  redStars: number;
  iso8Class: string;
  status: "built" | "needs-work" | "missing";
}

interface MetaTeam {
  rank: number;
  squad: string[];
  squadNames: string[];
  totalBattles: number;
  wins: number;
  winRate: number;
  rosterComparison: RosterComparison[];
}

/* ---------- Helpers ---------- */

function getTeamLabel(squadNames: string[]): string {
  if (!squadNames || squadNames.length === 0) return "Unknown Team";
  // Show all names, truncate the overall string via CSS
  return squadNames.join(", ");
}

function getRosterDot(rosterComparison: RosterComparison[]): {
  color: string;
  label: string;
} {
  const builtCount = rosterComparison.filter((c) => c.status === "built").length;
  if (builtCount >= 5) return { color: "bg-green-500", label: "5/5 built" };
  if (builtCount >= 3) return { color: "bg-yellow-500", label: `${builtCount}/5 built` };
  return { color: "bg-red-500", label: `${builtCount}/5 built` };
}

/* ---------- Skeleton ---------- */

function SkeletonWidget() {
  return (
    <div
      className="animate-pulse rounded-xl bg-[var(--color-surface)] p-4 space-y-3"
      data-testid="crucible-meta-widget-skeleton"
    >
      <div className="h-4 w-48 rounded bg-[var(--color-surface-light)]" />
      <div className="space-y-2">
        <div className="h-8 w-full rounded bg-[var(--color-surface-light)]" />
        <div className="h-8 w-full rounded bg-[var(--color-surface-light)]" />
        <div className="h-8 w-full rounded bg-[var(--color-surface-light)]" />
      </div>
    </div>
  );
}

/* ---------- Component ---------- */

export default function CrucibleMetaWidget() {
  const [teams, setTeams] = useState<MetaTeam[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;

    async function fetchData() {
      try {
        const res = await fetch("/api/msf/war-meta?mode=crucible");
        if (res.ok) {
          const data = await res.json();
          setTeams((data.teams ?? []).slice(0, 3));
        } else {
          setError(true);
        }
      } catch {
        setError(true);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, []);

  if (loading) return <SkeletonWidget />;

  if (error && teams.length === 0) {
    return (
      <div
        className="rounded-xl border border-[var(--color-surface-light)] bg-[var(--color-surface)] p-4"
        data-testid="crucible-meta-widget"
      >
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-bold text-[var(--color-foreground)]">Crucible Meta</h3>
          <Link
            href="/dashboard/crucible-meta"
            className="text-xs font-semibold text-[var(--color-accent)]"
            data-testid="crucible-meta-widget-link"
          >
            View All →
          </Link>
        </div>
        <p className="text-[10px] text-[var(--color-muted)]">Crucible meta data is temporarily unavailable.</p>
      </div>
    );
  }

  return (
    <div
      className="rounded-xl border border-[var(--color-surface-light)] bg-[var(--color-surface)] p-4"
      data-testid="crucible-meta-widget"
    >
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-bold text-[var(--color-foreground)]">
          Crucible Meta
        </h3>
        <Link
          href="/dashboard/crucible-meta"
          className="text-xs font-semibold text-[var(--color-accent)]"
          data-testid="crucible-meta-widget-link"
        >
          View All →
        </Link>
      </div>

      <div data-testid="crucible-meta-widget-defense">
        <h4 className="mb-2 text-xs font-semibold text-[var(--color-muted)]">
          Top Defense Teams
        </h4>
        <div className="space-y-2">
          {teams.length === 0 ? (
            <p className="text-[10px] text-[var(--color-muted)]">No data</p>
          ) : (
            teams.map((team) => {
              const dot = getRosterDot(team.rosterComparison);
              return (
                <div
                  key={`cru-${team.rank}`}
                  className="flex items-center gap-2 rounded-lg bg-[var(--color-background)]/40 px-2 py-1.5"
                  data-testid="crucible-meta-team-entry"
                >
                  <span className="text-xs font-bold text-[var(--color-muted)] w-4 flex-shrink-0">
                    {team.rank}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-[var(--color-foreground)] truncate">
                      {getTeamLabel(team.squadNames)}
                    </p>
                    <p className="text-[10px] text-[var(--color-accent)]">
                      {(team.winRate * 100).toFixed(1)}%
                    </p>
                  </div>
                  <span
                    className={`h-3 w-3 rounded-full flex-shrink-0 ${dot.color}`}
                    title={dot.label}
                  />
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
