"use client";

import { useState, useEffect, useRef, FormEvent, useCallback } from "react";
import { useRouter } from "next/navigation";

interface UsageStats {
  activeUsersToday: number;
  activeUsersThisWeek: number;
  topPages: Array<{ page: string; count: number }>;
  topFeatures: Array<{ feature: string; count: number }>;
  tierSplit: { FREE: number; PREMIUM: number };
}

export default function UsageAnalyticsClient() {
  const [usageStats, setUsageStats] = useState<UsageStats | null>(null);
  const [usageLoading, setUsageLoading] = useState(true);
  const usageFetched = useRef(false);
  const router = useRouter();

  useEffect(() => {
    if (usageFetched.current) return;
    usageFetched.current = true;
    async function loadUsageStats() {
      try {
        const res = await fetch("/api/admin/usage-stats");
        if (res.ok) {
          const data = (await res.json()) as UsageStats;
          setUsageStats(data);
        }
      } catch { /* ignore */ } finally {
        setUsageLoading(false);
      }
    }
    loadUsageStats();
  }, []);

  const handleLogout = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      await fetch("/api/admin/logout", { method: "POST" });
      router.push("/admin");
    },
    [router]
  );

  return (
    <div className="min-h-screen bg-[var(--color-background)]" data-testid="usage-analytics-page">
      {/* Shared admin header */}
      <header className="sticky top-0 z-10 border-b border-[var(--color-surface-light)] bg-[var(--color-surface)]">
        <div className="flex items-center justify-between px-4 py-3">
          <h1 className="text-lg font-bold text-[var(--color-foreground)]">Admin Panel</h1>
          <form onSubmit={handleLogout}>
            <button
              type="submit"
              className="rounded-lg border border-[var(--color-surface-light)] px-3 py-1.5 text-sm text-[var(--color-muted)] transition-colors hover:border-red-500 hover:text-red-400"
            >
              Log Out
            </button>
          </form>
        </div>
        <nav className="flex px-4 gap-1">
          <a
            href="/admin/dashboard"
            className="px-3 py-2 text-sm font-medium border-b-2 border-transparent text-[var(--color-muted)] hover:text-[var(--color-foreground)] transition-colors"
          >
            Commanders
          </a>
          <a
            href="/admin/ai-dashboard"
            className="px-3 py-2 text-sm font-medium border-b-2 border-transparent text-[var(--color-muted)] hover:text-[var(--color-foreground)] transition-colors"
          >
            AI Dashboard
          </a>
          <span
            className="px-3 py-2 text-sm font-medium border-b-2 border-[var(--color-accent)] text-[var(--color-accent)]"
          >
            Usage Analytics
          </span>
        </nav>
      </header>

      <div className="max-w-4xl mx-auto p-4 pb-20">
        {/* Usage Analytics */}
        <div className="mb-4 rounded-xl border border-[var(--color-surface-light)] bg-[var(--color-surface)] p-4" data-testid="usage-analytics-section">
          <h3 className="mb-3 text-sm font-bold text-[var(--color-foreground)]">Usage Analytics</h3>
          {usageLoading ? (
            <div className="space-y-3" data-testid="usage-analytics-skeleton">
              <div className="grid grid-cols-2 gap-3">
                {[1, 2].map((i) => (
                  <div key={i} className="rounded-lg bg-[var(--color-background)] p-3">
                    <div className="h-3 w-16 rounded bg-[var(--color-surface-light)] animate-pulse mb-2" />
                    <div className="h-6 w-10 rounded bg-[var(--color-surface-light)] animate-pulse" />
                  </div>
                ))}
              </div>
              <div className="h-4 w-24 rounded bg-[var(--color-surface-light)] animate-pulse" />
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex items-center justify-between">
                    <div className="h-3 w-28 rounded bg-[var(--color-surface-light)] animate-pulse" />
                    <div className="h-3 w-8 rounded bg-[var(--color-surface-light)] animate-pulse" />
                  </div>
                ))}
              </div>
            </div>
          ) : usageStats ? (
            <div className="space-y-4">
              {/* Active Users */}
              <div className="grid grid-cols-2 gap-3" data-testid="usage-active-users">
                <div className="rounded-lg bg-[var(--color-background)] p-3">
                  <p className="text-xs text-[var(--color-muted)] mb-1">Active Today</p>
                  <p className="text-xl font-bold text-[var(--color-foreground)]">{usageStats.activeUsersToday}</p>
                </div>
                <div className="rounded-lg bg-[var(--color-background)] p-3">
                  <p className="text-xs text-[var(--color-muted)] mb-1">Active This Week</p>
                  <p className="text-xl font-bold text-[var(--color-foreground)]">{usageStats.activeUsersThisWeek}</p>
                </div>
              </div>

              {/* Top Pages */}
              <div data-testid="usage-top-pages">
                <p className="text-xs font-semibold text-[var(--color-muted)] mb-2">Top Pages</p>
                {usageStats.topPages.length === 0 ? (
                  <p className="text-xs text-[var(--color-muted)]">No page views this week</p>
                ) : (
                  <div className="space-y-1">
                    {usageStats.topPages.map((p) => (
                      <div key={p.page} className="flex items-center justify-between text-sm">
                        <span className="text-[var(--color-foreground)] truncate">{p.page}</span>
                        <span className="shrink-0 text-xs text-[var(--color-muted)]">{p.count}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Top Features */}
              <div data-testid="usage-top-features">
                <p className="text-xs font-semibold text-[var(--color-muted)] mb-2">Top Features</p>
                {usageStats.topFeatures.length === 0 ? (
                  <p className="text-xs text-[var(--color-muted)]">No feature interactions this week</p>
                ) : (
                  <div className="space-y-1">
                    {usageStats.topFeatures.map((f) => (
                      <div key={f.feature} className="flex items-center justify-between text-sm">
                        <span className="text-[var(--color-foreground)] truncate">{f.feature}</span>
                        <span className="shrink-0 text-xs text-[var(--color-muted)]">{f.count}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Tier Split */}
              <div data-testid="usage-tier-split">
                <p className="text-xs font-semibold text-[var(--color-muted)] mb-2">Tier Distribution</p>
                <div className="flex items-center gap-3">
                  <div className="flex-1">
                    <div className="h-2 rounded-full bg-[var(--color-surface-light)] overflow-hidden">
                      <div
                        className="h-full rounded-full bg-slate-400"
                        style={{ width: `${usageStats.tierSplit.FREE}%` }}
                      />
                    </div>
                  </div>
                  <div className="flex gap-3 text-xs shrink-0">
                    <span className="text-slate-400">Free {usageStats.tierSplit.FREE}%</span>
                    <span className="text-amber-400">Premium {usageStats.tierSplit.PREMIUM}%</span>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-xs text-[var(--color-muted)]">Failed to load usage data</p>
          )}
        </div>
      </div>
    </div>
  );
}
