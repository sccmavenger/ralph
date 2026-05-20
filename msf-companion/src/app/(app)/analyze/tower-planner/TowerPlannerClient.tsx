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

export default function TowerPlannerClient() {
  const [loading, setLoading] = useState(true);
  const [towerData, setTowerData] = useState<TowerEventsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchTowerStatus() {
      try {
        const res = await fetch("/api/tower/events");
        if (!res.ok) throw new Error("Failed to fetch tower status");
        const data: TowerEventsResponse = await res.json();
        setTowerData(data);
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

      {/* Room list will be added in US-009 */}
      <div className="mt-4 rounded-lg border border-gray-700 p-6 text-center text-gray-500">
        <p>Room details loading soon...</p>
      </div>
    </div>
  );
}
