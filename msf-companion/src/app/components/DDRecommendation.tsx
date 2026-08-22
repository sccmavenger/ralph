"use client";

import { useEffect, useRef, useState } from "react";
import { CharPortrait } from "@/app/components/CharPortrait";
import type { RecommendationMode } from "@/lib/dd-recommendation";

interface RecommendedChar {
  id: string;
  name: string;
  portrait?: string;
  power: number;
  gearTier: number;
  reasoning: string;
}

interface SwapSuggestion {
  position: number;
  currentId: string;
  currentName: string;
  suggestedId: string;
  suggestedName: string;
  reason: string;
}

interface FutureBuild {
  id: string;
  name: string;
  reason: string;
  currentState: {
    gearTier: number;
    level: number;
    activeYellow?: number;
    activeRed?: number;
    iso8Class?: string | null;
    iso8ClassLevel?: number;
  };
  requiredState: {
    gearTier: number | null;
    level: number | null;
    activeYellow?: number | null;
    activeRed?: number | null;
    iso8Class?: string | null;
    iso8ClassLevel?: number | null;
  };
}

export interface RecommendationData {
  primaryTeam: RecommendedChar[];
  rosterReadiness?: number;
  readinessBasis?: string;
  mode: RecommendationMode;
  modeEvidence?: {
    available: boolean;
    generatedAt: string | null;
    sourceModes: string[];
    meaning: string;
  };
  alternatives: RecommendedChar[][];
  swapSuggestions: SwapSuggestion[];
  futureBuildSuggestions: FutureBuild[];
  gearOriginWarnings: string[];
  maxCharacters: number;
  missionCharacters?: boolean;
  message?: string;
}

const MODE_OPTIONS: Array<{
  id: RecommendationMode;
  label: string;
  description: string;
}> = [
  {
    id: "fastest-clear",
    label: "Fastest clear",
    description: "Strongest ready roster with damage, control, and sustain.",
  },
  {
    id: "lowest-investment",
    label: "Lowest investment",
    description: "Uses ready characters; build targets favor the smallest gap.",
  },
  {
    id: "cross-mode-value",
    label: "Cross-mode value",
    description: "Favors current usage breadth outside Dark Dimension.",
  },
];

