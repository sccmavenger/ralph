"use client";

import { useState, useEffect } from "react";

interface TowerRay {
  id: string;
  rooms: Array<{ id: string; name: string }>;
}

interface TowerData {
  id: string;
  name: string;
  endDate: string;
  currentWeek: number;
  rays: TowerRay[];
}

interface TowerEventsResponse {
  active: boolean;
  tower: TowerData | null;
}

interface RoomRequirements {
  traits: string[];
  minGearTier: number;
  minStars: number;
  minLevel: number;
}

interface TowerRoom {
  id: string;
  rayId: string;
  name: string;
  requirements: RoomRequirements;
  week: 1 | 2;
}

interface RoomReadiness {
  status: "ready" | "almost" | "blocked";
  eligibleCount: number;
}

export default function TowerPlannerClient() {
  const [loading, setLoading] = useState(true);
  const [towerData, setTowerData] = useState<TowerEventsResponse | null>(null);
  const [rooms, setRooms] = useState<TowerRoom[]>([]);
  const [roomReadiness, setRoomReadiness] = useState<Map<string, RoomReadiness>>(new Map());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchTowerStatus() {
      try {
        const res = await fetch("/api/tower/events");
        if (!res.ok) throw new Error("Failed to fetch tower status");
        const data: TowerEventsResponse = await res.json();
        setTowerData(data);

        if (data.active && data.tower) {
          // Fetch rooms
          const roomsRes = await fetch(`/api/tower/rooms?towerId=${data.tower.id}`);
          if (roomsRes.ok) {
            const roomsData: TowerRoom[] = await roomsRes.json();
            setRooms(roomsData);

            // Fetch readiness (simple version — uses roster from API)
            const readinessRes = await fetch(`/api/tower/readiness?towerId=${data.tower.id}`);
            if (readinessRes.ok) {
              const readinessData: Record<string, RoomReadiness> = await readinessRes.json();
              setRoomReadiness(new Map(Object.entries(readinessData)));
            }
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    }

    fetchTowerStatus();
  }, []);

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

  const { tower } = towerData;
  const endDate = new Date(tower.endDate);
  const daysLeft = Math.max(0, Math.ceil((endDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)));

  // Calculate summary counts
  const readyCount = [...roomReadiness.values()].filter((r) => r.status === "ready").length;
  const almostCount = [...roomReadiness.values()].filter((r) => r.status === "almost").length;
  const blockedCount = [...roomReadiness.values()].filter((r) => r.status === "blocked").length;
  const totalRooms = rooms.length;
  const clearable = readyCount + almostCount;

  // Separate rooms by week
  const week1Rooms = rooms.filter((r) => r.week === 1);
  const week2Rooms = rooms.filter((r) => r.week === 2);

  // Calculate Week 2 unlock date (7 days after event start)
  const week2UnlockDate = new Date(endDate.getTime() - 7 * 24 * 60 * 60 * 1000);

  return (
    <div className="flex flex-col gap-4 p-4" data-testid="tower-planner-active">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-bold text-white">{tower.name}</h1>
        <span className="rounded-full bg-purple-600 px-3 py-1 text-xs font-medium text-white">
          Week {tower.currentWeek}
        </span>
      </div>
      <p className="text-sm text-gray-400">
        Ends {endDate.toLocaleDateString()} ({daysLeft} day{daysLeft !== 1 ? "s" : ""} left)
      </p>

      {/* Summary bar */}
      {totalRooms > 0 && (
        <div className="rounded-lg bg-gray-800 p-3" data-testid="tower-summary-bar">
          <div className="flex items-center gap-3 text-sm">
            <span className="text-green-400">{readyCount} ready</span>
            <span className="text-yellow-400">{almostCount} almost</span>
            <span className="text-red-400">{blockedCount} blocked</span>
          </div>
          <p className="mt-1 text-xs text-gray-400">
            You can likely clear {clearable} of {totalRooms} battles this tower
          </p>
        </div>
      )}

      {/* Week 1 Rooms */}
      <div className="flex flex-col gap-3" data-testid="tower-room-list">
        {week1Rooms.map((room) => (
          <RoomCard key={room.id} room={room} readiness={roomReadiness.get(room.id)} />
        ))}

        {/* Week 2 Divider */}
        {week2Rooms.length > 0 && (
          <div className="my-2 flex items-center gap-2" data-testid="week-2-divider">
            <div className="flex-1 border-t border-gray-700" />
            <span className="text-xs text-gray-400">
              Week 2 — unlocks {week2UnlockDate.toLocaleDateString()}
            </span>
            <div className="flex-1 border-t border-gray-700" />
          </div>
        )}

        {/* Week 2 Rooms */}
        {week2Rooms.map((room) => (
          <RoomCard key={room.id} room={room} readiness={roomReadiness.get(room.id)} />
        ))}
      </div>
    </div>
  );
}

function RoomCard({ room, readiness }: { room: TowerRoom; readiness?: RoomReadiness }) {
  const status = readiness?.status || "blocked";
  const eligibleCount = readiness?.eligibleCount || 0;

  const badgeConfig = {
    ready: { text: "Ready to go", className: "bg-green-600 text-white" },
    almost: { text: "Almost there", className: "bg-yellow-600 text-white" },
    blocked: { text: "Not possible yet", className: "bg-red-600 text-white" },
  };

  const badge = badgeConfig[status];

  return (
    <div className="rounded-lg border border-gray-700 bg-gray-800/50 p-3" data-testid="room-card">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-white">{room.name}</h3>
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${badge.className}`} data-testid="readiness-badge">
          {badge.text}
        </span>
      </div>
      <div className="mt-2 flex flex-wrap gap-2 text-xs text-gray-400">
        {room.requirements.traits.length > 0 && (
          <span>Traits: {room.requirements.traits.join(", ")}</span>
        )}
        <span>G{room.requirements.minGearTier}+</span>
        <span>{room.requirements.minStars}★+</span>
        <span>Lv{room.requirements.minLevel}+</span>
      </div>
      <div className="mt-1 text-xs text-gray-500">
        {eligibleCount} eligible character{eligibleCount !== 1 ? "s" : ""}
      </div>
    </div>
  );
}
