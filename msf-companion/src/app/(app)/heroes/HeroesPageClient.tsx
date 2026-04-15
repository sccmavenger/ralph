"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import CharacterDetailView from "../../components/CharacterDetailView";
import { CharPortrait } from "../../components/CharPortrait";

interface GameCharacter {
  id: string;
  name?: string;
  portrait?: string;
  traits?: string[];
  status?: string;
}

interface GameApiResponse {
  data?: GameCharacter[];
}

const ORIGINS = ["COSMIC", "BIO", "MYSTIC", "TECH", "MUTANT", "SKILL"];
const ROLES = ["BLASTER", "BRAWLER", "CONTROLLER", "PROTECTOR", "SUPPORT"];
const STATUS_OPTIONS = ["Playable", "All"];
const SORT_OPTIONS = ["Name A → Z", "Name Z → A"];

const ORIGIN_COLORS: Record<string, string> = {
  COSMIC: "#9333ea",
  BIO: "#22c55e",
  MYSTIC: "#6366f1",
  TECH: "#06b6d4",
  MUTANT: "#eab308",
  SKILL: "#ef4444",
};

const PER_PAGE = 40;

function HeroCard({ char }: { char: GameCharacter }) {
  const originTraits = (char.traits ?? []).filter((t) =>
    ORIGINS.includes(t.toUpperCase())
  );
  const roleTraits = (char.traits ?? []).filter((t) =>
    ROLES.includes(t.toUpperCase())
  );

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative h-20 w-20 overflow-hidden rounded-xl bg-[var(--color-surface)]">
        <CharPortrait
            src={char.portrait}
            name={char.name ?? "?"}
            imgClassName="h-full w-full object-cover"
            fallbackClassName="flex h-full w-full items-center justify-center text-xl font-bold text-[var(--color-muted)]"
          />
      </div>
      <span className="w-20 truncate text-center text-[10px] font-semibold text-[var(--color-foreground)]">
        {char.name ?? char.id}
      </span>
      <div className="flex flex-wrap justify-center gap-0.5">
        {originTraits.map((t) => (
          <span
            key={t}
            className="rounded px-1 py-0.5 text-[8px] font-bold uppercase text-white"
            style={{ backgroundColor: ORIGIN_COLORS[t.toUpperCase()] ?? "#666" }}
          >
            {t}
          </span>
        ))}
        {roleTraits.map((t) => (
          <span
            key={t}
            className="text-[8px] font-medium uppercase text-[var(--color-muted)]"
          >
            {t}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function HeroesPageClient() {
  const [allChars, setAllChars] = useState<GameCharacter[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("Playable");
  const [originFilter, setOriginFilter] = useState("All Origins");
  const [roleFilter, setRoleFilter] = useState("All Roles");
  const [sortBy, setSortBy] = useState("Name A → Z");
  const [page, setPage] = useState(1);
  const [selectedCharId, setSelectedCharId] = useState<string | null>(null);
  const fetchedRef = useRef(false);

  const fetchChars = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/msf/characters");
      if (!res.ok) throw new Error("Failed to load characters");
      const data = (await res.json()) as GameApiResponse;
      setAllChars(data.data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!fetchedRef.current) {
      fetchedRef.current = true;
      fetchChars();
    }
  }, [fetchChars]);

  // Filtering
  let filtered = allChars;
  if (statusFilter === "Playable") {
    filtered = filtered.filter((c) => c.status === "playable");
  }
  if (originFilter !== "All Origins") {
    filtered = filtered.filter((c) =>
      (c.traits ?? []).some((t) => t.toUpperCase() === originFilter.toUpperCase())
    );
  }
  if (roleFilter !== "All Roles") {
    filtered = filtered.filter((c) =>
      (c.traits ?? []).some((t) => t.toUpperCase() === roleFilter.toUpperCase())
    );
  }
  if (search.trim()) {
    const q = search.trim().toLowerCase();
    filtered = filtered.filter((c) =>
      (c.name ?? "").toLowerCase().includes(q)
    );
  }

  // Sort
  if (sortBy === "Name A → Z") {
    filtered = [...filtered].sort((a, b) =>
      (a.name ?? "").localeCompare(b.name ?? "")
    );
  } else {
    filtered = [...filtered].sort((a, b) =>
      (b.name ?? "").localeCompare(a.name ?? "")
    );
  }

  const totalPages = Math.ceil(filtered.length / PER_PAGE);
  const paginated = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  // Reset page on filter change
  useEffect(() => {
    setPage(1);
  }, [search, statusFilter, originFilter, roleFilter, sortBy]);

  if (selectedCharId) {
    return (
      <CharacterDetailView
        characterId={selectedCharId}
        onBack={() => setSelectedCharId(null)}
      />
    );
  }

  if (loading) {
    return (
      <div className="space-y-4 px-4 py-6">
        <div className="h-8 w-48 animate-pulse rounded bg-[var(--color-surface)]" />
        <div className="h-10 w-full animate-pulse rounded-lg bg-[var(--color-surface)]" />
        <div className="grid grid-cols-4 gap-3">
          {Array.from({ length: 16 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl bg-[var(--color-surface)]" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center px-4 py-12 text-center">
        <p className="mb-4 text-sm text-[var(--color-muted)]">{error}</p>
        <button
          onClick={() => { fetchedRef.current = false; fetchChars(); }}
          className="rounded-lg bg-[var(--color-accent)] px-6 py-2 text-sm font-semibold text-white"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="px-4 py-4">
      {/* Title */}
      <h2 className="text-xl font-bold text-[var(--color-foreground)]">
        Character Database
      </h2>
      <p className="mb-4 text-xs text-[var(--color-muted)]">
        Browse, search, and filter all {allChars.length} characters.
      </p>

      {/* Search */}
      <input
        type="text"
        placeholder="Search characters..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="mb-3 w-full rounded-lg border border-[var(--color-surface-light)] bg-[var(--color-surface)] px-4 py-2.5 text-sm text-[var(--color-foreground)] placeholder-[var(--color-muted)] outline-none focus:border-[var(--color-accent)]"
      />

      {/* Filters row 1 */}
      <div className="mb-2 flex gap-2">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-lg border border-[var(--color-surface-light)] bg-[var(--color-surface)] px-3 py-2 text-xs text-[var(--color-foreground)]"
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
        <select
          value={originFilter}
          onChange={(e) => setOriginFilter(e.target.value)}
          className="rounded-lg border border-[var(--color-surface-light)] bg-[var(--color-surface)] px-3 py-2 text-xs text-[var(--color-foreground)]"
        >
          <option value="All Origins">All Origins</option>
          {ORIGINS.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          className="rounded-lg border border-[var(--color-surface-light)] bg-[var(--color-surface)] px-3 py-2 text-xs text-[var(--color-foreground)]"
        >
          <option value="All Roles">All Roles</option>
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </div>

      {/* Sort */}
      <div className="mb-4 flex gap-2">
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
          className="rounded-lg border border-[var(--color-surface-light)] bg-[var(--color-surface)] px-3 py-2 text-xs text-[var(--color-foreground)]"
        >
          {SORT_OPTIONS.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      </div>

      {/* Results count & pagination */}
      <p className="mb-3 text-xs text-[var(--color-muted)]">
        {filtered.length} characters found · Page {page} of {totalPages || 1}
      </p>

      {/* Character grid */}
      <div className="grid grid-cols-4 gap-3">
        {paginated.map((char) => (
          <button
            key={char.id}
            onClick={() => setSelectedCharId(char.id)}
            className="transition-transform active:scale-95"
          >
            <HeroCard char={char} />
          </button>
        ))}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-center gap-3">
          <button
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
            className="rounded-lg bg-[var(--color-surface)] px-4 py-2 text-sm text-[var(--color-foreground)] disabled:opacity-30"
          >
            ← Prev
          </button>
          <span className="text-xs text-[var(--color-muted)]">
            {page} / {totalPages}
          </span>
          <button
            disabled={page >= totalPages}
            onClick={() => setPage(page + 1)}
            className="rounded-lg bg-[var(--color-surface)] px-4 py-2 text-sm text-[var(--color-foreground)] disabled:opacity-30"
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}
