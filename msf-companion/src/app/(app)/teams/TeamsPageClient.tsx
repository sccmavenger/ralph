"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import RosterPicker from "@/app/components/RosterPicker";
import { CharPortrait } from "@/app/components/CharPortrait";
import type { TeamCharacter, MetaModeData } from "@/lib/team-analysis";
import {
  analyzeTraitOverlap,
  detectPassiveSynergies,
  calculateTeamStats,
  compareToMeta,
  suggestCharacters,
} from "@/lib/team-analysis";
import type { TeamStatsResult, CharacterSuggestion } from "@/lib/team-analysis";

const GAME_MODES = [
  { id: "all", label: "All Modes" },
  { id: "arena", label: "Arena" },
  { id: "war", label: "War" },
  { id: "crucible", label: "Crucible" },
  { id: "raids", label: "Raids" },
  { id: "blitz", label: "Blitz" },
  { id: "tower", label: "Tower" },
];

export default function TeamsPageClient() {
  const [selectedMode, setSelectedMode] = useState("all");
  const [team, setTeam] = useState<(TeamCharacter | null)[]>([null, null, null, null, null]);
  const [roster, setRoster] = useState<TeamCharacter[]>([]);
  const [metaData, setMetaData] = useState<MetaModeData[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [showPrebuilt, setShowPrebuilt] = useState(false);
  const [teamName, setTeamName] = useState<string | null>(null);

  // Fetch roster and meta data
  useEffect(() => {
    async function fetchData() {
      try {
        const [rosterRes, metaRes] = await Promise.all([
          fetch("/api/msf/team-builder/roster"),
          fetch("/api/msf/team-builder/meta"),
        ]);
        if (rosterRes.ok) {
          const rosterJson = await rosterRes.json();
          setRoster(rosterJson.data ?? []);
        }
        if (metaRes.ok) {
          const metaJson = await metaRes.json();
          setMetaData(metaJson.data ?? []);
        }
      } catch {
        // Silently handle — roster/meta will be empty
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  const selectedIds = useMemo(
    () => team.filter((c): c is TeamCharacter => c !== null).map((c) => c.id),
    [team]
  );

  const teamCount = selectedIds.length;

  const handleMultiSelect = useCallback(
    (chars: TeamCharacter[]) => {
      setTeam((prev) => {
        const next = [...prev];
        let charIdx = 0;
        for (let i = 0; i < 5 && charIdx < chars.length; i++) {
          if (next[i] === null) {
            next[i] = chars[charIdx];
            charIdx++;
          }
        }
        return next;
      });
      setPickerOpen(false);
    },
    []
  );

  const handleRemove = useCallback((slotIndex: number) => {
    setTeam((prev) => {
      const next = [...prev];
      next[slotIndex] = null;
      return next;
    });
    setTeamName(null);
  }, []);

  const openPicker = useCallback(() => {
    setPickerOpen(true);
  }, []);

  // Number of empty slots available
  const emptySlotCount = team.filter((c) => c === null).length;

  // Top prebuilt meta teams for the selected mode (only teams where all 5 chars are in roster)
  const prebuiltTeams = useMemo(() => {
    if (roster.length === 0 || metaData.length === 0) return [];
    const rosterMap = new Map(roster.map((c) => [c.id, c]));
    const modes = selectedMode === "all" ? metaData : metaData.filter((m) => m.mode === selectedMode);
    const seen = new Set<string>();
    const results: { mode: string; squad: TeamCharacter[]; total: number }[] = [];
    for (const modeEntry of modes) {
      for (const t of modeEntry.teams) {
        if (t.squad.length !== 5) continue;
        const key = [...t.squad].sort().join(",");
        if (seen.has(key)) continue;
        const chars = t.squad.map((id) => rosterMap.get(id)).filter((c): c is TeamCharacter => c != null);
        if (chars.length !== 5) continue; // Player doesn't own all 5
        seen.add(key);
        results.push({ mode: modeEntry.mode, squad: chars, total: t.total });
      }
    }
    results.sort((a, b) => b.total - a.total);
    return results.slice(0, 20);
  }, [roster, metaData, selectedMode]);

  const handleLoadPrebuilt = useCallback(
    (chars: TeamCharacter[]) => {
      setTeam(chars.slice(0, 5).map((c) => c));
      setShowPrebuilt(false);
      // Derive team name from the most common shared "team" trait
      const ORIGIN = new Set(["Bio", "Mutant", "Skill", "Mystic", "Tech", "Cosmic"]);
      const ROLE = new Set(["Brawler", "Blaster", "Controller", "Protector", "Support"]);
      const AFFINITY = new Set(["Hero", "Villain"]);
      const traitCounts = new Map<string, number>();
      for (const c of chars) {
        for (const t of c.traits) {
          if (!ORIGIN.has(t) && !ROLE.has(t) && !AFFINITY.has(t)) {
            traitCounts.set(t, (traitCounts.get(t) ?? 0) + 1);
          }
        }
      }
      let best: string | null = null;
      let bestCount = 0;
      for (const [trait, count] of traitCounts) {
        if (count > bestCount) { best = trait; bestCount = count; }
      }
      setTeamName(bestCount >= 3 ? best : null);
    },
    []
  );

  // Analysis computations (only when full team)
  const teamChars = useMemo(
    () => team.filter((c): c is TeamCharacter => c !== null),
    [team]
  );

  const traitOverlap = useMemo(
    () => (teamCount === 5 ? analyzeTraitOverlap(teamChars) : null),
    [teamCount, teamChars]
  );

  const synergies = useMemo(
    () => (teamCount === 5 ? detectPassiveSynergies(teamChars, selectedMode) : null),
    [teamCount, teamChars, selectedMode]
  );

  const teamStats = useMemo(
    () => (teamCount === 5 ? calculateTeamStats(teamChars) : null),
    [teamCount, teamChars]
  );

  const metaComparison = useMemo(
    () => (teamCount === 5 ? compareToMeta(selectedIds, metaData, selectedMode) : null),
    [teamCount, selectedIds, metaData, selectedMode]
  );

  const suggestions = useMemo(
    () => (teamCount >= 1 && teamCount < 5 ? suggestCharacters(selectedIds, roster, metaData, selectedMode) : []),
    [teamCount, selectedIds, roster, metaData, selectedMode]
  );

  const handleSuggestFill = useCallback(
    (char: CharacterSuggestion) => {
      const emptyIdx = team.findIndex((c) => c === null);
      if (emptyIdx < 0) return;
      const rosterChar = roster.find((r) => r.id === char.characterId);
      if (!rosterChar) return;
      setTeam((prev) => {
        const next = [...prev];
        next[emptyIdx] = rosterChar;
        return next;
      });
    },
    [team, roster]
  );

  const handleAutoFill = useCallback(() => {
    setTeam((prev) => {
      const next = [...prev];
      const currentIds = new Set(next.filter((c): c is TeamCharacter => c !== null).map((c) => c.id));
      let suggIdx = 0;
      for (let i = 0; i < 5; i++) {
        if (next[i] === null && suggIdx < suggestions.length) {
          // Find next suggestion not already on team
          while (suggIdx < suggestions.length && currentIds.has(suggestions[suggIdx].characterId)) {
            suggIdx++;
          }
          if (suggIdx < suggestions.length) {
            const rosterChar = roster.find((r) => r.id === suggestions[suggIdx].characterId);
            if (rosterChar) {
              next[i] = rosterChar;
              currentIds.add(rosterChar.id);
            }
            suggIdx++;
          }
        }
      }
      return next;
    });
    setShowSuggestions(false);
  }, [suggestions, roster]);

  if (loading) {
    return (
      <div className="px-4 py-4">
        <div className="animate-pulse space-y-4">
          <div className="h-6 w-32 rounded bg-[var(--color-surface)]" />
          <div className="h-10 rounded bg-[var(--color-surface)]" />
          <div className="flex gap-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-16 w-16 rounded-lg bg-[var(--color-surface)]" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 py-4">
      <h2 className="text-xl font-bold text-[var(--color-foreground)]">
        Team Builder
      </h2>
      <p className="mb-4 text-xs text-[var(--color-muted)]">
        Assemble a 5-character team and see combined synergies and power.
      </p>

      {/* Prebuilt Teams Toggle */}
      <div className="mb-3">
        <button
          data-testid="prebuilt-toggle"
          onClick={() => setShowPrebuilt(!showPrebuilt)}
          className={`w-full rounded-lg py-2 text-xs font-semibold transition-colors ${
            showPrebuilt
              ? "bg-[var(--color-accent)] text-white"
              : "bg-[var(--color-surface)] text-[var(--color-foreground)]"
          }`}
        >
          {showPrebuilt ? "Hide Prebuilt Teams" : "\u2B50 Load a Prebuilt Team"}
        </button>
      </div>

      {/* Prebuilt Teams Panel */}
      {showPrebuilt && (
        <div data-testid="prebuilt-panel" className="mb-4 rounded-xl bg-[var(--color-surface)] p-4">
          <h3 className="mb-1 text-sm font-bold text-[var(--color-foreground)]">
            Popular Teams {selectedMode !== "all" ? `in ${GAME_MODES.find((m) => m.id === selectedMode)?.label}` : ""}
          </h3>
          <p className="mb-3 text-xs text-[var(--color-muted)]">
            Top meta teams you own all 5 characters for. Tap to load.
          </p>
          {prebuiltTeams.length > 0 ? (
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {prebuiltTeams.map((pt, idx) => (
                <button
                  key={idx}
                  data-testid={`prebuilt-team-${idx}`}
                  onClick={() => handleLoadPrebuilt(pt.squad)}
                  className="flex w-full items-center gap-3 rounded-lg bg-[var(--color-surface-light)] p-3 text-left active:bg-[var(--color-accent)]/10"
                >
                  <div className="flex -space-x-1.5">
                    {pt.squad.map((c) => (
                      <CharPortrait
                        key={c.id}
                        src={c.portrait}
                        name={c.name}
                        imgClassName="h-9 w-9 rounded-full border-2 border-[var(--color-surface)] object-cover"
                        fallbackClassName="flex h-9 w-9 items-center justify-center rounded-full border-2 border-[var(--color-surface)] bg-[var(--color-surface)] text-[9px] font-bold text-[var(--color-muted)]"
                      />
                    ))}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-[var(--color-foreground)] truncate">
                      {pt.squad.map((c) => c.name).join(", ")}
                    </div>
                    <div className="text-[11px] text-[var(--color-muted)]">
                      {pt.total.toLocaleString()} teams · {pt.mode}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <p className="text-xs text-[var(--color-muted)]">
              No prebuilt teams found{selectedMode !== "all" ? " for this mode" : ""} where you own all 5 characters.
            </p>
          )}
        </div>
      )}

      {/* Game Mode Selector */}
      <div data-testid="mode-selector" className="mb-4 flex gap-2 overflow-x-auto pb-1">
        {GAME_MODES.map((mode) => (
          <button
            key={mode.id}
            data-testid={`mode-chip-${mode.id}`}
            onClick={() => setSelectedMode(mode.id)}
            className={`whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
              selectedMode === mode.id
                ? "bg-[var(--color-accent)] text-white"
                : "bg-[var(--color-surface)] text-[var(--color-muted)]"
            }`}
          >
            {mode.label}
          </button>
        ))}
      </div>

      {/* Team Slots */}
      <div className="mb-6 rounded-xl bg-[var(--color-surface)] p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 data-testid="team-count" className="text-sm font-bold text-[var(--color-foreground)]">
            Team ({teamCount}/5)
          </h3>
        </div>
        <div className="flex justify-around gap-2">
          {team.map((char, i) => (
            <div key={i} className="relative">
              {char ? (
                <button
                  data-testid={`team-slot-${i + 1}`}
                  className="relative flex h-16 w-16 flex-col items-center justify-center rounded-lg bg-[var(--color-surface-light)]"
                  onClick={() => handleRemove(i)}
                >
                  <CharPortrait
                    src={char.portrait}
                    name={char.name}
                    imgClassName="h-12 w-12 rounded-md object-cover"
                    fallbackClassName="flex h-12 w-12 items-center justify-center rounded-md bg-[var(--color-surface)] text-xs font-bold text-[var(--color-muted)]"
                  />
                  <span className="mt-0.5 text-[8px] text-[var(--color-foreground)] line-clamp-1">
                    {char.name}
                  </span>
                  <span className="text-[7px] text-[var(--color-muted)]">
                    {(char.power / 1000).toFixed(0)}k
                  </span>
                  {/* Remove overlay */}
                  <div
                    data-testid={`team-slot-remove-${i + 1}`}
                    className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-600 text-[10px] text-white"
                  >
                    ×
                  </div>
                </button>
              ) : (
                <button
                  data-testid={`team-slot-${i + 1}`}
                  onClick={() => openPicker()}
                  className="flex h-16 w-16 items-center justify-center rounded-lg border-2 border-dashed border-[var(--color-surface-light)] text-lg text-[var(--color-muted)]"
                >
                  +
                </button>
              )}
            </div>
          ))}
        </div>

        {/* Add Character button */}
        {emptySlotCount > 0 && (
          <div className="mt-3 flex gap-2">
            <button
              data-testid="team-add-btn"
              onClick={() => openPicker()}
              className="flex-1 rounded-lg bg-[var(--color-accent)] py-2 text-xs font-semibold text-white"
            >
              Add Character
            </button>
            {teamCount >= 1 && teamCount < 5 && (
              <button
                data-testid="suggest-btn"
                onClick={() => setShowSuggestions(!showSuggestions)}
                className="rounded-lg bg-green-600 px-3 py-2 text-xs font-semibold text-white"
              >
                Suggest
              </button>
            )}
          </div>
        )}

        {/* Suggestion Panel */}
        {showSuggestions && suggestions.length > 0 && (
          <div data-testid="suggest-panel" className="mt-3 rounded-lg bg-[var(--color-surface-light)] p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold text-[var(--color-foreground)]">Suggestions</span>
              <button
                data-testid="suggest-auto-fill"
                onClick={handleAutoFill}
                className="rounded bg-green-600 px-2 py-1 text-[10px] font-semibold text-white"
              >
                Auto-Fill All
              </button>
            </div>
            <div className="space-y-1.5">
              {suggestions.slice(0, 5).map((s) => (
                <button
                  key={s.characterId}
                  data-testid={`suggest-char-${s.characterId}`}
                  onClick={() => handleSuggestFill(s)}
                  className="flex w-full items-center gap-2 rounded-lg bg-[var(--color-surface)] p-2 text-left"
                >
                  <CharPortrait
                    src={s.portrait}
                    name={s.name}
                    imgClassName="h-8 w-8 rounded-md object-cover"
                    fallbackClassName="flex h-8 w-8 items-center justify-center rounded-md bg-[var(--color-surface-light)] text-xs font-bold text-[var(--color-muted)]"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium text-[var(--color-foreground)]">{s.name}</div>
                    <div className="text-[9px] text-[var(--color-muted)] truncate">
                      {s.reasons[0] ?? ""}
                    </div>
                  </div>
                  <span className="text-[10px] font-semibold text-[var(--color-accent)]">
                    {s.score.toFixed(1)}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Analysis panels — visible when 5 characters selected */}
      {teamCount < 5 && (
        <p className="text-center text-xs text-[var(--color-muted)]">
          Select 5 characters to see team analysis.
        </p>
      )}

      {teamCount === 5 && (
        <div className="space-y-4">
          {/* Team Stats — first, right under selection */}
          {teamStats && <TeamStatsPanel stats={teamStats} teamChars={teamChars} teamName={teamName} />}

          {/* Trait Overlap (US-059) */}
          <div data-testid="analysis-traits" className="rounded-xl bg-[var(--color-surface)] p-4">
            <h3 className="mb-2 text-sm font-bold text-[var(--color-foreground)]">
              Shared Traits
            </h3>
            {traitOverlap && traitOverlap.sharedTraits.length > 0 ? (
              <div className="space-y-2">
                {traitOverlap.sharedTraits.map((st) => {
                  const colorClass =
                    st.category === "origin" ? "text-blue-400" :
                    st.category === "role" ? "text-green-400" :
                    st.category === "affinity" ? "text-yellow-400" :
                    "text-purple-400";
                  return (
                    <div
                      key={st.trait}
                      data-testid={`trait-item-${st.trait}`}
                      className="flex items-center gap-2"
                    >
                      <span className={`text-xs font-medium ${colorClass}`}>{st.trait}</span>
                      <span
                        data-testid={`trait-count-${st.trait}`}
                        className="rounded-full bg-[var(--color-surface-light)] px-1.5 text-[10px] text-[var(--color-foreground)]"
                      >
                        x{st.count}
                      </span>
                      <div className="flex gap-0.5">
                        {st.characterIds.map((cid) => {
                          const c = teamChars.find((tc) => tc.id === cid);
                          return (
                            <CharPortrait
                              key={cid}
                              src={c?.portrait}
                              name={c?.name ?? "?"}
                              imgClassName="h-5 w-5 rounded-full object-cover"
                              fallbackClassName="flex h-5 w-5 items-center justify-center rounded-full bg-[var(--color-surface-light)] text-[8px] font-bold text-[var(--color-muted)]"
                            />
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-[var(--color-muted)]">No shared traits — this is a diverse team.</p>
            )}
          </div>

          {/* Passive Synergies (US-060) */}
          <div data-testid="analysis-synergies" className="rounded-xl bg-[var(--color-surface)] p-4">
            <h3 className="mb-2 text-sm font-bold text-[var(--color-foreground)]">
              Active Synergies
            </h3>
            {synergies && synergies.synergies.length > 0 ? (
              <div className="space-y-2">
                {synergies.synergies
                  .sort((a, b) => {
                    // Mode-matching first when mode selected
                    if (selectedMode !== "all") {
                      const aMatch = a.applicableMode === selectedMode ? 1 : 0;
                      const bMatch = b.applicableMode === selectedMode ? 1 : 0;
                      if (bMatch !== aMatch) return bMatch - aMatch;
                    }
                    // Active first
                    if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
                    // Then by beneficiary count
                    return b.beneficiaryCount - a.beneficiaryCount;
                  })
                  .map((syn, idx) => (
                    <div
                      key={idx}
                      data-testid={`synergy-item-${idx}`}
                      className={`rounded-lg p-2 ${
                        syn.isActive
                          ? "border border-green-600/40 bg-green-900/10"
                          : "border border-[var(--color-surface-light)] opacity-60"
                      } ${
                        syn.applicableMode && selectedMode !== "all" && syn.applicableMode === selectedMode
                          ? "ring-1 ring-[var(--color-accent)]"
                          : ""
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-[var(--color-foreground)]">
                          {syn.sourceCharacterName}
                        </span>
                        {syn.isActive && (
                          <span data-testid="synergy-active-badge" className="rounded bg-green-700 px-1 text-[9px] text-white">
                            ACTIVE
                          </span>
                        )}
                        {syn.applicableMode && (
                          <span
                            data-testid={`synergy-mode-badge-${idx}`}
                            className="rounded bg-blue-700 px-1 text-[9px] text-white uppercase"
                          >
                            {syn.applicableMode}
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 text-[10px] text-[var(--color-muted)]">
                        {syn.description}
                      </p>
                      {syn.applicableMode && selectedMode !== "all" && syn.applicableMode !== selectedMode && (
                        <p className="mt-0.5 text-[9px] text-[var(--color-muted)] italic">
                          Not active in {selectedMode}
                        </p>
                      )}
                    </div>
                  ))}
              </div>
            ) : (
              <p className="text-xs text-[var(--color-muted)]">No trait-based passive synergies detected.</p>
            )}
          </div>

          {/* Meta Comparison (US-062) */}
          {metaComparison && (
            <div data-testid="analysis-meta" className="rounded-xl bg-[var(--color-surface)] p-4">
              <h3 className="mb-2 text-sm font-bold text-[var(--color-foreground)]">
                Meta Comparison
              </h3>
              <div className="mb-2">
                <span
                  data-testid="meta-badge"
                  className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                    metaComparison.popularityRank === "Meta Team"
                      ? "bg-green-700 text-white"
                      : metaComparison.popularityRank === "Common Variant"
                      ? "bg-blue-700 text-white"
                      : metaComparison.popularityRank === "Uncommon"
                      ? "bg-yellow-700 text-white"
                      : "bg-gray-600 text-white"
                  }`}
                >
                  {metaComparison.popularityRank}
                </span>
              </div>
              {metaComparison.exactMatch ? (
                <p className="text-xs text-[var(--color-foreground)]">
                  This team appears {metaComparison.exactMatch.total.toLocaleString()} times in{" "}
                  {metaComparison.exactMatch.mode}
                </p>
              ) : metaComparison.partialMatches.length > 0 ? (
                <div className="space-y-1">
                  <p className="text-xs text-[var(--color-muted)]">Closest meta teams:</p>
                  {metaComparison.partialMatches.slice(0, 5).map((m, i) => (
                    <div key={i} data-testid={`meta-match-${i}`} className="text-[10px] text-[var(--color-foreground)]">
                      {m.matchedIds.length}/5 match in {m.mode} ({m.total.toLocaleString()} teams)
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-[var(--color-muted)]">
                  Unique Team — no meta matches found. You&apos;re pioneering!
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Roster Picker Modal */}
      {pickerOpen && (
        <RosterPicker
          roster={roster}
          selectedIds={selectedIds}
          metaData={metaData}
          selectedMode={selectedMode}
          maxSelectable={emptySlotCount}
          onConfirm={handleMultiSelect}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </div>
  );
}

// --- Team Stats Panel (US-061) ---

const DISPLAY_STATS_TOTAL = [
  { key: "health", label: "Health" },
  { key: "damage", label: "Damage" },
  { key: "armor", label: "Armor" },
  { key: "focus", label: "Focus" },
  { key: "resist", label: "Resist" },
] as const;

const DISPLAY_STATS_AVG = [
  { key: "speed", label: "Speed" },
] as const;

const STAT_COLORS = ["bg-blue-500", "bg-green-500", "bg-yellow-500", "bg-purple-500", "bg-red-500"];

function TeamStatsPanel({ stats, teamChars, teamName }: { stats: TeamStatsResult; teamChars: TeamCharacter[]; teamName: string | null }) {
  const [expandedStat, setExpandedStat] = useState<string | null>(null);
  const totalPower = teamChars.reduce((sum, c) => sum + c.power, 0);

  return (
    <div data-testid="analysis-stats" className="rounded-xl bg-[var(--color-surface)] p-4">
      <h3 className="mb-2 text-sm font-bold text-[var(--color-foreground)]">
        {teamName ? teamName : "Team Stats"}
      </h3>
      <div data-testid="team-total-power" className="mb-3 text-center">
        <span className="text-2xl font-bold text-[var(--color-foreground)]">
          {totalPower.toLocaleString()}
        </span>
        <span className="ml-1 text-xs text-[var(--color-muted)]">Total Power</span>
      </div>

      {/* Color legend */}
      <div className="mb-3 flex justify-center gap-2">
        {teamChars.map((c, i) => (
          <div key={c.id} className="flex items-center gap-1">
            <div className={`h-2.5 w-2.5 rounded-full ${STAT_COLORS[i]}`} />
            <span className="text-[9px] text-[var(--color-muted)] max-w-[50px] truncate">{c.name}</span>
          </div>
        ))}
      </div>

      {/* Total stats */}
      {DISPLAY_STATS_TOTAL.map(({ key, label }) => {
        const total = stats.total[key];
        return (
          <div key={key}>
            <button
              data-testid={`stat-row-${key}`}
              className="flex w-full items-center justify-between py-1 text-left"
              onClick={() => setExpandedStat(expandedStat === key ? null : key)}
            >
              <span className="text-xs text-[var(--color-foreground)]">{label}</span>
              <span className="text-xs font-medium text-[var(--color-foreground)]">
                {total.toLocaleString()}
              </span>
            </button>
            {/* Stacked bar */}
            <div className="mb-1 flex h-1.5 overflow-hidden rounded-full bg-[var(--color-surface-light)]">
              {stats.individual.map((ind, i) => {
                const pct = total > 0 ? (ind.stats[key] / total) * 100 : 20;
                return <div key={ind.characterId} className={`${STAT_COLORS[i]} h-full`} style={{ width: `${pct}%` }} />;
              })}
            </div>
            {expandedStat === key && (
              <div className="mb-2 ml-2 space-y-0.5">
                {stats.individual.map((ind) => (
                  <div key={ind.characterId} className="flex justify-between text-[10px] text-[var(--color-muted)]">
                    <span>{ind.name}</span>
                    <span>{ind.stats[key].toLocaleString()}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}

      {/* Average stats */}
      <div className="mt-2 border-t border-[var(--color-surface-light)] pt-2">
        <p className="mb-1 text-[10px] font-semibold text-[var(--color-muted)]">TEAM AVERAGES</p>
        {DISPLAY_STATS_AVG.map(({ key, label }) => (
          <div key={key} data-testid={`stat-row-${key}`} className="flex items-center justify-between py-0.5">
            <span className="text-xs text-[var(--color-foreground)]">{label}</span>
            <span className="text-xs font-medium text-[var(--color-foreground)]">
              {Math.round(stats.average[key]).toLocaleString()}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
