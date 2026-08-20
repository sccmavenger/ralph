"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { CharPortrait } from "@/app/components/CharPortrait";

interface GapEvent {
  eventId: string;
  eventName: string;
  readinessPercent: number;
  characters: Array<{
    id: string;
    name: string;
    portrait: string;
    meetsRequirements: boolean;
    currentGear: number;
    requiredGear: number;
  }>;
}

interface PriorityEntry {
  rank: number;
  characterId: string;
  name: string;
  portrait: string;
  score: number;
  events: { id: string; name: string; startTime: string }[];
  currentGear: number;
  requiredGear: number;
}

function SkeletonWidget() {
  return (
    <div
      className="animate-pulse rounded-xl bg-[var(--color-surface)] p-4 space-y-3"
      data-testid="planner-summary-skeleton"
    >
      <div className="h-4 w-48 rounded bg-[var(--color-surface-light)]" />
      <div className="flex gap-3">
        <div className="h-12 w-20 rounded bg-[var(--color-surface-light)]" />
        <div className="h-12 w-20 rounded bg-[var(--color-surface-light)]" />
      </div>
      <div className="space-y-2">
        <div className="h-10 w-full rounded bg-[var(--color-surface-light)]" />
        <div className="h-10 w-full rounded bg-[var(--color-surface-light)]" />
        <div className="h-10 w-full rounded bg-[var(--color-surface-light)]" />
      </div>
    </div>
  );
}

function getReadinessDot(
  currentGear: number,
  requiredGear: number,
): { color: string; label: string } {
  const gap = requiredGear - currentGear;
  if (gap <= 0) return { color: "bg-green-500", label: "Ready" };
  if (gap <= 2) return { color: "bg-yellow-500", label: "Close" };
  return { color: "bg-red-500", label: "Significant gap" };
}

async function fetchArray<T>(url: string): Promise<T[]> {
  const response = await fetch(url, { cache: "no-store" });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(body?.error || "Planner data is temporarily unavailable.");
  }
  if (!Array.isArray(body)) {
    throw new Error("The planner returned an invalid response.");
  }
  return body as T[];
}

