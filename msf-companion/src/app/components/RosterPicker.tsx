"use client";

import { useState, useMemo, useCallback } from "react";
import type { TeamCharacter, MetaModeData } from "@/lib/team-analysis";
import { CharPortrait } from "@/app/components/CharPortrait";

interface RosterPickerProps {
  roster: TeamCharacter[];
  selectedIds: string[];
  metaData: MetaModeData[];
  selectedMode: string | null;
  maxSelectable: number;
  onConfirm: (characters: TeamCharacter[]) => void;
  onClose: () => void;
}

const ORIGIN_CHIPS = ["Bio", "Mutant", "Skill", "Mystic", "Tech"];
const ALIGNMENT_CHIPS = ["Hero", "Villain"];
const LOCATION_CHIPS = ["City", "Global", "Cosmic"];
const ROLE_CHIPS = ["Brawler", "Blaster", "Controller", "Protector", "Support"];

const TRAIT_CATEGORIES = [
  { id: "origin", label: "Origin", options: ORIGIN_CHIPS },
  { id: "alignment", label: "Alignment", options: ALIGNMENT_CHIPS },
  { id: "location", label: "Location", options: LOCATION_CHIPS },
  { id: "role", label: "Role", options: ROLE_CHIPS },
] as const;

type TraitCategory = (typeof TRAIT_CATEGORIES)[number]["id"];

