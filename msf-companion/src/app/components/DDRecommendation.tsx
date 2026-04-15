"use client";

import { useState } from "react";

interface RecommendedChar {
  id: string;
  name: string;
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
  currentState: { gearTier: number; level: number };
  requiredState: { gearTier: number | null; level: number | null };
}

export interface RecommendationData {
  primaryTeam: RecommendedChar[];
  confidence: number;
  alternatives: RecommendedChar[][];
  swapSuggestions: SwapSuggestion[];
  futureBuildSuggestions: FutureBuild[];
  gearOriginWarnings: string[];
  maxCharacters: number;
}

export default function DDRecommendation({
  ddId,
  roomId,
}: {
  ddId: string;
  roomId: string;
}) {
  const [data, setData] = useState<RecommendationData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function getRecommendation() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/msf/planner/dd/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ddId, roomId }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const result: RecommendationData = await res.json();
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to get recommendation");
    } finally {
      setLoading(false);
    }
  }

  const confidenceColor =
    data && data.confidence >= 80
      ? "text-green-400"
      : data && data.confidence >= 50
        ? "text-yellow-400"
        : "text-red-400";

  const confidenceBgColor =
    data && data.confidence >= 80
      ? "bg-green-600"
      : data && data.confidence >= 50
        ? "bg-yellow-600"
        : "bg-red-600";

  return (
    <div data-testid="dd-recommendation" className="mt-4">
      {/* Get Recommendation button */}
      {!data && !loading && (
        <button
          data-testid="get-recommendation-btn"
          onClick={getRecommendation}
          className="w-full rounded-lg bg-[var(--color-accent)] px-4 py-3 text-sm font-semibold text-white"
        >
          Get Recommendation
        </button>
      )}

      {/* Loading */}
      {loading && (
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
            onClick={getRecommendation}
            className="mt-2 rounded-lg bg-[var(--color-accent)] px-4 py-2 text-xs font-semibold text-white"
          >
            Retry
          </button>
        </div>
      )}

      {/* Recommendation result */}
      {data && (
        <>
          {/* Confidence score */}
          <div
            data-testid="confidence-score"
            className="mb-4 rounded-lg bg-[var(--color-surface)] p-3"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">
                Confidence
              </span>
              <span
                data-testid="confidence-value"
                className={`text-lg font-bold ${confidenceColor}`}
              >
                {data.confidence}
              </span>
            </div>
            <div className="mt-1 h-2 rounded-full bg-[var(--color-surface-light)]">
              <div
                className={`h-2 rounded-full ${confidenceBgColor}`}
                style={{ width: `${data.confidence}%` }}
              />
            </div>
          </div>

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
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--color-accent)]/20 text-xs font-bold text-[var(--color-accent)]">
                    {char.name.charAt(0)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p
                      data-testid="char-name"
                      className="text-sm font-semibold text-[var(--color-foreground)]"
                    >
                      {char.name}
                    </p>
                    <p className="text-xs text-[var(--color-muted)]">
                      Power: {char.power.toLocaleString()} · GT{char.gearTier}
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
          {data.gearOriginWarnings && data.gearOriginWarnings.length > 0 && (
            <div data-testid="gear-origin-warnings" className="mt-3 space-y-2">
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
                Alternative Team
              </h4>
              {data.alternatives.map((team, tIdx) => (
                <div key={tIdx} className="space-y-2">
                  {team.map((char) => (
                    <div
                      key={char.id}
                      data-testid="alt-char"
                      className="flex items-center gap-3 rounded-lg bg-[var(--color-surface)] p-3 opacity-80"
                    >
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--color-surface-light)] text-xs font-bold text-[var(--color-muted)]">
                        {char.name.charAt(0)}
                      </div>
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
                Suggested Investments
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
                    {build.requiredState.gearTier != null &&
                      ` → GT${build.requiredState.gearTier}`}
                  </p>
                </div>
              ))}
            </div>
          ) : data.confidence > 80 ? (
            <div className="mt-4 rounded-lg bg-green-900/10 p-3 text-center">
              <p className="text-xs text-green-400">
                Your roster is well-prepared for this node.
              </p>
            </div>
          ) : null}

          {/* New recommendation button */}
          <button
            onClick={getRecommendation}
            className="mt-4 w-full rounded-lg border border-[var(--color-accent)] px-4 py-2 text-xs font-semibold text-[var(--color-accent)]"
          >
            Refresh Recommendation
          </button>
        </>
      )}
    </div>
  );
}
