"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

interface TowerEventData {
  active: boolean;
  tower: {
    id: string;
    name: string;
    endDate: string;
    currentWeek: number;
  } | null;
}

export default function TowerEventWidget() {
  const [data, setData] = useState<TowerEventData | null>(null);
  const [error, setError] = useState(false);

  const fetchData = useCallback(async () => {
    setError(false);
    try {
      const response = await fetch("/api/tower/events", { cache: "no-store" });
      const body = await response.json().catch(() => null);
      if (!response.ok || !body || typeof body.active !== "boolean") {
        throw new Error("Tower status is unavailable.");
      }
      setData(body);
    } catch {
      setData(null);
      setError(true);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void fetchData();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [fetchData]);

  if (error) {
    return (
      <div
        role="status"
        className="rounded-xl border border-purple-700/40 bg-purple-900/10 p-4"
        data-testid="tower-event-error"
      >
        <p className="text-xs text-[var(--color-muted)]">
          Tower event status is temporarily unavailable.
        </p>
        <button
          type="button"
          onClick={fetchData}
          className="mt-2 text-xs font-semibold text-purple-400"
        >
          Try again
        </button>
      </div>
    );
  }

  if (!data?.active || !data.tower) return null;

  const endDate = new Date(data.tower.endDate);
  const daysLeft = Math.max(0, Math.ceil((endDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)));

  return (
    <Link
      href="/analyze/tower-planner"
      className="block rounded-xl border border-purple-700/50 bg-purple-900/20 p-4 transition-colors active:bg-purple-900/40"
      data-testid="tower-event-card"
    >
      <div className="flex items-center gap-3">
        <span className="text-2xl">🏰</span>
        <div className="flex-1">
          <h3 className="text-sm font-bold text-white">{data.tower.name}</h3>
          <p className="text-xs text-gray-400">
            Week {data.tower.currentWeek} · {daysLeft} day{daysLeft !== 1 ? "s" : ""} left
          </p>
        </div>
        <span className="text-xs text-purple-400">View Plan →</span>
      </div>
    </Link>
  );
}
