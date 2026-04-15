"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RosterCharacter, RosterFilters } from "@/lib/roster-filters";
import { applyFilters, DEFAULT_FILTERS } from "@/lib/roster-filters";
import { CompactStars } from "./StarDisplay";
import { CharPortrait } from "./CharPortrait";

interface RosterApiResponse {
  data?: RosterCharacter[];
  error?: string;
}

function RosterSkeleton() {
  return (
    <div className="grid grid-cols-4 gap-3">
      {Array.from({ length: 16 }).map((_, i) => (
        <div key={i} className="flex flex-col items-center gap-1">
          <div className="h-20 w-20 animate-pulse rounded-xl bg-[var(--color-surface)]" />
          <div className="h-3 w-14 animate-pulse rounded bg-[var(--color-surface)]" />
        </div>
      ))}
    </div>
  );
}

function formatPower(p: number): string {
  if (p >= 1_000_000) return `${(p / 1_000_000).toFixed(1)}M`;
  if (p >= 1000) return `${(p / 1000).toFixed(1)}K`;
  return p.toString();
}

function CharTile({ char }: { char: RosterCharacter }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative h-20 w-20 overflow-hidden rounded-xl bg-[var(--color-surface)]">
        <CharPortrait
            src={char.portrait}
            name={char.name ?? "?"}
            imgClassName="h-full w-full object-cover"
            fallbackClassName="flex h-full w-full items-center justify-center text-xl font-bold text-[var(--color-muted)]"
          />
        {/* Power badge */}
        {char.power != null && (
          <span className="absolute bottom-0 left-0 right-0 bg-black/60 text-center text-[9px] font-bold text-white">
            {formatPower(char.power)}
          </span>
        )}
      </div>
      <span className="w-20 truncate text-center text-[10px] font-semibold text-[var(--color-foreground)]">
        {char.name ?? char.id}
      </span>
      <CompactStars yellowStars={char.yellowStars} redStars={char.redStars} />
    </div>
  );
}

export default function RosterList({
  onCharacterClick,
  onCharactersLoaded,
  filters,
}: {
  onCharacterClick?: (char: RosterCharacter) => void;
  onCharactersLoaded?: (chars: RosterCharacter[]) => void;
  filters?: RosterFilters;
}) {
  const [characters, setCharacters] = useState<RosterCharacter[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const fetchedRef = useRef(false);

  const fetchRoster = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/msf/roster");
      if (!res.ok) {
        const data = (await res.json()) as RosterApiResponse;
        throw new Error(data.error || "Failed to load roster");
      }

      const data = (await res.json()) as RosterApiResponse;
      const chars = (data.data ?? []).sort(
        (a, b) => (b.power ?? 0) - (a.power ?? 0)
      );
      setCharacters(chars);
      onCharactersLoaded?.(chars);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Something went wrong"
      );
    } finally {
      setLoading(false);
    }
  }, [onCharactersLoaded]);

  useEffect(() => {
    if (!fetchedRef.current) {
      fetchedRef.current = true;
      fetchRoster();
    }
  }, [fetchRoster]);

  const activeFilters = filters ?? DEFAULT_FILTERS;
  const filtered = applyFilters(characters, activeFilters);

  if (loading) return <RosterSkeleton />;

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <p className="mb-4 text-sm text-[var(--color-muted)]">{error}</p>
        <button
          onClick={() => fetchRoster()}
          className="rounded-lg bg-[var(--color-accent)] px-6 py-2 text-sm font-semibold text-white"
        >
          Retry
        </button>
      </div>
    );
  }

  if (characters.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <p className="text-sm text-[var(--color-muted)]">
          No characters found in your roster.
        </p>
      </div>
    );
  }

  if (filtered.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <p className="text-sm text-[var(--color-muted)]">
          No characters match your filters.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-4 gap-3">
      {filtered.map((char) => (
        <button
          key={char.id}
          onClick={() => onCharacterClick?.(char)}
          className="transition-transform active:scale-95"
        >
          <CharTile char={char} />
        </button>
      ))}
    </div>
  );
}
