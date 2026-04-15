"use client";

import { useState, useEffect, useCallback } from "react";
import PriorityList from "@/app/components/PriorityList";
import { CharPortrait } from "@/app/components/CharPortrait";

interface GapEvent {
  eventId: string;
  eventName: string;
  type: string;
  startTime: string;
  endTime: string;
  readinessPercent: number;
  characters: Array<{
    id: string;
    name: string;
    portrait: string;
    currentGear: number;
    requiredGear: number;
    currentStars: number;
    requiredStars: number;
    meetsRequirements: boolean;
    owned: boolean;
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

function SkeletonCard() {
  return (
    <div className="animate-pulse rounded-xl bg-[var(--color-surface)] p-4">
      <div className="mb-2 h-4 w-3/4 rounded bg-[var(--color-surface-light)]" />
      <div className="mb-2 h-3 w-1/2 rounded bg-[var(--color-surface-light)]" />
      <div className="h-3 w-full rounded bg-[var(--color-surface-light)]" />
    </div>
  );
}

export default function PlannerPage() {
  const [gaps, setGaps] = useState<GapEvent[] | null>(null);
  const [priorities, setPriorities] = useState<PriorityEntry[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);

  const fetchData = useCallback(async (refresh = false) => {
    setLoading(true);
    setError(null);
    try {
      const qs = refresh ? "?refresh=true" : "";
      const [gapsRes, priRes] = await Promise.all([
        fetch(`/api/msf/planner/gaps${qs}`),
        fetch(`/api/msf/planner/priorities${qs}`),
      ]);

      if (!gapsRes.ok || !priRes.ok) {
        const errBody = await gapsRes.json().catch(() => null);
        if (errBody?.code === "MAINTENANCE") {
          setError("Game servers are in maintenance. Please try again later.");
        } else {
          setError("Failed to load planner data. Please try again.");
        }
        return;
      }

      const [gapsData, priData] = await Promise.all([
        gapsRes.json(),
        priRes.json(),
      ]);

      setGaps(gapsData);
      setPriorities(priData);
      setLastUpdated(new Date());
    } catch {
      setError("Failed to load planner data. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const selectedEvent = gaps?.find((g) => g.eventId === selectedEventId);

  const formatTimeAgo = (date: Date) => {
    const mins = Math.round((Date.now() - date.getTime()) / 60000);
    if (mins < 1) return "just now";
    if (mins === 1) return "1 minute ago";
    return `${mins} minutes ago`;
  };

  return (
    <div className="px-4 py-4">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-[var(--color-foreground)]">
            Investment Planner
          </h2>
          {lastUpdated && (
            <p
              className="text-xs text-[var(--color-muted)]"
              data-testid="last-updated"
            >
              Last updated: {formatTimeAgo(lastUpdated)}
            </p>
          )}
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="mb-4 rounded-xl bg-red-900/30 p-4 text-center">
          <p className="text-sm text-red-300">{error}</p>
          <button
            onClick={() => fetchData()}
            className="mt-2 text-xs text-[var(--color-accent)] underline"
          >
            Try Again
          </button>
        </div>
      )}

      {/* Loading state */}
      {loading && !gaps && (
        <div className="space-y-3">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      )}

      {/* Event Timeline */}
      {gaps && gaps.length > 0 && (
        <section className="mb-6" data-testid="event-timeline">
          <h3 className="mb-2 text-sm font-semibold text-[var(--color-foreground)]">
            Upcoming Events
          </h3>
          <div className="flex gap-3 overflow-x-auto pb-2" style={{ scrollSnapType: "x mandatory" }}>
            {gaps
              .sort(
                (a, b) =>
                  new Date(a.startTime).getTime() -
                  new Date(b.startTime).getTime(),
              )
              .map((event) => {
                const now = new Date();
                const start = new Date(event.startTime);
                const end = new Date(event.endTime);
                const isActive = start <= now && end >= now;
                const isFarFuture =
                  start.getTime() - now.getTime() > 30 * 24 * 60 * 60 * 1000;
                const isSelected = selectedEventId === event.eventId;

                const readinessColor =
                  event.readinessPercent >= 80
                    ? "bg-green-500"
                    : event.readinessPercent >= 50
                      ? "bg-yellow-500"
                      : "bg-red-500";

                return (
                  <button
                    key={event.eventId}
                    onClick={() => setSelectedEventId(event.eventId)}
                    className={`min-w-[160px] flex-shrink-0 rounded-xl p-3 text-left transition-all ${
                      isSelected
                        ? "ring-2 ring-[var(--color-accent)] bg-[var(--color-surface-light)]"
                        : "bg-[var(--color-surface)]"
                    } ${isFarFuture ? "opacity-50" : ""}`}
                    style={{ scrollSnapAlign: "start" }}
                    data-testid="event-card"
                  >
                    <div className="mb-1 flex items-center gap-1">
                      <span className="text-xs font-bold text-[var(--color-foreground)] line-clamp-1">
                        {event.eventName}
                      </span>
                    </div>
                    <div className="mb-1 flex items-center gap-1">
                      <span className="rounded bg-[var(--color-surface-light)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--color-muted)]" data-testid="type-badge">
                        {event.type}
                      </span>
                      {isActive && (
                        <span className="rounded bg-green-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
                          ACTIVE
                        </span>
                      )}
                    </div>
                    <p className="mb-2 text-[10px] text-[var(--color-muted)]" data-testid="date-range">
                      {start.toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                      })}{" "}
                      –{" "}
                      {end.toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                      })}
                    </p>
                    <div className="h-1.5 w-full rounded-full bg-[var(--color-surface-light)]" data-testid="readiness-bar">
                      <div
                        className={`h-full rounded-full ${readinessColor}`}
                        style={{
                          width: `${event.readinessPercent}%`,
                          minWidth: event.readinessPercent > 0 ? "4px" : "0",
                        }}
                      />
                    </div>
                    <p className="mt-1 text-[10px] text-[var(--color-muted)]">
                      {event.readinessPercent}% ready
                    </p>
                  </button>
                );
              })}
          </div>
        </section>
      )}

      {/* Event Detail */}
      <section className="mb-6" data-testid="event-detail">
        {!selectedEvent ? (
          <p className="text-center text-xs text-[var(--color-muted)]">
            Select an event above to see details
          </p>
        ) : (
          <div>
            <h3 className="mb-1 text-sm font-semibold text-[var(--color-foreground)]">
              {selectedEvent.eventName}
            </h3>
            <p className="mb-3 text-[10px] text-[var(--color-muted)]">
              {new Date(selectedEvent.startTime).toLocaleDateString()} –{" "}
              {new Date(selectedEvent.endTime).toLocaleDateString()} ·{" "}
              {selectedEvent.type}
            </p>

            {/* Character tiles */}
            <div className="grid grid-cols-4 gap-2 mb-3">
              {selectedEvent.characters.slice(0, 20).map((char) => {
                const gearDiff = char.requiredGear - char.currentGear;
                const gearColor =
                  gearDiff <= 0
                    ? "text-green-400"
                    : gearDiff <= 2
                      ? "text-yellow-400"
                      : "text-red-400";

                return (
                  <div
                    key={char.id}
                    className={`relative rounded-lg bg-[var(--color-surface)] p-1.5 text-center ${
                      !char.owned ? "opacity-50 grayscale" : ""
                    }`}
                    data-testid="character-tile"
                  >
                    <CharPortrait
                      src={char.portrait}
                      name={char.name}
                      imgClassName="mx-auto mb-1 h-10 w-10 rounded-full object-cover"
                      fallbackClassName="mx-auto mb-1 flex h-10 w-10 items-center justify-center rounded-full bg-[var(--color-surface-light)] text-xs font-bold text-[var(--color-muted)]"
                    />
                    <p className="text-[8px] font-medium text-[var(--color-foreground)] line-clamp-1">
                      {char.name}
                    </p>
                    <p className={`text-[8px] font-bold ${gearColor}`}>
                      T{char.currentGear}
                      {char.requiredGear > 0 &&
                        ` → T${char.requiredGear}`}
                    </p>
                    {!char.owned && (
                      <span className="absolute right-0 top-0 rounded-bl rounded-tr bg-red-600 px-1 py-0.5 text-[6px] font-bold text-white">
                        LOCKED
                      </span>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Cost summary */}
            <div
              className="rounded-lg bg-[var(--color-surface)] p-3"
              data-testid="cost-summary"
            >
              <p className="text-xs font-semibold text-[var(--color-foreground)]">
                Cost to Ready
              </p>
              <p className="text-[10px] text-[var(--color-muted)]">
                {selectedEvent.characters.filter((c) => !c.meetsRequirements)
                  .length}{" "}
                characters need upgrades ·{" "}
                {selectedEvent.readinessPercent}% ready
              </p>
              {(() => {
                const unready = selectedEvent.characters.filter(
                  (c) => !c.meetsRequirements,
                );
                if (unready.length === 0) {
                  return (
                    <p className="mt-1 flex items-center gap-1 text-[10px] text-green-400">
                      <span>✅</span> You can afford this
                    </p>
                  );
                }
                const shortNames = unready
                  .slice(0, 3)
                  .map((c) => c.name)
                  .join(", ");
                const more = unready.length > 3 ? ` +${unready.length - 3} more` : "";
                return (
                  <p className="mt-1 flex items-center gap-1 text-[10px] text-orange-400">
                    <span>⚠️</span> Short on: {shortNames}{more}
                  </p>
                );
              })()}
            </div>
          </div>
        )}
      </section>

      {/* Priority List */}
      <PriorityList priorities={priorities} loading={loading} />
    </div>
  );
}