export default function PlannerSummary() {
  const [gaps, setGaps] = useState<GapEvent[] | null>(null);
  const [priorities, setPriorities] = useState<PriorityEntry[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [gapsError, setGapsError] = useState<string | null>(null);
  const [prioritiesError, setPrioritiesError] = useState(false);
  const fetchedRef = useRef(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setGapsError(null);
    setPrioritiesError(false);

    const [gapsResult, prioritiesResult] = await Promise.allSettled([
      fetchArray<GapEvent>("/api/msf/planner/gaps"),
      fetchArray<PriorityEntry>("/api/msf/planner/priorities"),
    ]);

    if (gapsResult.status === "fulfilled") {
      setGaps(gapsResult.value);
    } else {
      setGaps(null);
      setGapsError(
        gapsResult.reason instanceof Error
          ? gapsResult.reason.message
          : "Investment planner is temporarily unavailable.",
      );
    }

    if (prioritiesResult.status === "fulfilled") {
      setPriorities(prioritiesResult.value);
    } else {
      setPriorities(null);
      setPrioritiesError(true);
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (fetchedRef.current) return;
      fetchedRef.current = true;
      void fetchData();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [fetchData]);

  if (loading) return <SkeletonWidget />;

  if (gapsError) {
    return (
      <div
        role="status"
        className="rounded-xl border border-[var(--color-surface-light)] bg-[var(--color-surface)] p-4"
        data-testid="planner-summary"
      >
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-[var(--color-foreground)]">
            Investment Planner
          </h3>
          <Link href="/planner" className="text-xs font-semibold text-[var(--color-accent)]">
            View All →
          </Link>
        </div>
        <p className="mt-2 text-xs text-[var(--color-muted)]" data-testid="planner-summary-error">
          {gapsError}
        </p>
        <button
          type="button"
          onClick={fetchData}
          className="mt-3 text-xs font-semibold text-[var(--color-accent)]"
          data-testid="planner-summary-retry"
        >
          Try again
        </button>
      </div>
    );
  }

  const eventsWithRequirements = gaps?.filter(
    (e) => e.characters && e.characters.length > 0,
  );

  const hasEvents = eventsWithRequirements && eventsWithRequirements.length > 0;

  // Overall readiness: average of all event readinessPercent
  const overallReadiness = hasEvents
    ? Math.round(
        eventsWithRequirements.reduce(
          (sum, e) => sum + e.readinessPercent,
          0,
        ) / eventsWithRequirements.length,
      )
    : 0;

  const top3 = priorities?.slice(0, 3) ?? [];

  return (
    <div
      className="rounded-xl border border-[var(--color-surface-light)] bg-[var(--color-surface)] p-4"
      data-testid="planner-summary"
    >
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-bold text-[var(--color-foreground)]">
          Investment Planner
        </h3>
        <Link
          href="/planner"
          className="text-xs font-semibold text-[var(--color-accent)]"
          data-testid="planner-summary-link"
        >
          View All →
        </Link>
      </div>

      {prioritiesError && hasEvents && (
        <p className="mb-3 text-xs text-amber-300" role="status">
          Character priorities are temporarily unavailable.
        </p>
      )}

      {!hasEvents ? (
        <p
          className="text-xs text-[var(--color-muted)]"
          data-testid="planner-summary-empty"
        >
          No upcoming events need preparation
        </p>
      ) : (
        <>
          {/* Stats row */}
          <div className="mb-3 flex gap-3" data-testid="planner-summary-stats">
            <div className="flex flex-col items-center rounded-lg bg-[var(--color-surface-light)] px-3 py-2">
              <span
                className="text-lg font-bold text-[var(--color-accent)]"
                data-testid="planner-summary-event-count"
              >
                {eventsWithRequirements.length}
              </span>
              <span className="text-[10px] text-[var(--color-muted)]">
                Events
              </span>
            </div>
            <div className="flex flex-col items-center rounded-lg bg-[var(--color-surface-light)] px-3 py-2">
              <span
                className="text-lg font-bold"
                style={{
                  color:
                    overallReadiness >= 80
                      ? "#22c55e"
                      : overallReadiness >= 50
                        ? "#eab308"
                        : "#ef4444",
                }}
                data-testid="planner-summary-readiness"
              >
                {overallReadiness}%
              </span>
              <span className="text-[10px] text-[var(--color-muted)]">
                Readiness
              </span>
            </div>
          </div>

          {/* Top 3 priorities */}
          {top3.length > 0 && (
            <div className="space-y-2" data-testid="planner-summary-priorities">
              {top3.map((entry) => {
                const dot = getReadinessDot(
                  entry.currentGear,
                  entry.requiredGear,
                );
                return (
                  <div
                    key={entry.characterId}
                    className="flex items-center gap-2 rounded-lg bg-[var(--color-background)]/40 px-2 py-1.5"
                    data-testid="planner-summary-priority-entry"
                  >
                    {/* Portrait */}
                    <CharPortrait
                      src={entry.portrait}
                      name={entry.name}
                      imgClassName="h-8 w-8 rounded-full object-cover flex-shrink-0"
                      fallbackClassName="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--color-surface-light)] text-xs font-bold text-[var(--color-muted)] flex-shrink-0"
                      data-testid="priority-portrait"
                    />
                    {/* Name + event count */}
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-[var(--color-foreground)] truncate">
                        {entry.name}
                      </p>
                      <p className="text-[10px] text-[var(--color-muted)]">
                        Needed for {entry.events.length} event
                        {entry.events.length !== 1 ? "s" : ""}
                      </p>
                    </div>
                    {/* Readiness dot */}
                    <span
                      className={`h-3 w-3 rounded-full flex-shrink-0 ${dot.color}`}
                      title={dot.label}
                      data-testid="priority-dot"
                    />
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
