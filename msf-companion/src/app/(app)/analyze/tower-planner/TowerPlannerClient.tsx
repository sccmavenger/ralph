"use client";

import { useState, useEffect } from "react";
import type { UpgradeRecommendation } from "@/lib/tower-upgrades";

interface TowerRay {
  id: string;
  rooms: Array<{ id: string; name: string }>;
}

interface TowerData {
  id: string;
  eventId?: string;
  name: string;
  subName?: string;
  cardArt?: string;
  popupArt?: string;
  popupDetails?: string;
  endDate: string;
  currentWeek: number;
  rays: TowerRay[];
  completedTier?: number | null;
}

interface TowerEventsResponse {
  active: boolean;
  tower: TowerData | null;
  towers?: TowerData[];
}

interface CharacterFilter {
  allTraits: string[];
  anyTraits: string[];
  anyCharacters: string[];
  gearTier: number;
  minStars: number;
  minLevel: number;
}

interface RoomRequirements {
  traits: string[];
  minGearTier: number;
  minStars: number;
  minLevel: number;
  minCharacters?: number;
  maxCharacters?: number;
  filters?: CharacterFilter[];
  specificCharacters?: string[];
}

interface TowerRoom {
  id: string;
  rayId: string;
  name: string;
  requirements: RoomRequirements;
  week: 1 | 2;
  combatId?: string;
}

interface RoomReadiness {
  status: "ready" | "almost" | "blocked";
  eligibleCount: number;
}

interface TeamAssignment {
  characters: Array<{ id: string; name: string }>;
  power: number;
  confidence: "strong" | "shouldWork" | "risky" | "likelyLoss";
  reason: string;
  marginPct?: number;
  marginFallback?: boolean;
}

interface SolverResult {
  assignments: Record<string, TeamAssignment>;
  unassignableRooms: string[];
  opponentPowers?: Record<string, number>;
  opponentTeams?: Record<string, { combatId: string; totalPower: number }>;
  roomFetchErrors?: string[];
}

// Default safety margin (mirrors SAFETY_MARGIN_DEFAULT in src/lib/tower-solver.ts; US-006 will make this user-tunable).
const SAFETY_MARGIN_DEFAULT = 1.10;

interface TowerHistoryEntry {
  id: string;
  towerEventId: string;
  towerName: string;
  roomsCleared: number;
  totalRooms: number;
  completedAt: string;
}

const cellNumberOf = (name: string): number | null => {
  const m = name.match(/(\d+)/);
  return m ? parseInt(m[1], 10) : null;
};

// Compute the set of room IDs that the API says are cleared (cell# <= completedTier).
function computeAutoCleared(rooms: TowerRoom[], completedTier: number | null | undefined): Set<string> {
  const out = new Set<string>();
  if (typeof completedTier !== "number" || completedTier <= 0) return out;
  for (const r of rooms) {
    const c = cellNumberOf(r.name);
    if (c !== null && c <= completedTier) out.add(r.id);
  }
  return out;
}

