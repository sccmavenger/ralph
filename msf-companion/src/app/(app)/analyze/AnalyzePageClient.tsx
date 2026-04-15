"use client";

import { useRouter } from "next/navigation";

const MODES = [
  {
    name: "Dark Dimension",
    description: "Endgame PvE content with trait-restricted nodes",
    count: "10 dimensions",
    color: "#6366f1",
    letter: "D",
    href: "/analyze/dd-planner",
  },
  {
    name: "Farming Guide",
    description: "Search campaign nodes by reward, find the best places to farm",
    count: "All campaigns",
    color: "#f59e0b",
    letter: "F",
    href: "/analyze/farming",
  },
  {
    name: "Upgrade Tokens",
    description: "See which characters meet each upgrade token benchmark",
    count: "All token levels",
    color: "#a855f7",
    letter: "U",
    href: "/analyze/upgrade-tokens",
  },
  {
    name: "Time Heists",
    description: "View time heist levels, squads upgraded, and features unlocked",
    count: "All levels",
    color: "#14b8a6",
    letter: "T",
    href: "/analyze/time-heists",
  },
  {
    name: "Raids",
    description: "Cooperative raid content with enemy teams",
    count: "42 raids",
    color: "#ef4444",
    letter: "R",
    href: null,
  },
  {
    name: "Campaigns",
    description: "Story campaigns with chapter progression",
    count: "0 campaigns",
    color: "#22c55e",
    letter: "C",
    href: null,
  },
];

export default function AnalyzePageClient() {
  const router = useRouter();

  return (
    <div className="px-4 py-4">
      <h2 className="text-xl font-bold text-[var(--color-foreground)]">
        Fight Analyzer
      </h2>
      <p className="mb-6 text-xs text-[var(--color-muted)]">
        Select a game mode and node to view requirements and enemy composition.
      </p>

      <h3 className="mb-3 text-sm font-semibold text-[var(--color-foreground)]">
        Mode
      </h3>

      <div className="space-y-3">
        {MODES.map((mode) => (
          <div
            key={mode.name}
            onClick={mode.href ? () => router.push(mode.href) : undefined}
            role={mode.href ? "button" : undefined}
            tabIndex={mode.href ? 0 : undefined}
            className={`rounded-xl bg-[var(--color-surface)] p-4 ${mode.href ? "cursor-pointer hover:ring-1 hover:ring-[var(--color-accent)]" : "opacity-60"}`}
          >
            <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-lg text-sm font-bold text-white"
              style={{ backgroundColor: mode.color }}
            >
              {mode.letter}
            </div>
            <h4 className="text-base font-bold text-[var(--color-foreground)]">
              {mode.name}
            </h4>
            <p className="text-xs text-[var(--color-muted)]">
              {mode.description}
            </p>
            <p className="mt-1 text-xs text-[var(--color-muted)]">
              {mode.count}
            </p>
          </div>
        ))}
      </div>

      <p className="mt-6 text-center text-xs text-[var(--color-muted)]">
        More modes coming soon.
      </p>
    </div>
  );
}
