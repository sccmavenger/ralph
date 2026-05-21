"use client";

import { useState, useEffect } from "react";
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

  useEffect(() => {
    fetch("/api/tower/events")
      .then((res) => (res.ok ? res.json() : null))
      .then((d) => setData(d))
      .catch(() => {});
  }, []);

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
