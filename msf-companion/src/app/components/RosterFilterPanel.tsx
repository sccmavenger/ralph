"use client";

import { useState } from "react";
import type { RosterFilters } from "@/lib/roster-filters";
import { DEFAULT_FILTERS } from "@/lib/roster-filters";

const ORIGIN_TRAITS = ["BIO", "MUTANT", "SKILL", "MYSTIC", "TECH"];
const ALIGNMENT_TRAITS = ["HERO", "VILLAIN"];
const LOCATION_TRAITS = ["CITY", "GLOBAL", "COSMIC"];
const ROLE_TRAITS = [
  "PROTECTOR",
  "BRAWLER",
  "CONTROLLER",
  "BLASTER",
  "SUPPORT",
];

function RangeSlider({
  label,
  min,
  max,
  valueMin,
  valueMax,
  onChangeMin,
  onChangeMax,
}: {
  label: string;
  min: number;
  max: number;
  valueMin: number;
  valueMax: number;
  onChangeMin: (v: number) => void;
  onChangeMax: (v: number) => void;
}) {
  return (
    <div className="mb-4">
      <label className="mb-1 block text-xs font-medium text-[var(--color-muted)]">
        {label}: {valueMin} — {valueMax}
      </label>
      <div className="flex items-center gap-2">
        <input
          type="range"
          min={min}
          max={max}
          value={valueMin}
          onChange={(e) => onChangeMin(Number(e.target.value))}
          className="flex-1 accent-[var(--color-accent)]"
        />
        <input
          type="range"
          min={min}
          max={max}
          value={valueMax}
          onChange={(e) => onChangeMax(Number(e.target.value))}
          className="flex-1 accent-[var(--color-accent)]"
        />
      </div>
    </div>
  );
}

