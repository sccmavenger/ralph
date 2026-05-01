"use client";

import { useState, useEffect, useRef, FormEvent, useCallback } from "react";
import { useRouter } from "next/navigation";

interface Summary {
  activeToday: number;
  activeThisWeek: number;
  todayVsYesterday: number;
  weekVsPriorWeek: number;
  retentionRate: number;
  avgSessionDepth: number;
}

interface DauPoint {
  day: string;
  count: number;
}

interface FeatureStickiness {
  feature: string;
  path: string;
  usersThisWeek: number;
  returnRate: number;
}

interface PremiumPath {
  feature: string;
  count: number;
  percentage: number;
}

interface PeakHour {
  hour: number;
  count: number;
}

interface AtRiskCommander {
  displayName: string;
  lastSeen: string;
}

interface NewUserFeature {
  feature: string;
  adoption: number;
}

interface TierFeatureBreakdown {
  feature: string;
  freeUsers: number;
  premiumUsers: number;
}

interface FreeVsPremium {
  featureBreakdown: TierFeatureBreakdown[];
  engagement: {
    free: { uniqueUsers: number; avgSessionDepth: number };
    premium: { uniqueUsers: number; avgSessionDepth: number };
  };
}

interface TopUser {
  displayName: string;
  tier: string;
  eventCount: number;
  lastActive: string;
  topFeature: string;
}

interface PremiumValueSignal {
  feature: string;
  premiumShare: number;
  lift: number;
  premiumUsers: number;
  freeUsers: number;
}

interface InsightsData {
  summary: Summary;
  dauTrend: DauPoint[];
  featureStickiness: FeatureStickiness[];
  pathToPremium: PremiumPath[];
  peakHours: PeakHour[];
  atRiskCommanders: AtRiskCommander[];
  atRiskCount: number;
  weeklyActiveCount: number;
  newUserJourney: NewUserFeature[];
  tierSplit: { FREE: number; PREMIUM: number };
  freeVsPremium: FreeVsPremium;
  topUsers: TopUser[];
  premiumValueSignals: PremiumValueSignal[];
}

function DeltaBadge({ value, suffix = "vs yesterday" }: { value: number; suffix?: string }) {
  if (value === 0) return <span className="text-xs text-[var(--color-muted)]">— {suffix}</span>;
  const isUp = value > 0;
  return (
    <span className={`text-xs ${isUp ? "text-green-400" : "text-red-400"}`}>
      {isUp ? "↑" : "↓"} {Math.abs(value)}% {suffix}
    </span>
  );
}

