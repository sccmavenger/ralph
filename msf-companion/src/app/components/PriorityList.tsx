"use client";

import { useMemo } from "react";
import Link from "next/link";
import { CharPortrait } from "@/app/components/CharPortrait";

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

function SkeletonPriorityCard() {
  return (
    <div className="animate-pulse flex items-center gap-3 rounded-xl bg-[var(--color-surface)] p-3">
      <div className="min-w-[20px] h-4 w-5 rounded bg-[var(--color-surface-light)]" />
      <div className="h-10 w-10 rounded-full bg-[var(--color-surface-light)] flex-shrink-0" />
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="h-3 w-24 rounded bg-[var(--color-surface-light)]" />
        <div className="h-2 w-full rounded bg-[var(--color-surface-light)]" />
        <div className="h-2 w-16 rounded bg-[var(--color-surface-light)]" />
        <div className="h-2 w-20 rounded bg-[var(--color-surface-light)]" />
      </div>
      <div className="h-3 w-3 rounded-full bg-[var(--color-surface-light)] flex-shrink-0" />
    </div>
  );
}

export default function PriorityList({
  priorities,
  loading,
}: {
  priorities: PriorityEntry[] | null;
  loading: boolean;
}) {
  // eslint-disable-next-line react-hooks/purity -- Date.now() needed for "days until" display
  const now = useMemo(() => Date.now(), []);

  if (loading && !priorities) {
    return (
      <section data-testid="priority-list">
        <h3 className="mb-2 text-sm font-semibold text-[var(--color-foreground)]">
          Top Investments
        </h3>
        <div className="space-y-2">
          <SkeletonPriorityCard />
          <SkeletonPriorityCard />
          <SkeletonPriorityCard />
        </div>
      </section>
    );
  }

  if (!priorities || priorities.length === 0) return null;

  const maxScore = priorities[0]?.score ?? 1;

  return (
    <section data-testid="priority-list">
      <h3 className="mb-2 text-sm font-semibold text-[var(--color-foreground)]">
        Top Investments
      </h3>
      <div className="space-y-2">
        {priorities.map((entry) => {
          const nearestEvent = entry.events[0];
          const daysUntil = nearestEvent
            ? Math.max(
                0,
                Math.round(
                  (new Date(nearestEvent.startTime).getTime() - now) /
                    (1000 * 60 * 60 * 24),
                ),
              )
            : 0;

          const scorePercent = maxScore > 0 ? (entry.score / maxScore) * 100 : 0;

          return (
            <div
              key={entry.characterId}
              className="flex items-center gap-3 rounded-xl bg-[var(--color-surface)] p-3"
              data-testid="priority-entry"
            >
              <span className="min-w-[20px] text-sm font-bold text-[var(--color-accent)]">
                {entry.rank}
              </span>
              <CharPortrait
                src={entry.portrait}
                name={entry.name}
                imgClassName="h-10 w-10 rounded-full object-cover"
                fallbackClassName="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--color-surface-light)] text-xs font-bold text-[var(--color-muted)]"
              />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-[var(--color-foreground)] truncate">
                  {entry.name}
                </p>
                {/* Priority score bar */}
                <div
                  className="my-1 h-1.5 w-full rounded-full bg-[var(--color-surface-light)]"
                  data-testid="score-bar"
                >
                  <div
                    className="h-full rounded-full bg-[var(--color-accent)]"
                    style={{
                      width: `${scorePercent}%`,
                      minWidth: scorePercent > 0 ? "4px" : "0",
                    }}
                  />
                </div>
                <div className="flex flex-wrap gap-1 my-0.5">
                  {entry.events.map((evt) => (
                    <span
                      key={evt.id}
                      className="rounded bg-[var(--color-surface-light)] px-1 py-0.5 text-[8px] text-[var(--color-muted)]"
                      data-testid="event-tag"
                    >
                      {evt.name}
                    </span>
                  ))}
                </div>
                <p className="text-[9px] text-[var(--color-muted)]">
                  Needed for {entry.events.length} event
                  {entry.events.length !== 1 ? "s" : ""}, nearest starts in{" "}
                  {daysUntil} days
                </p>
                <p
                  className="text-[9px] font-bold text-[var(--color-foreground)]"
                  data-testid="gear-progression"
                >
                  T{entry.currentGear} → T{entry.requiredGear}
                </p>
              </div>
              <Link
                href={`/analyze/farming?character=${encodeURIComponent(entry.name)}`}
                className="flex-shrink-0 rounded-md bg-amber-500/20 p-1 text-amber-400 hover:bg-amber-500/30"
                data-testid="farm-link"
                title={`Farm resources for ${entry.name}`}
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                </svg>
              </Link>
            </div>
          );
        })}
      </div>
    </section>
  );
}
