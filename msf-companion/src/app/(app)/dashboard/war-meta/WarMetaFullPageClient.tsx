"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { CompactStars } from "@/app/components/StarDisplay";
import { CharPortrait } from "@/app/components/CharPortrait";

/* ── Types ─────────────────────────────────────────────────────── */

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

/* ── Constants ─────────────────────────────────────────────────── */

type TabKey = "offense" | "defense";

interface TabDef {
  key: TabKey;
  label: string;
}

const TABS: TabDef[] = [
  { key: "offense", label: "Offense" },
  { key: "defense", label: "Defense" },
];

const ISO_CLASS_MAP: Record<string, string> = {
  "1": "Fortifier",
  "2": "Healer",
  "3": "Skirmisher",
  "4": "Raider",
  "5": "Striker",
};

/* ── StatusBadge ───────────────────────────────────────────────── */

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; className: string }> = {
    built: {
      label: "Built",
      className: "bg-green-600/20 text-green-400 border-green-600/40",
    },
    "needs-work": {
      label: "Needs Work",
      className: "bg-yellow-600/20 text-yellow-400 border-yellow-600/40",
    },
    missing: {
      label: "Missing",
      className: "bg-red-600/20 text-red-400 border-red-600/40",
    },
  };
  const c = config[status] ?? config.missing;
  return (
    <span
      className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${c.className}`}
    >
      {c.label}
    </span>
  );
}

/* ── CharacterCard ─────────────────────────────────────────────── */

function CharacterCard({ char }: { char: RosterComparison }) {
  const isoLabel = ISO_CLASS_MAP[char.iso8Class] ?? (char.iso8Class || "—");

  return (
    <div
      className="flex flex-col items-center gap-1 p-2 rounded-lg bg-[var(--color-surface)] border border-[var(--color-surface-light)] min-w-[72px]"
      data-testid={`char-card-${char.characterId}`}
    >
      {/* Portrait */}
      <CharPortrait
        src={char.portrait}
        name={char.characterName}
        imgClassName="w-12 h-12 rounded-full border border-[var(--color-surface-light)] object-cover"
        fallbackClassName="flex w-12 h-12 items-center justify-center rounded-full bg-[var(--color-surface-light)] text-xs font-bold text-[var(--color-muted)]"
      />

      {/* Name */}
      <span className="text-[11px] font-semibold text-[var(--color-foreground)] text-center leading-tight line-clamp-2">
        {char.characterName}
      </span>

      {/* Gear Tier */}
      <span className="text-[10px] text-[var(--color-muted)]">
        G{char.gearTier}
      </span>

      {/* Stars */}
      <CompactStars yellowStars={char.yellowStars} redStars={char.redStars} />

      {/* ISO-8 */}
      <span className="text-[10px] text-[var(--color-muted)]">{isoLabel}</span>

      {/* Status */}
      <StatusBadge status={char.status} />
    </div>
  );
}

/* ── SkeletonPage ──────────────────────────────────────────────── */

function SkeletonPage() {
  return (
    <div className="px-4 py-4 space-y-4" data-testid="war-meta-skeleton">
      <div className="h-4 w-24 rounded bg-[var(--color-surface-light)] animate-pulse" />
      <div className="h-6 w-40 rounded bg-[var(--color-surface-light)] animate-pulse" />
      {/* Tabs skeleton */}
      <div className="flex gap-2">
        {[1, 2].map((n) => (
          <div
            key={n}
            className="h-8 w-20 rounded bg-[var(--color-surface-light)] animate-pulse"
          />
        ))}
      </div>
      {/* Row skeletons */}
      {Array.from({ length: 5 }, (_, i) => (
        <div
          key={i}
          className="h-16 rounded-lg bg-[var(--color-surface-light)] animate-pulse"
        />
      ))}
    </div>
  );
}

/* ── TeamRow ────────────────────────────────────────────────────── */

function TeamRow({ team }: { team: MetaTeam }) {
  const [expanded, setExpanded] = useState(false);

  const formattedBattles = team.totalBattles.toLocaleString();
  const winPct = (team.winRate * 100).toFixed(1);

  return (
    <div
      className="rounded-lg border border-[var(--color-surface-light)] bg-[var(--color-surface)] overflow-hidden"
      data-testid={`team-row-${team.rank}`}
    >
      {/* Header row */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 px-3 py-3 text-left hover:bg-[var(--color-surface-light)] transition-colors"
        data-testid={`team-row-toggle-${team.rank}`}
      >
        {/* Rank */}
        <span className="text-sm font-bold text-[var(--color-accent)] min-w-[28px] text-center">
          #{team.rank}
        </span>

        {/* Team names + battles */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-[var(--color-foreground)] truncate">
            {team.squadNames.join(" · ")}
          </p>
          <p className="text-xs text-[var(--color-muted)]">
            {formattedBattles} battles
          </p>
        </div>

        {/* Win info */}
        <div className="text-right shrink-0">
          <p className="text-sm font-bold text-[var(--color-foreground)]">
            {winPct}%
          </p>
          <p className="text-[10px] text-[var(--color-muted)]">
            {team.wins.toLocaleString()} W
          </p>
        </div>

        {/* Chevron */}
        <span className="text-[var(--color-muted)] text-sm shrink-0">
          {expanded ? "\u25BE" : "\u25B8"}
        </span>
      </button>

      {/* Expanded character cards */}
      {expanded && (
        <div
          className="px-3 pb-3 pt-1 border-t border-[var(--color-surface-light)]"
          data-testid={`team-row-expanded-${team.rank}`}
        >
          <div className="flex flex-wrap gap-2 justify-center">
            {team.rosterComparison.map((char) => (
              <CharacterCard key={char.characterId} char={char} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Main Component ────────────────────────────────────────────── */

export default function WarMetaFullPageClient() {
  const [activeTab, setActiveTab] = useState<TabKey>("offense");
  const [teams, setTeams] = useState<MetaTeam[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const fetchedModes = useRef<Set<TabKey>>(new Set());
  const cache = useRef<Record<string, MetaTeam[]>>({});

  useEffect(() => {
    if (fetchedModes.current.has(activeTab) && cache.current[activeTab]) {
      setTeams(cache.current[activeTab]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(false);

    async function fetchData() {
      try {
        const res = await fetch(`/api/msf/war-meta?mode=${activeTab}`);
        if (res.ok) {
          const data = await res.json();
          const fetched: MetaTeam[] = data.teams ?? [];
          if (!cancelled) {
            cache.current[activeTab] = fetched;
            fetchedModes.current.add(activeTab);
            setTeams(fetched);
          }
        } else if (!cancelled) {
          setError(true);
        }
      } catch {
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchData();
    return () => {
      cancelled = true;
    };
  }, [activeTab, retryCount]);

  return (
    <div className="px-4 py-4 max-w-3xl mx-auto" data-testid="war-meta-page">
      {/* Back link */}
      <Link
        href="/dashboard"
        className="mb-3 inline-block text-xs text-[var(--color-accent)] hover:underline"
        data-testid="war-meta-back-link"
      >
        &larr; Back to Dashboard
      </Link>

      {/* Title */}
      <h1
        className="text-xl font-bold text-[var(--color-foreground)] mb-4"
        data-testid="war-meta-page-title"
      >
        War Meta
      </h1>

      {/* Tabs */}
      <div
        className="flex gap-1 mb-4 border-b border-[var(--color-surface-light)]"
        data-testid="war-meta-tabs"
      >
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 text-sm font-semibold transition-colors rounded-t-md ${
              activeTab === tab.key
                ? "bg-[var(--color-accent)] text-white border-b-2 border-[var(--color-accent)]"
                : "text-[var(--color-muted)] hover:text-[var(--color-foreground)] hover:bg-[var(--color-surface-light)]"
            }`}
            data-testid={`war-meta-tab-${tab.key}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <SkeletonPage />
      ) : error ? (
        <div className="text-center py-8" data-testid="war-meta-error">
          <p className="text-sm text-[var(--color-muted)] mb-2">Unable to load war meta data.</p>
          <button
            onClick={() => {
              fetchedModes.current.delete(activeTab);
              delete cache.current[activeTab];
              setRetryCount((c) => c + 1);
            }}
            className="text-xs font-semibold text-[var(--color-accent)] hover:underline"
          >
            Try again
          </button>
        </div>
      ) : teams.length === 0 ? (
        <p
          className="text-sm text-[var(--color-muted)] text-center py-8"
          data-testid="war-meta-empty"
        >
          No teams found for this mode.
        </p>
      ) : (
        <div className="space-y-3" data-testid="war-meta-team-list">
          {teams.map((team) => (
            <TeamRow key={team.rank} team={team} />
          ))}
        </div>
      )}
    </div>
  );
}
