"use client";

import { useState, useEffect, useCallback } from "react";
import { CharPortrait } from "@/app/components/CharPortrait";

interface EnemyUnit {
  id: string;
  level?: number;
  gearTier?: number;
  activeYellow?: number;
  activeRed?: number;
  basic?: number;
  special?: number;
  ultimate?: number;
  passive?: number;
  iso8?: { active?: string; level?: number; pips?: number };
  stats?: Record<string, number>;
  info?: {
    name?: string;
    portrait?: string;
    traits?: (string | { id: string })[];
  };
}

interface CombatWave {
  units: EnemyUnit[];
  onFewerThan?: number;
}

interface EnemyCombat {
  left?: { waves: CombatWave[] };
  right?: { waves: CombatWave[] };
}

interface NodeRequirements {
  anyCharacterFilters?: Array<{
    allTraits?: (string | { id: string })[];
    anyTraits?: (string | { id: string })[];
    exceptTraits?: (string | { id: string })[];
    anyCharacters?: string[];
    gearTier?: number;
    level?: number;
    activeYellow?: number;
    activeRed?: number;
    iso8Class?: string;
    iso8ClassLevel?: number;
  }>;
  maxCharacters?: number;
  minCharacters?: number;
  missionCharacters?: boolean;
  specificCharacters?: string[];
}

interface NodeDetailData {
  roomId: string;
  name?: string;
  isBoss?: boolean;
  sectionName?: string;
  requirements?: NodeRequirements;
  enemies?: EnemyCombat;
}

function traitId(t: string | { id: string }): string {
  return typeof t === "string" ? t : t.id;
}