export default function TowerPlannerClient() {
  const [loading, setLoading] = useState(true);
  const [towerData, setTowerData] = useState<TowerEventsResponse | null>(null);
  const [activeTowerIndex, setActiveTowerIndex] = useState(0);
  const [rooms, setRooms] = useState<TowerRoom[]>([]);
  const [roomReadiness, setRoomReadiness] = useState<Map<string, RoomReadiness>>(new Map());
  const [solverResult, setSolverResult] = useState<SolverResult | null>(null);
  const [solving, setSolving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clearedRooms, setClearedRooms] = useState<Set<string>>(new Set());
  const [refreshing, setRefreshing] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [upgrades, setUpgrades] = useState<UpgradeRecommendation[]>([]);
  const [howItWorksExpanded, setHowItWorksExpanded] = useState(false);
  const [history, setHistory] = useState<TowerHistoryEntry[]>([]);

  useEffect(() => {
    // Check if first visit
    const seen = localStorage.getItem("tower-planner-seen");
    if (!seen) {
      setHowItWorksExpanded(true);
      localStorage.setItem("tower-planner-seen", "1");
    }
    // One-time cleanup of legacy `tower-cleared-*` keys. The old code persisted cleared cells to
    // localStorage, and a prior pairing bug saved corrupted data under both tower IDs. The API's
    // completedTier is now the single source of truth, so wipe these stale keys.
    try {
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i);
        if (k && k.startsWith("tower-cleared-")) localStorage.removeItem(k);
      }
    } catch {
      /* ignore */
    }
  }, []);

  // Active tower derived from towerData + activeTowerIndex. Returns null until towerData loads.
  function getActiveTower(): TowerData | null {
    if (!towerData) return null;
    const list = towerData.towers ?? (towerData.tower ? [towerData.tower] : []);
    return list[activeTowerIndex] ?? null;
  }

  // Cleared rooms are derived primarily from the API's `completedTier` (authoritative per tower).
  // Manual "Mark Cleared" is an in-memory prediction layer for cells the API hasn't seen yet —
  // not persisted, so switching tabs or refreshing always reflects the real game state.
  function markRoomCleared(roomId: string) {
    setClearedRooms((prev) => {
      const next = new Set(prev);
      next.add(roomId);
      return next;
    });
  }

  function resetAllCleared() {
    // Reset to API truth: cells with cell# <= completedTier remain cleared.
    const t = getActiveTower();
    if (!t) {
      setClearedRooms(new Set<string>());
    } else {
      setClearedRooms(computeAutoCleared(rooms, t.completedTier));
    }
    setShowResetConfirm(false);
  }

  async function handleRefreshProgress() {
    const t = getActiveTower();
    if (!t) return;
    setRefreshing(true);
    try {
      const roomsRes = await fetch(`/api/tower/rooms?towerId=${t.id}`);
      if (roomsRes.ok) {
        const roomsData: TowerRoom[] = await roomsRes.json();
        setRooms(roomsData);
      }
    } finally {
      setRefreshing(false);
    }
  }

  useEffect(() => {
    async function fetchTowerStatus() {
      try {
        const res = await fetch("/api/tower/events");
        if (!res.ok) throw new Error("Failed to fetch tower status");
        const data: TowerEventsResponse = await res.json();
        setTowerData(data);
        setActiveTowerIndex(0);

        // Always fetch history (even when no active tower)
        const historyRes = await fetch("/api/tower/history");
        if (historyRes.ok) {
          const historyData: TowerHistoryEntry[] = await historyRes.json();
          setHistory(historyData);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    }

    fetchTowerStatus();
  }, []);

  // Load per-tower data (rooms, readiness, upgrades) whenever the active tower changes. Always
  // re-fetches `/api/tower/events` first so the freshly-clicked tab uses the latest in-game
  // `completedTier` (which is the authoritative source for cleared cells per tower).
  useEffect(() => {
    const towers = towerData?.towers ?? (towerData?.tower ? [towerData.tower] : []);
    const activeTowerInitial = towers[activeTowerIndex];
    if (!activeTowerInitial) return;
    let cancelled = false;
    (async () => {
      // Clear stale state so the UI doesn't show the previous tower's cells while loading.
      setClearedRooms(new Set<string>());
      setSolverResult(null);
      setRooms([]);
      setRoomReadiness(new Map());
      setUpgrades([]);
      try {
        // Re-fetch events to get the latest completedTier for the clicked tower.
        let activeTower = activeTowerInitial;
        try {
          const evRes = await fetch("/api/tower/events", { cache: "no-store" });
          if (!cancelled && evRes.ok) {
            const fresh: TowerEventsResponse = await evRes.json();
            const freshList = fresh.towers ?? (fresh.tower ? [fresh.tower] : []);
            const match = freshList.find((t) => t.id === activeTowerInitial.id);
            if (match) {
              activeTower = match;
              setTowerData(fresh);
            }
          }
        } catch {
          /* fall back to existing towerData */
        }
        if (cancelled) return;

        const roomsRes = await fetch(`/api/tower/rooms?towerId=${activeTower.id}`);
        if (!cancelled && roomsRes.ok) {
          const roomsData: TowerRoom[] = await roomsRes.json();
          setRooms(roomsData);
          // Derive cleared cells purely from API completedTier. No localStorage union.
          setClearedRooms(computeAutoCleared(roomsData, activeTower.completedTier));
        }
        const readinessRes = await fetch(`/api/tower/readiness?towerId=${activeTower.id}`);
        if (!cancelled && readinessRes.ok) {
          const readinessData: Record<string, RoomReadiness> = await readinessRes.json();
          setRoomReadiness(new Map(Object.entries(readinessData)));
        }
        const upgradesRes = await fetch(`/api/tower/upgrades?towerId=${activeTower.id}`);
        if (!cancelled && upgradesRes.ok) setUpgrades(await upgradesRes.json());
      } catch (err) {
        console.error("[TowerPlanner] Tower switch fetch error:", err);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTowerIndex, towerData?.towers?.length]);

  if (loading) {
    return (
      <div className="flex flex-col gap-4 p-4" data-testid="tower-planner-loading">
        <div className="h-8 w-48 animate-pulse rounded bg-gray-700" />
        <div className="h-4 w-32 animate-pulse rounded bg-gray-700" />
        <div className="h-64 animate-pulse rounded bg-gray-800" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 text-red-400" data-testid="tower-planner-error">
        <p>Error loading tower data: {error}</p>
      </div>
    );
  }

  if (!towerData?.active || !towerData.tower) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 p-8 text-center" data-testid="tower-planner-empty">
        <svg
          className="h-16 w-16 text-gray-500"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-6h6v6"
          />
        </svg>
        <h2 className="text-lg font-semibold text-gray-300">No tower event running right now</h2>
        <p className="text-sm text-gray-500">Check back when one starts.</p>
      </div>
    );
  }

  const allTowers = towerData.towers ?? [towerData.tower];
  const tower = allTowers[activeTowerIndex] ?? towerData.tower;
  const endDate = new Date(tower.endDate);
  const msLeft = Math.max(0, endDate.getTime() - Date.now());
  const daysLeft = Math.floor(msLeft / 86_400_000);
  const hoursLeft = Math.floor((msLeft % 86_400_000) / 3_600_000);

  // Calculate summary counts
  const readyCount = [...roomReadiness.values()].filter((r) => r.status === "ready").length;
  const almostCount = [...roomReadiness.values()].filter((r) => r.status === "almost").length;
  const blockedCount = [...roomReadiness.values()].filter((r) => r.status === "blocked").length;
  const totalRooms = rooms.length;
  const clearable = readyCount + almostCount;

  // Game-order: cells are presented as a single linear sequence (CELL 1 .. CELL N).
  // The game UI lists them top-down with the highest cell at the top, current/next cell
  // highlighted, and previously cleared cells dimmed below it. We mirror that.
  const cellOf = (r: TowerRoom): number => cellNumberOf(r.name) ?? 0;
  const roomsByCellDesc = [...rooms].sort((a, b) => cellOf(b) - cellOf(a));
  const clearedSet = clearedRooms;
  // The next cell to clear = (highest cleared cell number) + 1.
  const maxClearedCell = rooms.reduce(
    (max, r) => (clearedSet.has(r.id) ? Math.max(max, cellOf(r)) : max),
    0
  );
  const nextCellNumber = maxClearedCell + 1;
  const isAvailableNow = (r: TowerRoom): boolean =>
    !clearedSet.has(r.id) && cellOf(r) === nextCellNumber;
  const availableNowCount = rooms.filter((r) => isAvailableNow(r)).length;

  async function handlePickMyTeams() {
    setSolving(true);
    try {
      const res = await fetch("/api/tower/solve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          towerId: tower.id,
          clearedRooms: [...clearedRooms],
          metaTeams: [],
        }),
      });
      if (res.ok) {
        const data: SolverResult = await res.json();
        setSolverResult(data);
      } else {
        const errText = await res.text().catch(() => "");
        console.error(`[TowerPlanner] Solve API failed: ${res.status} ${errText}`);
      }
    } catch (err) {
      console.error("[TowerPlanner] Solve error:", err);
    } finally {
      setSolving(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 p-4" data-testid="tower-planner-active">
      {/* Tower selector tabs (shown when multiple towers are active simultaneously, e.g. STORM + STORM OMEGA). */}
      {allTowers.length > 1 && (
        <div className="flex flex-wrap gap-2" data-testid="tower-tabs">
          {allTowers.map((t, i) => (
            <button
              key={t.id}
              onClick={() => setActiveTowerIndex(i)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                i === activeTowerIndex
                  ? "bg-purple-600 text-white"
                  : "border border-gray-600 text-gray-300 hover:bg-gray-800"
              }`}
              data-testid={`tower-tab-${i}`}
              aria-pressed={i === activeTowerIndex}
            >
              {t.name}
            </button>
          ))}
        </div>
      )}
      {/* Event banner — mirrors the in-game event-selection card (cardArt + name + subName + countdown). */}
      <div
        className="relative overflow-hidden rounded-lg border border-gray-700 bg-gray-900"
        data-testid="tower-event-banner"
      >
        {tower.cardArt && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={tower.cardArt}
            alt={tower.name}
            className="h-32 w-full object-cover opacity-80"
          />
        )}
        <div
          className={
            tower.cardArt
              ? "absolute inset-0 flex flex-col justify-end gap-1 bg-gradient-to-t from-gray-900 via-gray-900/70 to-transparent p-3"
              : "flex flex-col gap-1 p-3"
          }
        >
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-lg font-bold text-white drop-shadow" data-testid="tower-name">
              {tower.name}
            </h1>
            <span
              className="rounded-full bg-purple-600 px-2 py-0.5 text-[10px] font-medium text-white"
              data-testid="tower-week"
            >
              Week {tower.currentWeek}
            </span>
          </div>
          {tower.subName && (
            <p className="text-xs text-gray-200 drop-shadow" data-testid="tower-subname">
              {tower.subName}
            </p>
          )}
          <p className="text-[11px] text-gray-300 drop-shadow" data-testid="tower-ends-in">
            {msLeft > 0 ? (
              <>Ends in {daysLeft}d {hoursLeft}h · {endDate.toLocaleDateString()}</>
            ) : (
              <>Ended</>
            )}
          </p>
        </div>
      </div>

      {/* How It Works */}
      <div className="rounded-lg border border-gray-700 bg-gray-800/50" data-testid="how-it-works-section">
        <button
          onClick={() => setHowItWorksExpanded(!howItWorksExpanded)}
          className="flex w-full items-center justify-between p-3 text-left"
          data-testid="how-it-works-toggle"
        >
          <span className="text-sm font-medium text-gray-300">How Tower Events Work</span>
          <span className="text-xs text-gray-500">{howItWorksExpanded ? "▲" : "▼"}</span>
        </button>
        {howItWorksExpanded && (
          <div className="border-t border-gray-700 p-3" data-testid="how-it-works-content">
            <ol className="flex flex-col gap-2 text-xs text-gray-400 list-decimal pl-4">
              <li data-testid="how-step-1">Each battle has trait rules — only characters with matching traits can enter</li>
              <li data-testid="how-step-2">Used teams get locked for the week — plan carefully to maximize clears</li>
              <li data-testid="how-step-3">We plan your teams so you clear the most rooms with what you have</li>
            </ol>
          </div>
        )}
      </div>

      {/* Summary bar */}
      {totalRooms > 0 && (
        <div className="rounded-lg bg-gray-800 p-3" data-testid="tower-summary-bar">
          <div className="flex items-center gap-3 text-sm">
            <span className="text-blue-300" data-testid="available-now-count">{availableNowCount} available now</span>
            <span className="text-gray-500">·</span>
            <span className="text-green-400">{readyCount} ready</span>
            <span className="text-yellow-400">{almostCount} almost</span>
            <span className="text-red-400">{blockedCount} blocked</span>
          </div>
          <p className="mt-1 text-xs text-gray-400">
            <span className="text-gray-300">{availableNowCount}</span> cells lit up in-game right now · you can likely clear <span className="text-gray-300">{clearable}</span> of <span className="text-gray-300">{totalRooms}</span> across the whole tower
          </p>
        </div>
      )}

      {/* Upgrade recommendations */}
      {upgrades.length > 0 && blockedCount > 0 && (
        <div className="rounded-lg border border-yellow-700/50 bg-yellow-900/20 p-3" data-testid="upgrades-section">
          <h3 className="text-sm font-semibold text-yellow-300">Things That Would Help You</h3>
          <ul className="mt-2 flex flex-col gap-2">
            {upgrades.map((u, i) => (
              <li key={i} className="text-xs text-gray-300" data-testid="upgrade-item">
                <span className="font-medium text-white">{u.characterName}</span>
                {": "}
                {u.upgradeType === "gear" ? "Gear" : u.upgradeType === "stars" ? "Stars" : "Level"}{" "}
                {u.currentValue} → {u.targetValue}
                <span className="ml-2 text-yellow-400">
                  (unlocks {u.roomsUnlocked.length} room{u.roomsUnlocked.length !== 1 ? "s" : ""})
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Pick My Teams button */}
      {totalRooms > 0 && (
        <button
          onClick={handlePickMyTeams}
          disabled={solving}
          className="w-full rounded-lg bg-purple-600 py-3 text-sm font-semibold text-white transition-colors hover:bg-purple-700 disabled:opacity-50"
          data-testid="pick-my-teams-btn"
        >
          {solving ? "Solving..." : "Pick My Teams"}
        </button>
      )}

      {/* Progress controls */}
      {totalRooms > 0 && (
        <div className="flex gap-2" data-testid="progress-controls">
          <button
            onClick={handleRefreshProgress}
            disabled={refreshing}
            className="flex-1 rounded-lg border border-gray-600 py-2 text-xs text-gray-300 hover:bg-gray-700 disabled:opacity-50"
            data-testid="refresh-progress-btn"
          >
            {refreshing ? "Refreshing..." : "Refresh Progress"}
          </button>
          <button
            onClick={() => setShowResetConfirm(true)}
            className="flex-1 rounded-lg border border-red-600/50 py-2 text-xs text-red-400 hover:bg-red-900/20"
            data-testid="reset-all-btn"
          >
            Reset All
          </button>
        </div>
      )}

      {/* Reset confirmation dialog */}
      {showResetConfirm && (
        <div className="rounded-lg border border-red-600 bg-gray-900 p-3" data-testid="reset-confirm-dialog">
          <p className="text-sm text-gray-300">Clear all manual progress marks?</p>
          <div className="mt-2 flex gap-2">
            <button
              onClick={resetAllCleared}
              className="flex-1 rounded bg-red-600 py-1 text-xs text-white"
              data-testid="reset-confirm-yes"
            >
              Yes, reset
            </button>
            <button
              onClick={() => setShowResetConfirm(false)}
              className="flex-1 rounded border border-gray-600 py-1 text-xs text-gray-300"
              data-testid="reset-confirm-no"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Rooms in game order: highest cell at the top, descending. Matches the in-game tower view. */}
      <div className="flex flex-col gap-3" data-testid="tower-room-list">
        {roomsByCellDesc.map((room) => {
          const opponentPower = solverResult?.opponentPowers?.[room.id];
          // A room is "data unavailable" when it had a combatId we tried to fetch but failed.
          // Rooms with no combatId at all silently use the legacy path with no message.
          const enemyFetchFailed = !!(
            room.combatId &&
            solverResult?.roomFetchErrors?.includes(room.combatId)
          );
          return (
            <RoomCard
              key={room.id}
              room={room}
              readiness={roomReadiness.get(room.id)}
              assignment={solverResult?.assignments[room.id]}
              cleared={clearedRooms.has(room.id)}
              availableNow={isAvailableNow(room)}
              onMarkCleared={() => markRoomCleared(room.id)}
              opponentPower={opponentPower}
              enemyFetchFailed={enemyFetchFailed}
            />
          );
        })}
      </div>

      {/* History Section */}
      <div className="mt-6" data-testid="tower-history-section">
        <h3 className="text-sm font-semibold text-gray-300 mb-3">History</h3>
        {history.length === 0 ? (
          <p className="text-xs text-gray-500" data-testid="history-empty">Complete your first tower to see history here</p>
        ) : (
          <div className="flex flex-col gap-2">
            {history.map((entry, i) => {
              const prev = history[i + 1];
              const diff = prev ? entry.roomsCleared - prev.roomsCleared : null;
              return (
                <div key={entry.id} className="flex items-center justify-between rounded-lg bg-gray-800/50 p-3" data-testid="history-entry">
                  <div>
                    <span className="text-xs text-white font-medium">{entry.towerName}</span>
                    <span className="ml-2 text-xs text-gray-400">{new Date(entry.completedAt).toLocaleDateString()}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-300">{entry.roomsCleared}/{entry.totalRooms}</span>
                    {diff === null ? (
                      <span className="text-xs text-gray-500" data-testid="history-first">First time</span>
                    ) : diff > 0 ? (
                      <span className="text-xs text-green-400" data-testid="history-up">↑{diff}</span>
                    ) : diff < 0 ? (
                      <span className="text-xs text-red-400" data-testid="history-down">↓{Math.abs(diff)}</span>
                    ) : (
                      <span className="text-xs text-gray-500">=</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function formatFilters(filters: CharacterFilter[]): string {
  const parts = filters.map((f) => {
    const tokens: string[] = [];
    if (f.allTraits.length > 0) tokens.push(f.allTraits.join("+"));
    if (f.anyTraits.length > 0) tokens.push(`any of ${f.anyTraits.join("/")}`);
    if (f.anyCharacters.length > 0) tokens.push(`${f.anyCharacters.length} specific char${f.anyCharacters.length > 1 ? "s" : ""}`);
    if (f.gearTier > 0) tokens.push(`G${f.gearTier}+`);
    if (f.minStars > 0) tokens.push(`${f.minStars}★+`);
    if (f.minLevel > 0) tokens.push(`Lv${f.minLevel}+`);
    return tokens.join(" ");
  });
  return parts.join(" OR ");
}

function marginColorClass(marginPct: number): string {
  // Green >=25%, yellow 10-25%, red <10% (but >=0), deep-red <0%.
  if (marginPct < 0) return "text-red-700";
  if (marginPct < 10) return "text-red-400";
  if (marginPct < 25) return "text-yellow-400";
  return "text-green-400";
}

function RoomCard({ room, readiness, assignment, cleared, availableNow = false, onMarkCleared, opponentPower, enemyFetchFailed = false }: { room: TowerRoom; readiness?: RoomReadiness; assignment?: TeamAssignment; cleared: boolean; availableNow?: boolean; onMarkCleared: () => void; opponentPower?: number; enemyFetchFailed?: boolean }) {
  const [showReason, setShowReason] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const status = readiness?.status || "blocked";
  const eligibleCount = readiness?.eligibleCount || 0;

  const badgeConfig = {
    ready: { text: "Ready to go", className: "bg-green-600 text-white" },
    almost: { text: "Almost there", className: "bg-yellow-600 text-white" },
    blocked: { text: "Not possible yet", className: "bg-red-600 text-white" },
  };

  const confidenceConfig = {
    strong: { text: "Strong pick", className: "bg-green-600 text-white" },
    shouldWork: { text: "Should work", className: "bg-yellow-600 text-white" },
    risky: { text: "Risky", className: "bg-orange-600 text-white" },
    likelyLoss: { text: "Likely loss", className: "bg-red-700 text-white" },
  };

  const badge = badgeConfig[status];

  return (
      <div className={`rounded-lg border p-3 ${cleared ? "border-gray-700 bg-gray-800/30 opacity-50" : availableNow ? "border-blue-500/60 bg-gray-800/70" : "border-gray-700 bg-gray-800/40 opacity-70"}`} data-testid="room-card" data-room-id={room.id} data-available-now={availableNow ? "true" : "false"}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-baseline gap-2 min-w-0">
          <h3 className="text-base font-bold text-white truncate" data-testid="room-cell-name">{room.name}</h3>
        </div>
        {cleared ? (
          <span className="text-xs text-green-400 font-medium whitespace-nowrap" data-testid="cleared-badge">✓ Cleared</span>
        ) : (
          <div className="flex items-center gap-1.5 whitespace-nowrap">
            {availableNow && (
              <span className="rounded-full bg-blue-600 px-2 py-0.5 text-[10px] font-medium text-white" data-testid="available-now-badge">Lit up</span>
            )}
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${badge.className}`} data-testid="readiness-badge">
              {badge.text}
            </span>
          </div>
        )}
      </div>
      <div className="mt-2 flex flex-wrap gap-2 text-xs text-gray-400">
        {room.requirements.filters && room.requirements.filters.length > 0 ? (
          <span>{formatFilters(room.requirements.filters)}</span>
        ) : (
          <>
            {room.requirements.traits.length > 0 && (
              <span>Traits: {room.requirements.traits.join(", ")}</span>
            )}
            {room.requirements.minGearTier > 0 && <span>G{room.requirements.minGearTier}+</span>}
            {room.requirements.minStars > 0 && <span>{room.requirements.minStars}★+</span>}
            {room.requirements.minLevel > 0 && <span>Lv{room.requirements.minLevel}+</span>}
            {!room.requirements.minGearTier &&
              !room.requirements.minStars &&
              !room.requirements.minLevel &&
              room.requirements.traits.length === 0 && (
                <span className="text-gray-500">No trait restrictions</span>
              )}
          </>
        )}
        {room.requirements.maxCharacters && room.requirements.maxCharacters !== 5 && (
          <span className="text-gray-500">
            ({room.requirements.minCharacters === room.requirements.maxCharacters
              ? `${room.requirements.maxCharacters} chars`
              : `${room.requirements.minCharacters ?? 1}-${room.requirements.maxCharacters} chars`})
          </span>
        )}
      </div>
      {!cleared && (
        <div className="mt-1 flex items-center justify-between text-xs text-gray-500">
          <span>{eligibleCount} eligible character{eligibleCount !== 1 ? "s" : ""}</span>
          <button
            onClick={onMarkCleared}
            className="text-green-400 hover:text-green-300"
            data-testid="mark-cleared-btn"
          >
            Mark as Cleared
          </button>
        </div>
      )}

      {/* Solver assignment */}
      {assignment && !cleared && (
        <div className="mt-3 border-t border-gray-700 pt-3" data-testid="team-assignment">
          {/* Fallback warning when no eligible team meets the safety margin. */}
          {assignment.marginFallback && (
            <div
              className="mb-2 rounded border border-red-600 bg-red-900/30 p-2 text-xs text-red-300"
              data-testid="margin-fallback-warning"
              role="alert"
            >
              No team meets the recommended {SAFETY_MARGIN_DEFAULT.toFixed(2)}x safety margin — best available shown.
            </div>
          )}
          {/* Muted notice when the opponent fetch failed; solver fell back to legacy entry-requirement-based selection. */}
          {enemyFetchFailed && (
            <div
              className="mb-2 text-xs text-gray-500"
              data-testid="opponent-data-unavailable"
            >
              Opponent data unavailable
            </div>
          )}
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-300">
              {assignment.characters.map((c) => c.name).join(", ")}
            </span>
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${confidenceConfig[assignment.confidence].className}`} data-testid="confidence-badge">
              {confidenceConfig[assignment.confidence].text}
            </span>
          </div>
          <div className="mt-1 flex flex-wrap items-center justify-between gap-x-3 text-xs text-gray-500">
            <div className="flex flex-wrap items-center gap-x-3">
              <span data-testid="team-power">Team: {(assignment.power / 1000).toFixed(0)}k</span>
              {typeof opponentPower === "number" && opponentPower > 0 && (
                <span data-testid="opponent-power">Opp: {(opponentPower / 1000).toFixed(0)}k</span>
              )}
              {typeof assignment.marginPct === "number" && (
                <span
                  className={`font-medium ${marginColorClass(assignment.marginPct)}`}
                  data-testid="margin-pct"
                >
                  Margin: {assignment.marginPct >= 0 ? "+" : ""}{assignment.marginPct}%
                </span>
              )}
            </div>
            <button
              onClick={() => setShowPicker(!showPicker)}
              className="text-purple-400 hover:text-purple-300"
              data-testid="edit-assignment-btn"
            >
              Edit
            </button>
          </div>
          <button
            onClick={() => setShowReason(!showReason)}
            className="mt-1 text-xs text-purple-400 hover:text-purple-300"
            data-testid="why-this-team"
          >
            {showReason ? "Hide" : "Why this team?"}
          </button>
          {showReason && (
            <p className="mt-1 text-xs text-gray-400">{assignment.reason}</p>
          )}
          {showPicker && (
            <div className="mt-2 rounded border border-gray-600 bg-gray-900 p-2" data-testid="character-picker">
              <p className="text-xs text-gray-400 mb-2">Select characters for this room (eligible only):</p>
              <div className="flex flex-wrap gap-1">
                {assignment.characters.map((c) => (
                  <span key={c.id} className="rounded bg-purple-700 px-2 py-0.5 text-xs text-white">
                    {c.name}
                  </span>
                ))}
              </div>
              <button
                onClick={() => setShowPicker(false)}
                className="mt-2 w-full rounded bg-purple-600 py-1 text-xs text-white"
                data-testid="confirm-override-btn"
              >
                Confirm & Re-solve Others
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
