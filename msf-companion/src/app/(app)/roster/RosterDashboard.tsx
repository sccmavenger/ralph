"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RosterCharacter, RosterFilters } from "@/lib/roster-filters";
import { applyFilters, countActiveFilters, DEFAULT_FILTERS } from "@/lib/roster-filters";
import RosterList from "../../components/RosterList";
import RosterFilterPanel from "../../components/RosterFilterPanel";
import CharacterDetailView from "../../components/CharacterDetailView";
import { CharPortrait } from "../../components/CharPortrait";
import PremiumGate from "../../components/PremiumGate";

interface RosterApiResponse {
  data?: RosterCharacter[];
  error?: string;
}

interface GameChar {
  id: string;
  name?: string;
  portrait?: string;
  traits?: string[];
  status?: string;
}

interface GameApiResponse {
  data?: GameChar[];
}

type DashboardView = "my-roster" | "missing" | "detail";

export default function RosterDashboard({
  teams,
  isPremium,
}: {
  teams: string[];
  isPremium: boolean;
}) {
  const [characters, setCharacters] = useState<RosterCharacter[]>([]);
  const [gameChars, setGameChars] = useState<GameChar[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<DashboardView>("my-roster");
  const [previousView, setPreviousView] = useState<DashboardView>("my-roster");
  const [selectedCharacter, setSelectedCharacter] = useState<RosterCharacter | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<RosterFilters>({ ...DEFAULT_FILTERS });
  const fetchedRef = useRef(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [rosterRes, gameRes] = await Promise.all([
        fetch("/api/msf/roster"),
        fetch("/api/msf/characters"),
      ]);

      if (!rosterRes.ok) {
        const data = (await rosterRes.json()) as RosterApiResponse;
        throw new Error(data.error || "Failed to load roster");
      }

      const rosterData = (await rosterRes.json()) as RosterApiResponse;
      const chars = (rosterData.data ?? []).sort(
        (a, b) => (b.power ?? 0) - (a.power ?? 0)
      );
      setCharacters(chars);

      if (gameRes.ok) {
        const gameData = (await gameRes.json()) as GameApiResponse;
        const playable = (gameData.data ?? []).filter(
          (c) => c.status === "playable"
        );
        setGameChars(playable);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
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

  // Computed stats
  const ownedCount = characters.length;
  const ownedIds = new Set(characters.map((c) => c.id));
  const missingChars = gameChars.filter((c) => !ownedIds.has(c.id));
  const missingCount = missingChars.length;
  const totalGameChars = gameChars.length;

  // Loading state
  if (loading) {
    return (
      <div className="px-4 py-6">
        <div className="mb-4 h-6 w-40 animate-pulse rounded bg-[var(--color-surface)]" />
        <div className="grid grid-cols-4 gap-3">
          {Array.from({ length: 16 }).map((_, i) => (
            <div key={i} className="flex flex-col items-center gap-1">
              <div className="h-20 w-20 animate-pulse rounded-xl bg-[var(--color-surface)]" />
              <div className="h-3 w-14 animate-pulse rounded bg-[var(--color-surface)]" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center px-4 py-12 text-center">
        <p className="mb-4 text-sm text-[var(--color-muted)]">{error}</p>
        <button
          onClick={() => {
            fetchedRef.current = false;
            fetchData();
          }}
          className="rounded-lg bg-[var(--color-accent)] px-6 py-2 text-sm font-semibold text-white"
        >
          Retry
        </button>
      </div>
    );
  }

  if (view === "detail" && selectedCharacter) {
    return (
      <CharacterDetailView
        characterId={selectedCharacter.id}
        rosterData={{
          yellowStars: selectedCharacter.yellowStars,
          redStars: selectedCharacter.redStars,
          gearTier: selectedCharacter.gearTier,
          level: selectedCharacter.level,
          power: selectedCharacter.power,
        }}
        onBack={() => {
          setSelectedCharacter(null);
          setView(previousView);
        }}
      />
    );
  }

  if (view === "my-roster") {
    const filtered = applyFilters(characters, filters);
    const hasActiveFilters = countActiveFilters(filters) > 0;
    return (
      <div className="px-4 py-4">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-[var(--color-foreground)]">
              My Roster
            </h2>
            <p className="text-xs text-[var(--color-muted)]">
              {hasActiveFilters
                ? `${filtered.length} of ${ownedCount} match filters`
                : `${ownedCount} of ${totalGameChars || "?"} playable characters`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setView("missing")}
              className="rounded-lg bg-[var(--color-surface)] px-3 py-1.5 text-xs font-medium text-[var(--color-muted)]"
            >
              Missing ({missingCount})
            </button>
            <button
              onClick={() => setShowFilters(true)}
              className="relative flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--color-surface)]"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--color-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
              </svg>
              {hasActiveFilters && (
                <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-[var(--color-accent)] text-[8px] font-bold text-white">
                  {countActiveFilters(filters)}
                </span>
              )}
            </button>
          </div>
        </div>
        <RosterList
          filters={filters}
          onCharacterClick={(char) => {
            setSelectedCharacter(char);
            setPreviousView("my-roster");
            setView("detail");
          }}
        />
        {showFilters && (
          <PremiumGate isPremium={isPremium} featureName="Advanced Filters">
            <RosterFilterPanel
              filters={filters}
              onChange={setFilters}
              teams={teams}
              onClose={() => setShowFilters(false)}
            />
          </PremiumGate>
        )}
      </div>
    );
  }

  if (view === "missing") {
    return (
      <div className="px-4 py-4">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-[var(--color-foreground)]">
              Missing Characters
            </h2>
            <p className="text-xs text-[var(--color-muted)]">
              {missingCount} playable characters you haven&apos;t unlocked
            </p>
          </div>
          <button
            onClick={() => setView("my-roster")}
            className="rounded-lg bg-[var(--color-surface)] px-3 py-1.5 text-xs font-medium text-[var(--color-accent)]"
          >
            ← My Roster
          </button>
        </div>
        {missingCount > 0 ? (
          <div className="grid grid-cols-4 gap-3">
            {missingChars.map((char) => (
              <button
                key={char.id}
                onClick={() => {
                  setSelectedCharacter({
                    id: char.id,
                    name: char.name,
                    portrait: char.portrait,
                    traits: char.traits,
                    playable: true,
                  } as RosterCharacter);
                  setPreviousView("missing");
                  setView("detail");
                }}
                className="transition-transform active:scale-95"
              >
                <div className="flex flex-col items-center gap-1">
                  <div className="relative h-20 w-20 overflow-hidden rounded-xl bg-[var(--color-surface)] opacity-70 grayscale">
                    <CharPortrait
                      src={char.portrait}
                      name={char.name ?? "?"}
                      imgClassName="h-full w-full object-cover"
                      fallbackClassName="flex h-full w-full items-center justify-center text-xl font-bold text-[var(--color-muted)]"
                    />
                    <span className="absolute bottom-0 left-0 right-0 bg-black/60 text-center text-[9px] font-bold text-red-400">
                      LOCKED
                    </span>
                  </div>
                  <span className="w-20 truncate text-center text-[10px] font-semibold text-[var(--color-muted)]">
                    {char.name ?? char.id}
                  </span>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center rounded-xl bg-[var(--color-surface)] px-6 py-8 text-center">
            <span className="mb-2 text-4xl">🏆</span>
            <p className="text-sm font-bold text-[var(--color-foreground)]">
              You&apos;ve unlocked every playable character!
            </p>
          </div>
        )}
      </div>
    );
  }

  // Fallback — shouldn't reach here
  return null;
}