/** Convert raw API IDs to readable names as a last resort fallback */
function formatDisplayName(raw: string | undefined, fallbackId: string): string {
  if (!raw) return fallbackId;
  if (/[a-z ]/.test(raw)) return raw;
  return raw
    .replace(/^DD_ID_/i, "")
    .replace(/^ROOM_/i, "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/\s+Event$/i, "");
}

function getAllWaves(combat?: EnemyCombat): { waveIndex: number; units: EnemyUnit[] }[] {
  const waves: { waveIndex: number; units: EnemyUnit[] }[] = [];
  let waveIdx = 0;

  const sides = [combat?.left, combat?.right].filter(Boolean);
  for (const side of sides) {
    if (side?.waves) {
      for (const wave of side.waves) {
        waves.push({ waveIndex: waveIdx + 1, units: wave.units ?? [] });
        waveIdx++;
      }
    }
  }
  return waves;
}

export default function DDNodeIntelligence({
  ddId,
  roomId,
}: {
  ddId: string;
  roomId: string;
}) {
  const [nodeData, setNodeData] = useState<NodeDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const loadData = async () => {
      setLoading(true);
      setError(null);

      try {
        const res = await fetch(
          `/api/msf/planner/dd/${encodeURIComponent(ddId)}/${encodeURIComponent(roomId)}`,
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: NodeDetailData = await res.json();
        if (!cancelled) setNodeData(data);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadData();

    return () => {
      cancelled = true;
    };
  }, [ddId, roomId]);

  const waves = getAllWaves(nodeData?.enemies);
  const requirements = nodeData?.requirements;

  const [expandedWaves, setExpandedWaves] = useState<Set<number>>(new Set());

  const toggleWave = useCallback((waveIndex: number) => {
    setExpandedWaves((prev) => {
      const next = new Set(prev);
      if (next.has(waveIndex)) next.delete(waveIndex);
      else next.add(waveIndex);
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    setExpandedWaves((prev) => {
      if (prev.size === waves.length) return new Set();
      return new Set(waves.map((w) => w.waveIndex));
    });
  }, [waves]);

  if (loading) {
    return (
      <div data-testid="node-intel-loading" className="mt-4 space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="h-16 animate-pulse rounded-lg bg-[var(--color-surface)]"
          />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="mt-4 rounded-lg bg-red-900/30 p-4 text-center">
        <p className="text-sm text-red-400">{error}</p>
      </div>
    );
  }

  if (!nodeData) return null;

  return (
    <div data-testid="node-intel-panel" className="mt-4">
      {/* Node header */}
      <div className="mb-3 flex items-center gap-2">
        <h3 className="text-lg font-bold text-[var(--color-foreground)]">
          {formatDisplayName(nodeData.name, roomId)}
        </h3>
        {nodeData.isBoss && (
          <span className="rounded bg-red-600 px-2 py-0.5 text-xs font-bold text-white">
            BOSS
          </span>
        )}
        {nodeData.sectionName && (
          <span className="text-xs text-[var(--color-muted)]">
            {formatDisplayName(nodeData.sectionName, "")}
          </span>
        )}
      </div>

      {/* Requirements summary */}
      {requirements && (
        <div
          data-testid="node-requirements"
          className="mb-4 rounded-lg bg-[var(--color-surface)] p-3"
        >
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">
            Node Requirements
          </h4>

          {/* Mission characters flag */}
          {requirements.missionCharacters && (
            <p className="mb-2 text-xs font-semibold text-yellow-400">
              ⚠ Mission characters only
            </p>
          )}

          {/* Specific required characters */}
          {requirements.specificCharacters && requirements.specificCharacters.length > 0 && (
            <div className="mb-2">
              <span className="text-xs text-[var(--color-muted)]">Required: </span>
              <div className="mt-1 flex flex-wrap gap-1">
                {requirements.specificCharacters.map((charId) => (
                  <span
                    key={charId}
                    className="rounded-full bg-red-600/30 px-2 py-0.5 text-xs text-red-300"
                  >
                    {formatDisplayName(charId, charId)}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Character filters */}
          <div className="flex flex-wrap gap-2">
            {requirements.anyCharacterFilters?.map((filter, fIdx) => (
              <div key={fIdx} className="flex flex-wrap gap-1">
                {filter.allTraits?.map((t) => (
                  <span
                    key={`all-${traitId(t)}`}
                    className="rounded-full bg-indigo-600/30 px-2 py-0.5 text-xs text-indigo-300"
                  >
                    {formatDisplayName(traitId(t), traitId(t))}
                  </span>
                ))}
                {filter.anyTraits?.map((t) => (
                  <span
                    key={`any-${traitId(t)}`}
                    className="rounded-full bg-blue-600/30 px-2 py-0.5 text-xs text-blue-300"
                  >
                    {formatDisplayName(traitId(t), traitId(t))} (any)
                  </span>
                ))}
                {filter.exceptTraits?.map((t) => (
                  <span
                    key={`except-${traitId(t)}`}
                    className="rounded-full bg-red-600/20 px-2 py-0.5 text-xs text-red-400 line-through"
                  >
                    {formatDisplayName(traitId(t), traitId(t))}
                  </span>
                ))}
                {filter.anyCharacters && filter.anyCharacters.length > 0 && (
                  filter.anyCharacters.map((charId) => (
                    <span
                      key={`char-${charId}`}
                      className="rounded-full bg-cyan-600/30 px-2 py-0.5 text-xs text-cyan-300"
                    >
                      {formatDisplayName(charId, charId)}
                    </span>
                  ))
                )}
                {filter.level != null && (
                  <span className="rounded-full bg-blue-600/30 px-2 py-0.5 text-xs text-blue-300">
                    Lv {filter.level}+
                  </span>
                )}
                {filter.activeYellow != null && (
                  <span className="rounded-full bg-yellow-600/30 px-2 py-0.5 text-xs text-yellow-300">
                    ★{filter.activeYellow}+
                  </span>
                )}
                {filter.activeRed != null && (
                  <span className="rounded-full bg-red-600/30 px-2 py-0.5 text-xs text-red-300">
                    ✦{filter.activeRed}+
                  </span>
                )}
                {filter.gearTier != null && (
                  <span className="rounded-full bg-amber-600/30 px-2 py-0.5 text-xs text-amber-300">
                    GT{filter.gearTier}+
                  </span>
                )}
                {filter.iso8Class && (
                  <span className="rounded-full bg-purple-600/30 px-2 py-0.5 text-xs text-purple-300">
                    {filter.iso8Class}
                  </span>
                )}
                {filter.iso8ClassLevel != null && (
                  <span className="rounded-full bg-green-600/30 px-2 py-0.5 text-xs text-green-300">
                    ISO-8 L{filter.iso8ClassLevel}+
                  </span>
                )}
              </div>
            ))}
          </div>
          {requirements.maxCharacters && (
            <p className="mt-1 text-xs text-[var(--color-muted)]">
              Team size: {requirements.minCharacters ?? 1}–{requirements.maxCharacters}
            </p>
          )}
        </div>
      )}

      {/* Enemy waves — collapsible accordion */}
      {waves.length === 0 && (
        <p className="text-sm text-[var(--color-muted)]">
          No enemy data available for this node.
        </p>
      )}

      {waves.length > 0 && (
        <div>
          <div className="mb-2 flex items-center justify-between">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">
              Enemy Waves ({waves.length})
            </h4>
            <button
              onClick={toggleAll}
              className="text-xs text-[var(--color-accent)] hover:underline"
            >
              {expandedWaves.size === waves.length ? "Collapse All" : "Expand All"}
            </button>
          </div>

          {waves.map((wave) => {
            const isExpanded = expandedWaves.has(wave.waveIndex);
            return (
              <div key={wave.waveIndex} className="mb-2">
                <button
                  data-testid={`wave-${wave.waveIndex}`}
                  onClick={() => toggleWave(wave.waveIndex)}
                  className="flex w-full items-center justify-between rounded-lg bg-[var(--color-surface)] px-3 py-2 text-left transition-colors hover:bg-[var(--color-surface-light)]"
                >
                  <span className="text-sm font-semibold text-[var(--color-foreground)]">
                    Wave {wave.waveIndex}
                    <span className="ml-2 text-xs font-normal text-[var(--color-muted)]">
                      ({wave.units.length} {wave.units.length === 1 ? "enemy" : "enemies"})
                    </span>
                  </span>
                  <svg
                    className={`h-4 w-4 text-[var(--color-muted)] transition-transform ${isExpanded ? "rotate-180" : ""}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {isExpanded && (
                  <div className="mt-1 space-y-2 pl-2">
                    {wave.units.map((unit, uIdx) => (
              <div
                key={`${unit.id}-${uIdx}`}
                data-testid="enemy-entry"
                className="flex items-center gap-3 rounded-lg bg-[var(--color-surface)] p-3"
              >
                {/* Portrait */}
                <CharPortrait
                  src={unit.info?.portrait}
                  name={unit.info?.name ?? unit.id ?? "?"}
                  imgClassName="h-10 w-10 rounded-lg object-cover"
                  fallbackClassName="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--color-surface-light)] text-xs font-bold text-[var(--color-accent)]"
                />

                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-[var(--color-foreground)]">
                    {unit.info?.name ?? "Unknown Enemy"}
                  </p>
                  <div className="flex flex-wrap gap-2 text-xs text-[var(--color-muted)]">
                    {unit.level != null && <span>Lv {unit.level}</span>}
                    {unit.gearTier != null && <span>GT{unit.gearTier}</span>}
                    {unit.activeYellow != null && unit.activeYellow > 0 && (
                      <span className="text-yellow-400">★{unit.activeYellow}</span>
                    )}
                    {unit.activeRed != null && unit.activeRed > 0 && (
                      <span className="text-red-400">✦{unit.activeRed}</span>
                    )}
                  </div>
                  {/* Combat stats — abilities and ISO-8 */}
                  <div className="mt-1 flex flex-wrap gap-1">
                    {unit.iso8?.active && (
                      <span className="rounded-full bg-purple-600/30 px-1.5 py-0.5 text-[10px] text-purple-300">
                        {unit.iso8.active}{unit.iso8.level != null ? ` L${unit.iso8.level}` : ""}
                      </span>
                    )}
                    {unit.info?.traits && unit.info.traits.length > 0 && (
                      unit.info.traits.slice(0, 4).map((t) => (
                        <span
                          key={traitId(t)}
                          className="rounded-full bg-[var(--color-surface-light)] px-1.5 py-0.5 text-[10px] text-[var(--color-muted)]"
                        >
                          {traitId(t)}
                        </span>
                      ))
                    )}
                    {unit.stats?.power != null && (
                      <span className="rounded-full bg-[var(--color-surface-light)] px-1.5 py-0.5 text-[10px] text-[var(--color-muted)]">
                        {unit.stats.power.toLocaleString()} PWR
                      </span>
                    )}
                  </div>
                </div>
              </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