function RetentionBar({ value, color }: { value: number; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 rounded-full bg-[var(--color-surface-light)] overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(value, 100)}%` }} />
      </div>
      <span className={`text-xs font-semibold w-9 text-right ${color.includes("green") ? "text-green-400" : color.includes("amber") ? "text-amber-400" : "text-red-400"}`}>
        {value}%
      </span>
    </div>
  );
}

function getVerdictBadge(rate: number) {
  if (rate >= 60) return <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold bg-green-500/15 text-green-400">⭐ Invest More</span>;
  if (rate >= 35) return <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/15 text-amber-400">Maintain</span>;
  if (rate >= 15) return <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/15 text-amber-400">Improve UX</span>;
  return <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-500/15 text-red-400">Rethink / Cut</span>;
}

function getRetentionColor(rate: number) {
  if (rate >= 60) return "bg-green-400";
  if (rate >= 35) return "bg-amber-400";
  return "bg-red-400";
}

export default function UsageInsightsClient() {
  const [data, setData] = useState<InsightsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const fetched = useRef(false);
  const router = useRouter();

  useEffect(() => {
    if (fetched.current) return;
    fetched.current = true;
    async function load() {
      try {
        const res = await fetch("/api/admin/usage-insights");
        if (res.ok) {
          setData(await res.json());
        } else {
          setError(true);
        }
      } catch {
        setError(true);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const handleLogout = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      await fetch("/api/admin/logout", { method: "POST" });
      router.push("/admin");
    },
    [router],
  );

  return (
    <div className="min-h-screen bg-[var(--color-background)]" data-testid="usage-insights-page">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-[var(--color-surface-light)] bg-[var(--color-surface)]">
        <div className="flex items-center justify-between px-4 py-3">
          <h1 className="text-lg font-bold text-[var(--color-foreground)]">Admin Panel</h1>
          <form onSubmit={handleLogout}>
            <button type="submit" className="rounded-lg border border-[var(--color-surface-light)] px-3 py-1.5 text-sm text-[var(--color-muted)] transition-colors hover:border-red-500 hover:text-red-400">
              Log Out
            </button>
          </form>
        </div>
        <nav className="flex px-4 gap-1 overflow-x-auto">
          <a href="/admin/dashboard" className="px-3 py-2 text-sm font-medium border-b-2 border-transparent text-[var(--color-muted)] hover:text-[var(--color-foreground)] transition-colors whitespace-nowrap">Commanders</a>
          <a href="/admin/ai-dashboard" className="px-3 py-2 text-sm font-medium border-b-2 border-transparent text-[var(--color-muted)] hover:text-[var(--color-foreground)] transition-colors whitespace-nowrap">AI Dashboard</a>
          <span className="px-3 py-2 text-sm font-medium border-b-2 border-[var(--color-accent)] text-[var(--color-accent)] whitespace-nowrap">Usage Insights</span>
        </nav>
      </header>

      <div className="max-w-6xl mx-auto p-4 pb-20">
        {loading ? (
          <LoadingSkeleton />
        ) : error || !data ? (
          <div className="text-center py-12">
            <p className="text-[var(--color-muted)]">Failed to load usage insights</p>
          </div>
        ) : (
          <DashboardContent data={data} />
        )}
      </div>
    </div>
  );
}

function DashboardContent({ data }: { data: InsightsData }) {
  const maxDau = Math.max(...data.dauTrend.map((d) => d.count), 1);
  const maxHour = Math.max(...data.peakHours.map((h) => h.count), 1);

  return (
    <div className="space-y-4" data-testid="usage-insights-content">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3" data-testid="insights-summary">
        <SummaryCard label="Active Today" value={data.summary.activeToday}>
          <DeltaBadge value={data.summary.todayVsYesterday} />
        </SummaryCard>
        <SummaryCard label="Active This Week" value={data.summary.activeThisWeek}>
          <DeltaBadge value={data.summary.weekVsPriorWeek} suffix="vs last week" />
        </SummaryCard>
        <SummaryCard label="7-Day Retention" value={`${data.summary.retentionRate}%`}>
          <span className="text-xs text-[var(--color-muted)]">of prior week users returned</span>
        </SummaryCard>
        <SummaryCard label="Avg Session Depth" value={data.summary.avgSessionDepth}>
          <span className="text-xs text-[var(--color-muted)]">pages per visit</span>
        </SummaryCard>
      </div>

      {/* DAU Trend */}
      <div className="rounded-xl border border-[var(--color-surface-light)] bg-[var(--color-surface)] p-4" data-testid="insights-dau-trend">
        <h3 className="text-sm font-bold text-[var(--color-foreground)] mb-3">Daily Active Users — Last 30 Days</h3>
        {data.dauTrend.length === 0 ? (
          <p className="text-xs text-[var(--color-muted)]">No data yet — tracking just started</p>
        ) : (
          <>
            <div className="flex items-end gap-[2px] h-12">
              {data.dauTrend.map((d) => (
                <div
                  key={d.day}
                  className="flex-1 bg-indigo-500 rounded-sm opacity-70 last:opacity-100"
                  style={{ height: `${(d.count / maxDau) * 100}%`, minHeight: d.count > 0 ? "2px" : "0" }}
                  title={`${d.day}: ${d.count} users`}
                />
              ))}
            </div>
            <div className="flex justify-between text-[10px] text-[var(--color-muted)] mt-1">
              <span>{data.dauTrend[0]?.day}</span>
              <span>{data.dauTrend[data.dauTrend.length - 1]?.day}</span>
            </div>
          </>
        )}
      </div>

      {/* Feature Stickiness */}
      <div className="rounded-xl border border-[var(--color-surface-light)] bg-[var(--color-surface)] p-4" data-testid="insights-feature-stickiness">
        <h3 className="text-sm font-bold text-[var(--color-foreground)] mb-1">Feature Stickiness — &quot;What keeps people coming back?&quot;</h3>
        <p className="text-[10px] text-[var(--color-muted)] mb-4">Of commanders who used a feature last week, % who returned to it this week</p>
        {data.featureStickiness.length === 0 ? (
          <p className="text-xs text-[var(--color-muted)]">Not enough data yet — need 2 weeks of tracking</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--color-surface-light)]">
                  <th className="text-left text-[10px] uppercase tracking-wide text-[var(--color-muted)] py-2 px-2">Feature</th>
                  <th className="text-left text-[10px] uppercase tracking-wide text-[var(--color-muted)] py-2 px-2">Users</th>
                  <th className="text-left text-[10px] uppercase tracking-wide text-[var(--color-muted)] py-2 px-2 min-w-[140px]">7-Day Return</th>
                  <th className="text-left text-[10px] uppercase tracking-wide text-[var(--color-muted)] py-2 px-2">Verdict</th>
                </tr>
              </thead>
              <tbody>
                {data.featureStickiness.map((f) => (
                  <tr key={f.path} className="border-b border-[var(--color-surface-light)] last:border-0">
                    <td className="py-2 px-2 text-[var(--color-foreground)]">{f.feature}</td>
                    <td className="py-2 px-2 text-[var(--color-muted)]">{f.usersThisWeek}</td>
                    <td className="py-2 px-2">
                      <RetentionBar value={f.returnRate} color={getRetentionColor(f.returnRate)} />
                    </td>
                    <td className="py-2 px-2">{getVerdictBadge(f.returnRate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Two-column: Path to Premium + Peak Hours */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Path to Premium */}
        <div className="rounded-xl border border-[var(--color-surface-light)] bg-[var(--color-surface)] p-4" data-testid="insights-path-to-premium">
          <h3 className="text-sm font-bold text-[var(--color-foreground)] mb-1">Path to Premium — &quot;What drives upgrades?&quot;</h3>
          <p className="text-[10px] text-[var(--color-muted)] mb-4">Last feature visited before tier changed to Premium</p>
          {data.pathToPremium.length === 0 ? (
            <p className="text-xs text-[var(--color-muted)]">No premium conversions tracked yet</p>
          ) : (
            <div className="space-y-3">
              {data.pathToPremium.map((p, i) => (
                <div key={p.feature} className="flex items-center gap-3">
                  <span className="text-lg font-bold text-[var(--color-muted)] w-6">{i + 1}</span>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-[var(--color-foreground)]">{p.feature}</p>
                  </div>
                  <span className="text-sm font-semibold text-amber-400">{p.percentage}%</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Peak Hours */}
        <div className="rounded-xl border border-[var(--color-surface-light)] bg-[var(--color-surface)] p-4" data-testid="insights-peak-hours">
          <h3 className="text-sm font-bold text-[var(--color-foreground)] mb-1">Peak Usage Hours</h3>
          <p className="text-[10px] text-[var(--color-muted)] mb-4">Activity by hour (UTC), last 7 days</p>
          <div className="grid grid-cols-24 gap-[3px]">
            {data.peakHours.map((h) => {
              const intensity = maxHour > 0 ? h.count / maxHour : 0;
              let bg = "bg-[var(--color-surface-light)]";
              if (intensity > 0.75) bg = "bg-indigo-500";
              else if (intensity > 0.5) bg = "bg-indigo-500/60";
              else if (intensity > 0.25) bg = "bg-indigo-500/40";
              else if (intensity > 0) bg = "bg-indigo-500/20";
              return <div key={h.hour} className={`aspect-square rounded-sm ${bg}`} title={`${h.hour}:00 — ${h.count} events`} />;
            })}
          </div>
          <div className="flex justify-between text-[9px] text-[var(--color-muted)] mt-1">
            <span>0:00</span><span>6:00</span><span>12:00</span><span>18:00</span><span>23:00</span>
          </div>
        </div>
      </div>

      {/* Two-column: At-Risk + New User Journey */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* At-Risk */}
        <div className="rounded-xl border border-[var(--color-surface-light)] bg-[var(--color-surface)] p-4" data-testid="insights-at-risk">
          <h3 className="text-sm font-bold text-[var(--color-foreground)] mb-1">At-Risk Commanders — &quot;Who&apos;s churning?&quot;</h3>
          <p className="text-[10px] text-[var(--color-muted)] mb-4">Active last week but haven&apos;t returned</p>
          {data.atRiskCommanders.length === 0 ? (
            <p className="text-xs text-[var(--color-muted)]">No at-risk commanders detected 🎉</p>
          ) : (
            <>
              <div className="space-y-2">
                {data.atRiskCommanders.map((c) => (
                  <div key={c.displayName} className="flex items-center justify-between px-3 py-2 rounded-lg bg-[var(--color-background)]">
                    <span className="text-sm text-[var(--color-foreground)]">{c.displayName}</span>
                    <span className="text-xs text-red-400">Last: {c.lastSeen}</span>
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-[var(--color-muted)] mt-3">
                {data.atRiskCount} of {data.weeklyActiveCount} weekly actives haven&apos;t returned ({data.weeklyActiveCount > 0 ? Math.round((data.atRiskCount / data.weeklyActiveCount) * 100) : 0}% churn risk)
              </p>
            </>
          )}
        </div>

        {/* New User Journey */}
        <div className="rounded-xl border border-[var(--color-surface-light)] bg-[var(--color-surface)] p-4" data-testid="insights-new-user-journey">
          <h3 className="text-sm font-bold text-[var(--color-foreground)] mb-1">New Commander Journey</h3>
          <p className="text-[10px] text-[var(--color-muted)] mb-4">Feature adoption among new users (last 30 days)</p>
          {data.newUserJourney.length === 0 ? (
            <p className="text-xs text-[var(--color-muted)]">No new user data yet</p>
          ) : (
            <div className="space-y-2">
              {data.newUserJourney.map((j) => (
                <div key={j.feature}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-[var(--color-foreground)]">{j.feature}</span>
                    <span className="text-xs text-[var(--color-muted)]">{j.adoption}%</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-[var(--color-surface-light)] overflow-hidden">
                    <div
                      className={`h-full rounded-full ${j.adoption >= 60 ? "bg-green-400" : j.adoption >= 30 ? "bg-amber-400" : "bg-red-400"}`}
                      style={{ width: `${j.adoption}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Tier Distribution */}
      <div className="rounded-xl border border-[var(--color-surface-light)] bg-[var(--color-surface)] p-4" data-testid="insights-tier-split">
        <h3 className="text-sm font-bold text-[var(--color-foreground)] mb-3">Tier Distribution</h3>
        <div className="flex items-center gap-3">
          <div className="flex-1 h-2.5 rounded-full bg-[var(--color-surface-light)] overflow-hidden">
            <div className="h-full rounded-full bg-slate-400" style={{ width: `${data.tierSplit.FREE}%` }} />
          </div>
          <div className="flex gap-4 text-xs shrink-0">
            <span className="text-slate-400">Free {data.tierSplit.FREE}%</span>
            <span className="text-amber-400">Premium {data.tierSplit.PREMIUM}%</span>
          </div>
        </div>
      </div>

      {/* ═══════ FREE vs PREMIUM BEHAVIOR ═══════ */}
      <div className="rounded-xl border border-[var(--color-surface-light)] bg-[var(--color-surface)] p-4" data-testid="insights-free-vs-premium">
        <h3 className="text-sm font-bold text-[var(--color-foreground)] mb-1">Free vs Premium Behavior — &quot;How do they differ?&quot;</h3>
        <p className="text-[10px] text-[var(--color-muted)] mb-4">Feature usage and engagement, segmented by tier (this week)</p>

        {/* Engagement comparison cards */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="rounded-lg bg-[var(--color-background)] p-3">
            <p className="text-[10px] uppercase tracking-wide text-slate-400 mb-1">Free Users</p>
            <p className="text-xl font-bold text-slate-300">{data.freeVsPremium.engagement.free.uniqueUsers}</p>
            <p className="text-xs text-[var(--color-muted)]">{data.freeVsPremium.engagement.free.avgSessionDepth} pages/visit</p>
          </div>
          <div className="rounded-lg bg-[var(--color-background)] p-3">
            <p className="text-[10px] uppercase tracking-wide text-amber-400 mb-1">Premium Users</p>
            <p className="text-xl font-bold text-amber-300">{data.freeVsPremium.engagement.premium.uniqueUsers}</p>
            <p className="text-xs text-[var(--color-muted)]">{data.freeVsPremium.engagement.premium.avgSessionDepth} pages/visit</p>
          </div>
        </div>

        {/* Feature breakdown table */}
        {data.freeVsPremium.featureBreakdown.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--color-surface-light)]">
                  <th className="text-left text-[10px] uppercase tracking-wide text-[var(--color-muted)] py-2 px-2">Feature</th>
                  <th className="text-right text-[10px] uppercase tracking-wide text-slate-400 py-2 px-2">Free</th>
                  <th className="text-right text-[10px] uppercase tracking-wide text-amber-400 py-2 px-2">Premium</th>
                  <th className="text-right text-[10px] uppercase tracking-wide text-[var(--color-muted)] py-2 px-2">Ratio</th>
                </tr>
              </thead>
              <tbody>
                {data.freeVsPremium.featureBreakdown.map((f) => {
                  const ratio = f.freeUsers > 0 ? (f.premiumUsers / f.freeUsers).toFixed(1) : "∞";
                  return (
                    <tr key={f.feature} className="border-b border-[var(--color-surface-light)] last:border-0">
                      <td className="py-2 px-2 text-[var(--color-foreground)]">{f.feature}</td>
                      <td className="py-2 px-2 text-right text-slate-400">{f.freeUsers}</td>
                      <td className="py-2 px-2 text-right text-amber-400">{f.premiumUsers}</td>
                      <td className="py-2 px-2 text-right text-[var(--color-muted)]">{ratio}x</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ═══════ PREMIUM VALUE SIGNALS ═══════ */}
      {data.premiumValueSignals.length > 0 && (
        <div className="rounded-xl border border-[var(--color-surface-light)] bg-[var(--color-surface)] p-4" data-testid="insights-premium-signals">
          <h3 className="text-sm font-bold text-[var(--color-foreground)] mb-1">Premium Value Signals — &quot;Where to invest for upsell&quot;</h3>
          <p className="text-[10px] text-[var(--color-muted)] mb-4">Features where premium users are disproportionately represented (lift vs overall tier %)</p>
          <div className="space-y-3">
            {data.premiumValueSignals.map((s) => (
              <div key={s.feature} className="flex items-center gap-3">
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm text-[var(--color-foreground)]">{s.feature}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-[var(--color-muted)]">{s.premiumShare}% premium</span>
                      {s.lift > 0 ? (
                        <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold bg-green-500/15 text-green-400">↑ {s.lift}% lift</span>
                      ) : (
                        <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-500/15 text-slate-400">{s.lift}% lift</span>
                      )}
                    </div>
                  </div>
                  <div className="flex h-2 rounded-full overflow-hidden">
                    <div className="bg-slate-400" style={{ width: `${Math.round((s.freeUsers / (s.freeUsers + s.premiumUsers)) * 100)}%` }} />
                    <div className="bg-amber-400" style={{ width: `${s.premiumShare}%` }} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ═══════ TOP USERS (POWER USERS) ═══════ */}
      <div className="rounded-xl border border-[var(--color-surface-light)] bg-[var(--color-surface)] p-4" data-testid="insights-top-users">
        <h3 className="text-sm font-bold text-[var(--color-foreground)] mb-1">Top Users — &quot;Who are the power users?&quot;</h3>
        <p className="text-[10px] text-[var(--color-muted)] mb-4">Most active commanders this week by total events</p>
        {data.topUsers.length === 0 ? (
          <p className="text-xs text-[var(--color-muted)]">No activity this week</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--color-surface-light)]">
                  <th className="text-left text-[10px] uppercase tracking-wide text-[var(--color-muted)] py-2 px-2">#</th>
                  <th className="text-left text-[10px] uppercase tracking-wide text-[var(--color-muted)] py-2 px-2">Commander</th>
                  <th className="text-left text-[10px] uppercase tracking-wide text-[var(--color-muted)] py-2 px-2">Tier</th>
                  <th className="text-right text-[10px] uppercase tracking-wide text-[var(--color-muted)] py-2 px-2">Events</th>
                  <th className="text-left text-[10px] uppercase tracking-wide text-[var(--color-muted)] py-2 px-2">Top Feature</th>
                  <th className="text-right text-[10px] uppercase tracking-wide text-[var(--color-muted)] py-2 px-2">Last Active</th>
                </tr>
              </thead>
              <tbody>
                {data.topUsers.map((u, i) => (
                  <tr key={`${u.displayName}-${i}`} className="border-b border-[var(--color-surface-light)] last:border-0">
                    <td className="py-2 px-2 text-[var(--color-muted)]">{i + 1}</td>
                    <td className="py-2 px-2 text-[var(--color-foreground)] font-medium">{u.displayName}</td>
                    <td className="py-2 px-2">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold ${u.tier === "PREMIUM" ? "bg-amber-500/15 text-amber-400" : "bg-slate-500/15 text-slate-400"}`}>
                        {u.tier}
                      </span>
                    </td>
                    <td className="py-2 px-2 text-right text-[var(--color-foreground)] font-mono">{u.eventCount}</td>
                    <td className="py-2 px-2 text-[var(--color-muted)]">{u.topFeature}</td>
                    <td className="py-2 px-2 text-right text-[var(--color-muted)]">{u.lastActive}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function SummaryCard({ label, value, children }: { label: string; value: string | number; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-[var(--color-surface-light)] bg-[var(--color-surface)] p-4">
      <p className="text-[10px] uppercase tracking-wide text-[var(--color-muted)] mb-1">{label}</p>
      <p className="text-2xl font-bold text-[var(--color-foreground)]">{value}</p>
      <div className="mt-1">{children}</div>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-4" data-testid="insights-skeleton">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="rounded-xl border border-[var(--color-surface-light)] bg-[var(--color-surface)] p-4">
            <div className="h-3 w-16 rounded bg-[var(--color-surface-light)] animate-pulse mb-2" />
            <div className="h-7 w-12 rounded bg-[var(--color-surface-light)] animate-pulse" />
          </div>
        ))}
      </div>
      <div className="rounded-xl border border-[var(--color-surface-light)] bg-[var(--color-surface)] p-4">
        <div className="h-3 w-40 rounded bg-[var(--color-surface-light)] animate-pulse mb-4" />
        <div className="h-12 rounded bg-[var(--color-surface-light)] animate-pulse" />
      </div>
      <div className="rounded-xl border border-[var(--color-surface-light)] bg-[var(--color-surface)] p-4">
        <div className="h-3 w-48 rounded bg-[var(--color-surface-light)] animate-pulse mb-4" />
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-6 rounded bg-[var(--color-surface-light)] animate-pulse" />
          ))}
        </div>
      </div>
    </div>
  );
}