export default function DDRecommendation({
  ddId,
  roomId,
}: {
  ddId: string;
  roomId: string;
}) {
  const [data, setData] = useState<RecommendationData | null>(null);
  const [mode, setMode] = useState<RecommendationMode>("fastest-clear");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestRef = useRef<AbortController | null>(null);

  useEffect(
    () => () => {
      requestRef.current?.abort();
    },
    [],
  );

  async function getRecommendation(requestedMode: RecommendationMode = mode) {
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/msf/planner/dd/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ddId, roomId, mode: requestedMode }),
        signal: controller.signal,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const result: RecommendationData = await res.json();
      if (!controller.signal.aborted) {
        setMode(requestedMode);
        setData(result);
      }
    } catch (err) {
      if (controller.signal.aborted) return;
      setError(
        err instanceof Error ? err.message : "Failed to get recommendation",
      );
    } finally {
      if (requestRef.current === controller) {
        requestRef.current = null;
        setLoading(false);
      }
    }
  }

  const readiness = data?.rosterReadiness ?? 0;
  const readinessColor =
    data && readiness >= 80
      ? "text-green-400"
      : data && readiness >= 50
        ? "text-yellow-400"
        : "text-red-400";

  const readinessBgColor =
    data && readiness >= 80
      ? "bg-green-600"
      : data && readiness >= 50
        ? "bg-yellow-600"
        : "bg-red-600";

  return (
    <div data-testid="dd-recommendation" className="mt-4">
      <div
        data-testid="recommendation-mode-selector"
        className="mb-3 rounded-lg bg-[var(--color-surface)] p-3"
      >
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">
          Recommendation goal
        </p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {MODE_OPTIONS.map((option) => {
            const selected = mode === option.id;
            return (
              <button
                key={option.id}
                type="button"
                data-testid={`recommendation-mode-${option.id}`}
                aria-pressed={selected}
                disabled={loading}
                onClick={() => {
                  if (selected) return;
                  if (data) void getRecommendation(option.id);
                  else setMode(option.id);
                }}
                className={`rounded-lg border p-2 text-left transition-colors ${
                  selected
                    ? "border-[var(--color-accent)] bg-[var(--color-accent)]/10"
                    : "border-[var(--color-border)] hover:bg-[var(--color-surface-light)]"
                } disabled:cursor-wait disabled:opacity-60`}
              >
                <span className="block text-xs font-semibold text-[var(--color-foreground)]">
                  {option.label}
                </span>
                <span className="mt-0.5 block text-[10px] leading-4 text-[var(--color-muted)]">
                  {option.description}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Get Recommendation button */}
      {!data && !loading && (
        <button
          data-testid="get-recommendation-btn"
          onClick={() => void getRecommendation()}
          className="w-full rounded-lg bg-[var(--color-accent)] px-4 py-3 text-sm font-semibold text-white"
        >
          Get Recommendation
        </button>
      )}

      {/* Loading */}
      {loading && !data && (
        <div data-testid="recommendation-loading" className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="h-16 animate-pulse rounded-lg bg-[var(--color-surface)]"
            />
          ))}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-lg bg-red-900/30 p-4 text-center">
          <p className="text-sm text-red-400">{error}</p>
          <button
            onClick={() => void getRecommendation()}
            className="mt-2 rounded-lg bg-[var(--color-accent)] px-4 py-2 text-xs font-semibold text-white"
          >
            Retry
          </button>
        </div>
      )}

      {/* Recommendation result */}
      {data && (
        <>
          {data.missionCharacters ? (
            <div
              data-testid="mission-team-message"
              className="rounded-lg border border-yellow-600/30 bg-yellow-900/10 p-4"
            >
              <h4 className="text-sm font-semibold text-yellow-300">
                Fixed Mission Team
              </h4>
              <p className="mt-1 text-xs text-[var(--color-muted)]">
                {data.message ??
                  "This node supplies its own mission characters; your roster does not need a team recommendation."}
              </p>
            </div>
          ) : (
            <>
              {/* Roster readiness — explicitly not a clear probability */}
              <div
                data-testid="roster-readiness"
                className="mb-4 rounded-lg bg-[var(--color-surface)] p-3"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">
                    Roster Readiness
                  </span>
                  <span
                    data-testid="roster-readiness-value"
                    className={`text-lg font-bold ${readinessColor}`}
                  >
                    {readiness}%
                  </span>
                </div>
                <div className="mt-1 h-2 rounded-full bg-[var(--color-surface-light)]">
                  <div
                    className={`h-2 rounded-full ${readinessBgColor}`}
                    style={{
                      width: `${Math.min(100, Math.max(0, readiness))}%`,
                    }}
                  />
                </div>
                <p className="mt-2 text-[10px] leading-4 text-[var(--color-muted)]">
                  {data.readinessBasis ??
                    "Measures ready team size, available power, and role coverage—not the probability of a clear."}
                </p>
              </div>

              {data.mode === "cross-mode-value" &&
                data.modeEvidence &&
                !data.modeEvidence.available && (
                  <div
                    data-testid="mode-evidence-unavailable"
                    className="mb-4 rounded-lg border border-amber-600/30 bg-amber-900/10 p-3"
                  >
                    <p className="text-xs text-amber-300">
                      Current cross-mode usage data is unavailable. This result
                      falls back to the strongest roster-ready squad.
                    </p>
                  </div>
                )}

              {data.mode === "cross-mode-value" &&
                data.modeEvidence?.available && (
                  <p
                    data-testid="mode-evidence-note"
                    className="mb-3 text-[10px] leading-4 text-[var(--color-muted)]"
                  >
                    {data.modeEvidence.meaning}
                  </p>
                )}

              {/* Team size label */}
              <p
                data-testid="team-size-label"
                className="mb-2 text-xs text-[var(--color-muted)]"
              >
                {data.primaryTeam.length} characters recommended (max{" "}
                {data.maxCharacters})
              </p>

              {/* Primary team */}
              {data.primaryTeam.length === 0 ? (
                <div className="rounded-lg bg-[var(--color-surface)] p-4 text-center">
                  <p className="text-sm text-[var(--color-muted)]">
                    No eligible characters found for this node. Check the
                    Suggested Investments section below for build targets.
                  </p>
                </div>
              ) : (
                <div data-testid="primary-team" className="space-y-2">
                  <h4 className="text-sm font-semibold text-[var(--color-foreground)]">
                    Recommended Team
                  </h4>
                  {data.primaryTeam.map((char) => (
                    <div
                      key={char.id}
                      data-testid="recommended-char"
                      className="flex items-center gap-3 rounded-lg bg-[var(--color-surface)] p-3"
                    >
                      <CharPortrait
                        src={char.portrait}
                        name={char.name}
                        imgClassName="h-10 w-10 rounded-lg object-cover"
                        fallbackClassName="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--color-accent)]/20 text-xs font-bold text-[var(--color-accent)]"
                      />
                      <div className="min-w-0 flex-1">
                        <p
                          data-testid="char-name"
                          className="text-sm font-semibold text-[var(--color-foreground)]"
                        >
                          {char.name}
                        </p>
                        <p className="text-xs text-[var(--color-muted)]">
                          Power: {char.power.toLocaleString()} · GT
                          {char.gearTier}
                        </p>
                        <p
                          data-testid="char-reasoning"
                          className="mt-1 text-xs italic text-[var(--color-muted)]"
                        >
                          {char.reasoning}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Gear origin warnings */}
              {data.gearOriginWarnings &&
                data.gearOriginWarnings.length > 0 && (
                  <div
                    data-testid="gear-origin-warnings"
                    className="mt-3 space-y-2"
                  >
                    {data.gearOriginWarnings.map((warning, wIdx) => (
                      <div
                        key={wIdx}
                        className="rounded-lg border border-orange-600/30 bg-orange-900/10 p-3"
                      >
                        <p className="text-xs text-orange-300">⚠️ {warning}</p>
                      </div>
                    ))}
                  </div>
                )}

              {/* Alternatives */}
              {data.alternatives.length > 0 && (
                <div data-testid="alternatives" className="mt-4">
                  <h4 className="mb-2 text-sm font-semibold text-[var(--color-foreground)]">
                    Alternative Ready Team
                  </h4>
                  {data.alternatives.map((team, tIdx) => (
                    <div key={tIdx} className="space-y-2">
                      {team.map((char) => (
                        <div
                          key={char.id}
                          data-testid="alt-char"
                          className="flex items-center gap-3 rounded-lg bg-[var(--color-surface)] p-3 opacity-80"
                        >
                          <CharPortrait
                            src={char.portrait}
                            name={char.name}
                            imgClassName="h-10 w-10 rounded-lg object-cover"
                            fallbackClassName="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--color-surface-light)] text-xs font-bold text-[var(--color-muted)]"
                          />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold text-[var(--color-foreground)]">
                              {char.name}
                            </p>
                            <p className="text-xs text-[var(--color-muted)]">
                              {char.reasoning}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              )}

              {/* Swap suggestions */}
              {data.swapSuggestions.length > 0 && (
                <div data-testid="swap-suggestions" className="mt-4">
                  <h4 className="mb-2 text-sm font-semibold text-[var(--color-foreground)]">
                    Swap Suggestions
                  </h4>
                  {data.swapSuggestions.map((swap, sIdx) => (
                    <div
                      key={sIdx}
                      data-testid="swap-entry"
                      className="mb-2 rounded-lg border border-amber-600/30 bg-amber-900/10 p-3"
                    >
                      <p className="text-xs text-amber-300">
                        Position {swap.position}: Use{" "}
                        <strong>{swap.suggestedName}</strong> instead of{" "}
                        <strong>{swap.currentName}</strong>
                      </p>
                      <p className="mt-1 text-xs text-[var(--color-muted)]">
                        {swap.reason}
                      </p>
                    </div>
                  ))}
                </div>
              )}

              {/* Future build suggestions */}
              {data.futureBuildSuggestions.length > 0 ? (
                <div data-testid="future-builds" className="mt-4">
                  <h4 className="mb-2 text-sm font-semibold text-[var(--color-foreground)]">
                    {data.mode === "lowest-investment"
                      ? "Lowest-gap Investments"
                      : "Suggested Investments"}
                  </h4>
                  {data.futureBuildSuggestions.map((build) => (
                    <div
                      key={build.id}
                      data-testid="future-build-entry"
                      className="mb-2 rounded-lg border border-blue-600/30 bg-blue-900/10 p-3"
                    >
                      <p className="text-sm font-semibold text-blue-300">
                        {build.name}
                      </p>
                      <p
                        data-testid="future-build-reason"
                        className="text-xs text-[var(--color-muted)]"
                      >
                        {build.reason}
                      </p>
                      <p className="mt-1 text-xs text-[var(--color-muted)]">
                        Current: GT{build.currentState.gearTier} · Lv{" "}
                        {build.currentState.level}
                      </p>
                      <p className="mt-1 text-xs text-blue-300">
                        Target:{" "}
                        {[
                          build.requiredState.gearTier != null
                            ? `GT${build.requiredState.gearTier}`
                            : null,
                          build.requiredState.level != null
                            ? `Lv ${build.requiredState.level}`
                            : null,
                          build.requiredState.activeYellow != null
                            ? `${build.requiredState.activeYellow}★`
                            : null,
                          build.requiredState.activeRed != null
                            ? `${build.requiredState.activeRed} red★`
                            : null,
                          build.requiredState.iso8Class
                            ? `${build.requiredState.iso8Class} ISO-8`
                            : null,
                          build.requiredState.iso8ClassLevel != null
                            ? `class L${build.requiredState.iso8ClassLevel}`
                            : null,
                        ]
                          .filter(Boolean)
                          .join(" · ") || "Meet the listed node requirements"}
                      </p>
                    </div>
                  ))}
                </div>
              ) : readiness > 80 ? (
                <div className="mt-4 rounded-lg bg-green-900/10 p-3 text-center">
                  <p className="text-xs text-green-400">
                    Your roster is well-prepared for this node.
                  </p>
                </div>
              ) : null}

              {/* New recommendation button */}
              <button
                onClick={() => void getRecommendation()}
                disabled={loading}
                className="mt-4 w-full rounded-lg border border-[var(--color-accent)] px-4 py-2 text-xs font-semibold text-[var(--color-accent)]"
              >
                {loading ? "Refreshing…" : "Refresh Recommendation"}
              </button>
            </>
          )}
        </>
      )}
    </div>
  );
}
