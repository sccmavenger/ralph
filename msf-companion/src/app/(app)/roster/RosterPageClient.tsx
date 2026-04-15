"use client";

import { useState } from "react";
import RosterList from "../../components/RosterList";
import RosterFilterPanel from "../../components/RosterFilterPanel";
import CharacterDetailView from "../../components/CharacterDetailView";
import GameRosterView from "../../components/GameRosterView";
import PremiumGate from "../../components/PremiumGate";
import type { RosterFilters, RosterCharacter } from "@/lib/roster-filters";
import { DEFAULT_FILTERS, countActiveFilters } from "@/lib/roster-filters";

type RosterTab = "my" | "game";

export default function RosterPageClient({
  teams,
  isPremium,
}: {
  teams: string[];
  isPremium: boolean;
}) {
  const [tab, setTab] = useState<RosterTab>("my");
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<RosterFilters>({
    ...DEFAULT_FILTERS,
  });
  const [selectedCharacter, setSelectedCharacter] =
    useState<RosterCharacter | null>(null);
  const [selectedGameCharId, setSelectedGameCharId] = useState<string | null>(
    null
  );
  const [ownedCharacters, setOwnedCharacters] = useState<RosterCharacter[]>(
    []
  );

  const activeCount = countActiveFilters(filters);

  if (selectedGameCharId) {
    const owned = ownedCharacters.find((c) => c.id === selectedGameCharId);
    return (
      <CharacterDetailView
        characterId={selectedGameCharId}
        rosterData={
          owned
            ? {
                yellowStars: owned.yellowStars,
                redStars: owned.redStars,
                gearTier: owned.gearTier,
                level: owned.level,
                power: owned.power,
              }
            : undefined
        }
        onBack={() => setSelectedGameCharId(null)}
      />
    );
  }

  if (selectedCharacter) {
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
        onBack={() => setSelectedCharacter(null)}
      />
    );
  }

  return (
    <div className="px-4 py-4">
      {/* Toggle + Filter button */}
      <div className="mb-4 flex items-center gap-2">
        <div className="flex flex-1 rounded-lg bg-[var(--color-surface)] p-1">
          <button
            onClick={() => setTab("my")}
            className={`flex-1 rounded-md px-4 py-2 text-sm font-semibold transition-colors ${
              tab === "my"
                ? "bg-[var(--color-accent)] text-white"
                : "text-[var(--color-muted)]"
            }`}
          >
            My Roster
          </button>
          <button
            onClick={() => setTab("game")}
            className={`flex-1 rounded-md px-4 py-2 text-sm font-semibold transition-colors ${
              tab === "game"
                ? "bg-[var(--color-accent)] text-white"
                : "text-[var(--color-muted)]"
            }`}
          >
            Game Roster
          </button>
        </div>

        {tab === "my" && (
          <button
            onClick={() => setShowFilters(true)}
            className="relative flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--color-surface)]"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--color-muted)"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
            </svg>
            {activeCount > 0 && (
              <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-[var(--color-accent)] text-[10px] font-bold text-white">
                {activeCount}
              </span>
            )}
          </button>
        )}
      </div>

      {tab === "my" ? (
        <RosterList
          filters={filters}
          onCharacterClick={(char) => setSelectedCharacter(char)}
          onCharactersLoaded={setOwnedCharacters}
        />
      ) : (
        <GameRosterView
          ownedCharacters={ownedCharacters}
          teams={teams}
          onCharacterClick={(id) => setSelectedGameCharId(id)}
        />
      )}

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
