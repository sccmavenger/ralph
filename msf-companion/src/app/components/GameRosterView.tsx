"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RosterCharacter } from "@/lib/roster-filters";

interface GameCharacter {
  id: string;
  name?: string;
  portrait?: string;
  traits?: string[];
  status?: string;
}

interface GameApiResponse {
  data?: GameCharacter[];
  error?: string;
}

interface CachedData {
  data: GameCharacter[];
  timestamp: number;
}

const CACHE_KEY = "msf-game-roster";
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

function getCachedData(): GameCharacter[] | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const cached = JSON.parse(raw) as CachedData;
    if (Date.now() - cached.timestamp > CACHE_TTL) {
      sessionStorage.removeItem(CACHE_KEY);
      return null;
    }
    return cached.data;
  } catch {
    return null;
  }
}

function setCachedData(data: GameCharacter[]): void {
  try {
    const cached: CachedData = { data, timestamp: Date.now() };
    sessionStorage.setItem(CACHE_KEY, JSON.stringify(cached));
  } catch {
    // Storage full or unavailable
  }
}

function GameRosterSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 10 }).map((_, i) => (
        <div
          key={i}
          className="flex animate-pulse items-center gap-3 rounded-xl bg-[var(--color-surface)] p-3"
        >
          <div className="h-10 w-10 shrink-0 rounded-full bg-[var(--color-surface-light)]" />
          <div className="flex-1 space-y-1.5">
            <div className="h-4 w-2/3 rounded bg-[var(--color-surface-light)]" />
            <div className="h-3 w-1/2 rounded bg-[var(--color-surface-light)]" />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function GameRosterView({
  ownedCharacters,
  teams,
  onCharacterClick,
}: {
  ownedCharacters: RosterCharacter[];
  teams: string[];
  onCharacterClick: (id: string, owned: boolean) => void;
}) {
  const [allChars, setAllChars] = useState<GameCharacter[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selectedTeams, setSelectedTeams] = useState<string[]>([]);
  const [showMissing, setShowMissing] = useState(false);
  const fetchedRef = useRef(false);

  const ownedSet = new Set(ownedCharacters.map((c) => c.id));
  const ownedPowerMap = new Map(
    ownedCharacters.map((c) => [c.id, c.power ?? 0])
  );

  const fetchGameRoster = useCallback(async () => {
    // Check cache first
    const cached = getCachedData();
    if (cached) {
      setAllChars(cached);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/msf/characters");
      if (!res.ok) {
        const data = (await res.json()) as GameApiResponse;
        throw new Error(data.error || "Failed to load game roster");
      }

      const data = (await res.json()) as GameApiResponse;
      const chars = data.data ?? [];
      setCachedData(chars);
      setAllChars(chars);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!fetchedRef.current) {
      fetchedRef.current = true;
      fetchGameRoster();
    }
  }, [fetchGameRoster]);

  // Filter logic
  let filtered = allChars;

  // Search
  if (search.trim()) {
    const q = search.trim().toLowerCase();
    filtered = filtered.filter((c) =>
      (c.name ?? "").toLowerCase().includes(q)
    );
  }

  // Team filter (OR logic)
  if (selectedTeams.length > 0) {
    filtered = filtered.filter((c) =>
      selectedTeams.some((t) => (c.traits ?? []).includes(t))
    );
  }

  // Missing toggle (AND with other filters)
  if (showMissing) {
    filtered = filtered.filter((c) => !ownedSet.has(c.id));
  }

  if (loading) {
    return (
      <div>
        <div className="mb-3">
          <div className="h-10 w-full animate-pulse rounded-lg bg-[var(--color-surface)]" />
        </div>
        <GameRosterSkeleton />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <p className="mb-4 text-sm text-[var(--color-muted)]">{error}</p>
        <button
          onClick={() => fetchGameRoster()}
          className="rounded-lg bg-[var(--color-accent)] px-6 py-2 text-sm font-semibold text-white"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div>
      {/* Search */}
      <input
        type="text"
        placeholder="Search characters..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="mb-3 w-full rounded-lg border border-[var(--color-surface-light)] bg-[var(--color-surface)] px-4 py-2.5 text-sm text-[var(--color-foreground)] placeholder-[var(--color-muted)] outline-none focus:border-[var(--color-accent)]"
      />

      {/* Missing toggle */}
      <div className="mb-3 flex items-center gap-2">
        <button
          onClick={() => setShowMissing(!showMissing)}
          className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
            showMissing
              ? "bg-[var(--color-accent)] text-white"
              : "bg-[var(--color-surface)] text-[var(--color-muted)]"
          }`}
        >
          Missing Only
        </button>
      </div>

      {/* Team filters */}
      {teams.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {teams.slice(0, 20).map((team) => {
            const isSelected = selectedTeams.includes(team);
            return (
              <button
                key={team}
                onClick={() =>
                  setSelectedTeams(
                    isSelected
                      ? selectedTeams.filter((t) => t !== team)
                      : [...selectedTeams, team]
                  )
                }
                className={`rounded-full px-2.5 py-0.5 text-[10px] font-medium transition-colors ${
                  isSelected
                    ? "bg-[var(--color-accent)] text-white"
                    : "bg-[var(--color-surface-light)] text-[var(--color-muted)]"
                }`}
              >
                {team}
              </button>
            );
          })}
        </div>
      )}

      {/* Character list */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <p className="text-sm text-[var(--color-muted)]">
            No characters match your search.
          </p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {filtered.map((char) => {
            const owned = ownedSet.has(char.id);
            const power = ownedPowerMap.get(char.id);
            const visibleTraits = (char.traits ?? []).slice(0, 4);
            const overflowCount = (char.traits ?? []).length - 4;

            return (
              <button
                key={char.id}
                onClick={() => onCharacterClick(char.id, owned)}
                className={`flex w-full items-center gap-3 rounded-xl p-3 text-left transition-colors active:bg-[var(--color-surface-light)] ${
                  owned
                    ? "bg-[var(--color-surface)]"
                    : "bg-[var(--color-surface)] opacity-50"
                }`}
              >
                <div
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                    owned
                      ? "bg-[var(--color-accent)]/20 text-[var(--color-accent)]"
                      : "bg-[var(--color-surface-light)] text-[var(--color-muted)]"
                  }`}
                >
                  {(char.name ?? "?")[0]}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-semibold text-[var(--color-foreground)]">
                      {char.name ?? "Unknown"}
                    </p>
                    {owned && (
                      <span className="shrink-0 text-[10px] text-green-400">
                        ●
                      </span>
                    )}
                    {!owned && (
                      <span className="shrink-0 rounded bg-[var(--color-surface-light)] px-1.5 py-0.5 text-[9px] text-[var(--color-muted)]">
                        Unowned
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1 mt-0.5">
                    {visibleTraits.map((t) => (
                      <span
                        key={t}
                        className="rounded bg-[var(--color-surface-light)] px-1.5 py-0.5 text-[9px] text-[var(--color-muted)]"
                      >
                        {t}
                      </span>
                    ))}
                    {overflowCount > 0 && (
                      <span className="text-[9px] text-[var(--color-muted)]">
                        +{overflowCount}
                      </span>
                    )}
                  </div>
                </div>
                {owned && power != null && (
                  <span className="text-xs font-bold text-[var(--color-accent)]">
                    {power >= 1000
                      ? `${(power / 1000).toFixed(1)}K`
                      : power}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