export default function RosterPicker({
  roster,
  selectedIds,
  metaData,
  selectedMode,
  maxSelectable,
  onConfirm,
  onClose,
}: RosterPickerProps) {
  const [search, setSearch] = useState("");
  const [activeTraits, setActiveTraits] = useState<Record<TraitCategory, Set<string>>>(() => ({
    origin: new Set(),
    alignment: new Set(),
    location: new Set(),
    role: new Set(),
  }));
  const [pickerSelection, setPickerSelection] = useState<TeamCharacter[]>([]);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const pickerIds = useMemo(() => new Set(pickerSelection.map((c) => c.id)), [pickerSelection]);
  const canSelectMore = pickerSelection.length < maxSelectable;

  // Build popularity set for the selected mode
  const popularIds = useMemo(() => {
    const popular = new Set<string>();
    if (!selectedMode || selectedMode === "all") return popular;
    const modeEntry = metaData.find((m) => m.mode === selectedMode);
    if (!modeEntry) return popular;
    for (const team of modeEntry.teams) {
      if (team.total >= 100) {
        for (const id of team.squad) {
          popular.add(id);
        }
      }
    }
    return popular;
  }, [metaData, selectedMode]);

  const toggleTrait = useCallback((category: TraitCategory, trait: string) => {
    setActiveTraits((prev) => {
      const next = new Set(prev[category]);
      if (next.has(trait)) {
        next.delete(trait);
      } else {
        next.add(trait);
      }
      return { ...prev, [category]: next };
    });
  }, []);

  const togglePickerChar = useCallback((char: TeamCharacter) => {
    setPickerSelection((prev) => {
      const exists = prev.find((c) => c.id === char.id);
      if (exists) return prev.filter((c) => c.id !== char.id);
      if (prev.length >= maxSelectable) return prev;
      return [...prev, char];
    });
  }, [maxSelectable]);

  const filtered = useMemo(() => {
    let chars = roster;

    // Search filter
    if (search) {
      const lower = search.toLowerCase();
      chars = chars.filter((c) => c.name.toLowerCase().includes(lower));
    }

    // OR within each trait category, AND across categories.
    chars = chars.filter((character) =>
      TRAIT_CATEGORIES.every(({ id }) => {
        const selected = activeTraits[id];
        return selected.size === 0 || character.traits.some((trait) => selected.has(trait));
      }),
    );

    return chars;
  }, [roster, search, activeTraits]);

  return (
    <div
      data-testid="roster-picker"
      className="fixed inset-0 z-50 flex flex-col bg-[var(--color-background)]"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-surface-light)]">
        <h2 className="text-lg font-bold text-[var(--color-foreground)]">
          Select Characters{maxSelectable > 1 ? ` (${pickerSelection.length}/${maxSelectable})` : ""}
        </h2>
        <button
          onClick={onClose}
          className="text-[var(--color-muted)] text-2xl leading-none"
          aria-label="Close"
        >
          ×
        </button>
      </div>

      {/* Search */}
      <div className="px-4 py-2">
        <input
          data-testid="roster-search"
          type="text"
          placeholder="Search by name..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-lg bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-foreground)] placeholder-[var(--color-muted)] outline-none"
        />
      </div>

      {/* Trait chips */}
      <div className="space-y-2 px-4 pb-2">
        {TRAIT_CATEGORIES.map(({ id, label, options }) => (
          <div key={id}>
            <p className="mb-1 text-[10px] font-semibold text-[var(--color-muted)]">
              {label}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {options.map((trait) => (
                <button
                  key={trait}
                  data-testid={`roster-trait-chip-${trait}`}
                  onClick={() => toggleTrait(id, trait)}
                  className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                    activeTraits[id].has(trait)
                      ? "bg-[var(--color-accent)] text-white"
                      : "bg-[var(--color-surface)] text-[var(--color-muted)]"
                  }`}
                >
                  {trait}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Character grid */}
      <div className="flex-1 overflow-y-auto px-4 pb-20">
        <div className="grid grid-cols-4 gap-2">
          {filtered.map((char) => {
            const isOnTeam = selectedSet.has(char.id);
            const isPickerSelected = pickerIds.has(char.id);
            const isDisabled = isOnTeam || (!isPickerSelected && !canSelectMore);
            const isPopular = popularIds.has(char.id);

            return (
              <button
                key={char.id}
                data-testid={`roster-char-${char.id}`}
                onClick={() => {
                  if (!isOnTeam) togglePickerChar(char);
                }}
                disabled={isDisabled}
                className={`relative flex flex-col items-center rounded-lg bg-[var(--color-surface)] p-1.5 ${
                  isOnTeam
                    ? "opacity-30"
                    : isPickerSelected
                    ? "ring-2 ring-[var(--color-accent)] bg-[var(--color-accent)]/10"
                    : isDisabled
                    ? "opacity-40"
                    : "active:bg-[var(--color-surface-light)]"
                }`}
              >
                {/* Portrait */}
                <div className="relative h-12 w-12 overflow-hidden rounded-md bg-[var(--color-surface-light)]">
                  <CharPortrait
                    src={char.portrait}
                    name={char.name}
                    imgClassName="h-full w-full object-cover"
                    fallbackClassName="flex h-full w-full items-center justify-center text-xs font-bold text-[var(--color-muted)]"
                  />
                  {isPopular && (
                    <div
                      data-testid={`roster-char-popular-${char.id}`}
                      className="absolute -top-0.5 -right-0.5 rounded-full bg-orange-500 px-1 text-[8px] text-white"
                      title="Popular in this mode"
                    >
                      🔥
                    </div>
                  )}
                </div>
                {/* Name */}
                <span className="mt-0.5 text-center text-[9px] leading-tight text-[var(--color-foreground)] line-clamp-1">
                  {char.name}
                </span>
                {/* Power & Stars */}
                <span className="text-[8px] text-[var(--color-muted)]">
                  ⭐{char.yellowStars} · {(char.power / 1000).toFixed(0)}k
                </span>
                {/* Selection check */}
                {isPickerSelected && (
                  <div className="absolute top-0.5 left-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-[var(--color-accent)] text-[10px] text-white">
                    ✓
                  </div>
                )}
              </button>
            );
          })}
        </div>
        {filtered.length === 0 && (
          <p className="py-10 text-center text-sm text-[var(--color-muted)]">
            {roster.length === 0
              ? "No roster characters are available."
              : "No characters match your search and filters."}
          </p>
        )}
      </div>

      {/* Confirm button */}
      {pickerSelection.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-[var(--color-surface-light)] bg-[var(--color-background)] px-4 py-3">
          <button
            data-testid="roster-confirm-btn"
            onClick={() => onConfirm(pickerSelection)}
            className="w-full rounded-lg bg-[var(--color-accent)] py-3 text-sm font-semibold text-white"
          >
            Add {pickerSelection.length} Character{pickerSelection.length !== 1 ? "s" : ""}
          </button>
        </div>
      )}
    </div>
  );
}
