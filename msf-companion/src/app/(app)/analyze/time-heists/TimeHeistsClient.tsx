"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";

interface CharacterTarget {
  level?: number;
  gearTier?: number;
  basic?: number;
  special?: number;
  ultimate?: number;
  passive?: number;
  activeRed?: number;
  activeYellow?: number;
  starkBoost?: Record<string, number>;
}

interface SquadUpgraded {
  name: string;
  description?: string;
  squad: string[];
}

interface TimeHeist {
  id: string;
  characterTarget: CharacterTarget;
  minLevel: number | null;
  playerTargetLevel: number | null;
  featureUnlocks: string[];
  completionsGranted: { id: string; chapter?: number; tier?: number; type: string }[];
  squadsUpgraded: SquadUpgraded[];
  playerTcp: number | null;
}

function formatTcp(tcp: number | null): string {
  if (tcp == null) return "—";
  if (tcp >= 1_000_000_000) return `${(tcp / 1_000_000_000).toFixed(1)}B`;
  if (tcp >= 1_000_000) return `${(tcp / 1_000_000).toFixed(1)}M`;
  if (tcp >= 1_000) return `${(tcp / 1_000).toFixed(1)}K`;
  return tcp.toString();
}

function SkeletonPage() {
  return (
    <div className="px-4 py-4 space-y-4" data-testid="time-heists-skeleton">
      <div className="h-4 w-24 rounded bg-[var(--color-surface-light)] animate-pulse" />
      <div className="h-6 w-56 rounded bg-[var(--color-surface-light)] animate-pulse" />
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="animate-pulse rounded-xl bg-[var(--color-surface)] p-4 space-y-2">
          <div className="h-4 w-40 rounded bg-[var(--color-surface-light)]" />
          <div className="h-3 w-64 rounded bg-[var(--color-surface-light)]" />
          <div className="h-3 w-32 rounded bg-[var(--color-surface-light)]" />
        </div>
      ))}
    </div>
  );
}

export default function TimeHeistsClient() {
  const [heists, setHeists] = useState<TimeHeist[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;

    async function fetchData() {
      try {
        const res = await fetch("/api/msf/time-heists");
        if (!res.ok) {
          setError("Failed to load time heist data");
          return;
        }
        const data = (await res.json()) as { data: TimeHeist[] };
        setHeists(data.data ?? []);
      } catch {
        setError("Failed to load time heist data");
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  if (loading) return <SkeletonPage />;

  // Sort by playerTargetLevel ascending (lowest first)
  const sorted = [...heists].sort(
    (a, b) => (a.playerTargetLevel ?? 0) - (b.playerTargetLevel ?? 0)
  );

  return (
    <div className="px-4 py-4">
      <Link
        href="/analyze"
        className="mb-3 inline-flex items-center gap-1 text-xs text-[var(--color-accent)] hover:underline"
      >
        ← Back to Analyze
      </Link>

      <h2 className="mb-1 text-xl font-bold text-[var(--color-foreground)]">
        Time Heist Guide
      </h2>
      <p className="mb-4 text-xs text-[var(--color-muted)]">
        {sorted.length} time heist level{sorted.length !== 1 ? "s" : ""}
      </p>

      {error && (
        <div className="mb-4 rounded-xl bg-red-600/20 border border-red-600/40 p-4">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      <div className="space-y-3">
        {sorted.map((heist) => (
          <div
            key={heist.id}
            className="rounded-xl bg-[var(--color-surface)] border border-[var(--color-surface-light)] p-4"
            data-testid={`th-card-${heist.id}`}
          >
            {/* Header */}
            <div className="flex items-start justify-between mb-3">
              <div>
                <h3 className="text-sm font-bold text-[var(--color-foreground)]">
                  {heist.id.replace("TIMEHEIST_LEVEL_", "Level ")}
                </h3>
                {heist.minLevel != null && (
                  <span className="text-[10px] text-[var(--color-muted)]">
                    Min Player Level: {heist.minLevel}
                  </span>
                )}
              </div>
              {heist.playerTcp != null && (
                <div className="text-right">
                  <span className="text-xs font-bold text-[var(--color-accent)]">
                    {formatTcp(heist.playerTcp)}
                  </span>
                  <span className="block text-[10px] text-[var(--color-muted)]">Your TCP</span>
                </div>
              )}
            </div>

            {/* Character Target Stats */}
            <div className="mb-3 flex flex-wrap gap-1.5">
              {heist.characterTarget.level != null && (
                <span className="text-[10px] bg-[var(--color-background)] px-2 py-0.5 rounded text-[var(--color-foreground)]">
                  Lv {heist.characterTarget.level}
                </span>
              )}
              {heist.characterTarget.gearTier != null && (
                <span className="text-[10px] bg-[var(--color-background)] px-2 py-0.5 rounded text-[var(--color-foreground)]">
                  G{heist.characterTarget.gearTier}
                </span>
              )}
              {heist.characterTarget.basic != null && (
                <span className="text-[10px] bg-[var(--color-background)] px-2 py-0.5 rounded text-[var(--color-muted)]">
                  Basic {heist.characterTarget.basic}
                </span>
              )}
              {heist.characterTarget.special != null && (
                <span className="text-[10px] bg-[var(--color-background)] px-2 py-0.5 rounded text-[var(--color-muted)]">
                  Special {heist.characterTarget.special}
                </span>
              )}
              {heist.characterTarget.ultimate != null && (
                <span className="text-[10px] bg-[var(--color-background)] px-2 py-0.5 rounded text-[var(--color-muted)]">
                  Ult {heist.characterTarget.ultimate}
                </span>
              )}
              {heist.characterTarget.passive != null && (
                <span className="text-[10px] bg-[var(--color-background)] px-2 py-0.5 rounded text-[var(--color-muted)]">
                  Passive {heist.characterTarget.passive}
                </span>
              )}
              {heist.characterTarget.activeYellow != null && (
                <span className="text-[10px] bg-[var(--color-background)] px-2 py-0.5 rounded text-yellow-400">
                  ★{heist.characterTarget.activeYellow}
                </span>
              )}
              {heist.characterTarget.activeRed != null && (
                <span className="text-[10px] bg-[var(--color-background)] px-2 py-0.5 rounded text-red-400">
                  ★{heist.characterTarget.activeRed}
                </span>
              )}
            </div>

            {/* Squads Upgraded */}
            {heist.squadsUpgraded.length > 0 && (
              <div className="mb-3">
                <h4 className="text-[10px] font-semibold text-[var(--color-muted)] mb-1 uppercase tracking-wider">
                  Squads Upgraded
                </h4>
                <div className="space-y-1">
                  {heist.squadsUpgraded.map((squad, idx) => (
                    <div key={idx} className="text-xs">
                      <span className="font-semibold text-[var(--color-foreground)]">{squad.name}</span>
                      {squad.description && (
                        <span className="text-[var(--color-muted)]"> — {squad.description}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Feature Unlocks */}
            {heist.featureUnlocks.length > 0 && (
              <div>
                <h4 className="text-[10px] font-semibold text-[var(--color-muted)] mb-1 uppercase tracking-wider">
                  Features Unlocked
                </h4>
                <div className="flex flex-wrap gap-1">
                  {heist.featureUnlocks.map((feature, idx) => (
                    <span
                      key={idx}
                      className="text-[10px] bg-teal-600/20 text-teal-400 border border-teal-600/40 px-1.5 py-0.5 rounded"
                    >
                      {feature}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