function MultiSelectPills({
  label,
  options,
  selected,
  onToggle,
}: {
  label: string;
  options: string[];
  selected: string[];
  onToggle: (value: string) => void;
}) {
  return (
    <div className="mb-4">
      <label className="mb-2 block text-xs font-medium text-[var(--color-muted)]">
        {label}
      </label>
      <div className="flex flex-wrap gap-1.5">
        {options.map((opt) => {
          const isSelected = selected.includes(opt);
          return (
            <button
              key={opt}
              onClick={() => onToggle(opt)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                isSelected
                  ? "bg-[var(--color-accent)] text-white"
                  : "bg-[var(--color-surface-light)] text-[var(--color-muted)]"
              }`}
            >
              {opt}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function RosterFilterPanel({
  filters,
  onChange,
  teams,
  onClose,
}: {
  filters: RosterFilters;
  onChange: (filters: RosterFilters) => void;
  teams: string[];
  onClose: () => void;
}) {
  const [search, setSearch] = useState("");

  const filteredTeams = teams.filter((t) =>
    t.toLowerCase().includes(search.toLowerCase())
  );

  function toggleArray(arr: string[], value: string): string[] {
    return arr.includes(value)
      ? arr.filter((v) => v !== value)
      : [...arr, value];
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[var(--color-background)]">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[var(--color-surface-light)] px-4 py-3">
        <h2 className="text-lg font-bold text-[var(--color-foreground)]">
          Filters
        </h2>
        <div className="flex gap-3">
          <button
            onClick={() => onChange({ ...DEFAULT_FILTERS })}
            className="text-sm text-[var(--color-muted)]"
          >
            Clear All
          </button>
          <button
            onClick={onClose}
            className="text-sm font-semibold text-[var(--color-accent)]"
          >
            Done
          </button>
        </div>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {/* Teams */}
        <div className="mb-4">
          <label className="mb-2 block text-xs font-medium text-[var(--color-muted)]">
            Teams &amp; Traits
          </label>
          <input
            type="text"
            placeholder="Search teams and traits..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="mb-2 w-full rounded-lg border border-[var(--color-surface-light)] bg-[var(--color-surface)] px-3 py-2 text-xs text-[var(--color-foreground)] placeholder-[var(--color-muted)] outline-none focus:border-[var(--color-accent)]"
          />
          <div className="flex max-h-32 flex-wrap gap-1.5 overflow-y-auto">
            {filteredTeams.map((team) => {
              const isSelected = filters.teams.includes(team);
              return (
                <button
                  key={team}
                  onClick={() =>
                    onChange({
                      ...filters,
                      teams: toggleArray(filters.teams, team),
                    })
                  }
                  className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
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
        </div>

        {/* Origin Traits */}
        <MultiSelectPills
          label="Origin"
          options={ORIGIN_TRAITS}
          selected={filters.origins}
          onToggle={(val) =>
            onChange({
              ...filters,
              origins: toggleArray(filters.origins, val),
            })
          }
        />

        {/* Alignment Traits */}
        <MultiSelectPills
          label="Alignment"
          options={ALIGNMENT_TRAITS}
          selected={filters.alignments}
          onToggle={(val) =>
            onChange({
              ...filters,
              alignments: toggleArray(filters.alignments, val),
            })
          }
        />

        {/* Location Traits */}
        <MultiSelectPills
          label="Location"
          options={LOCATION_TRAITS}
          selected={filters.locations}
          onToggle={(val) =>
            onChange({
              ...filters,
              locations: toggleArray(filters.locations, val),
            })
          }
        />

        {/* Role Traits */}
        <MultiSelectPills
          label="Role"
          options={ROLE_TRAITS}
          selected={filters.roles}
          onToggle={(val) =>
            onChange({
              ...filters,
              roles: toggleArray(filters.roles, val),
            })
          }
        />

        {/* Star Progression */}
        <div className="mb-2">
          <p className="mb-1 text-[10px] text-[var(--color-muted)]">
            Progression: ★ Yellow → ★ Red → ◆ Diamond
          </p>
        </div>

        {/* Yellow Stars */}
        <RangeSlider
          label="★ Yellow Stars"
          min={0}
          max={7}
          valueMin={filters.yellowStarMin}
          valueMax={filters.yellowStarMax}
          onChangeMin={(v) =>
            onChange({
              ...filters,
              yellowStarMin: Math.min(v, filters.yellowStarMax),
            })
          }
          onChangeMax={(v) =>
            onChange({
              ...filters,
              yellowStarMax: Math.max(v, filters.yellowStarMin),
            })
          }
        />

        {/* Red Stars */}
        <RangeSlider
          label="★ Red Stars"
          min={0}
          max={7}
          valueMin={filters.redStarMin}
          valueMax={filters.redStarMax}
          onChangeMin={(v) =>
            onChange({
              ...filters,
              redStarMin: Math.min(v, filters.redStarMax),
            })
          }
          onChangeMax={(v) =>
            onChange({
              ...filters,
              redStarMax: Math.max(v, filters.redStarMin),
            })
          }
        />

        {/* Diamonds */}
        <RangeSlider
          label="◆ Diamonds"
          min={0}
          max={5}
          valueMin={filters.diamondMin}
          valueMax={filters.diamondMax}
          onChangeMin={(v) =>
            onChange({
              ...filters,
              diamondMin: Math.min(v, filters.diamondMax),
            })
          }
          onChangeMax={(v) =>
            onChange({
              ...filters,
              diamondMax: Math.max(v, filters.diamondMin),
            })
          }
        />

        {/* Gear Tier */}
        <RangeSlider
          label="Gear Tier"
          min={0}
          max={20}
          valueMin={filters.gearTierMin}
          valueMax={filters.gearTierMax}
          onChangeMin={(v) =>
            onChange({
              ...filters,
              gearTierMin: Math.min(v, filters.gearTierMax),
            })
          }
          onChangeMax={(v) =>
            onChange({
              ...filters,
              gearTierMax: Math.max(v, filters.gearTierMin),
            })
          }
        />

        {/* Power Level */}
        <div className="mb-4">
          <label className="mb-1 block text-xs font-medium text-[var(--color-muted)]">
            Power Range
          </label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={0}
              placeholder="Min"
              value={filters.powerMin || ""}
              onChange={(e) =>
                onChange({
                  ...filters,
                  powerMin: Math.max(Number(e.target.value) || 0, 0),
                })
              }
              className="w-full rounded-lg border border-[var(--color-surface-light)] bg-[var(--color-surface)] px-3 py-2 text-xs text-[var(--color-foreground)] outline-none focus:border-[var(--color-accent)]"
            />
            <span className="text-xs text-[var(--color-muted)]">—</span>
            <input
              type="number"
              min={0}
              placeholder="Max"
              value={filters.powerMax === Infinity ? "" : filters.powerMax}
              onChange={(e) =>
                onChange({
                  ...filters,
                  powerMax: e.target.value
                    ? Math.max(Number(e.target.value) || 0, 0)
                    : Infinity,
                })
              }
              className="w-full rounded-lg border border-[var(--color-surface-light)] bg-[var(--color-surface)] px-3 py-2 text-xs text-[var(--color-foreground)] outline-none focus:border-[var(--color-accent)]"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
