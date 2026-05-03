"use client";

import { useState, useEffect, useRef, FormEvent, useCallback } from "react";
import { useRouter } from "next/navigation";

interface Overview {
  totalCommanders: number;
  premiumCommanders: number;
  freeCommanders: number;
  mrr: number;
  arr: number;
  conversionRate: number;
  churnRate: number;
  arpu: number;
  ltv: number;
  pricePerMonth: number;
}

interface Waterfall {
  newConversions: number;
  newMRR: number;
  churnedThisMonth: number;
  churnedMRR: number;
  netNewMRR: number;
}

interface PremiumTrendPoint {
  day: string;
  gained: number;
  lost: number;
}

interface Cohort {
  month: string;
  total: number;
  premium: number;
  conversionRate: number;
}

interface SubscriptionHealth {
  healthy: number;
  expiringSoon: number;
  total: number;
}

interface AtRiskSubscriber {
  displayName: string;
  expiresAt: string;
  email: string | null;
}

interface PremiumFeature {
  feature: string;
  views: number;
}

interface MonetizationData {
  overview: Overview;
  waterfall: Waterfall;
  premiumTrend: PremiumTrendPoint[];
  cohorts: Cohort[];
  subscriptionHealth: SubscriptionHealth;
  atRiskSubscribers: AtRiskSubscriber[];
  revenueAtRisk: number;
  premiumTopFeatures: PremiumFeature[];
}

function formatCurrency(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

export default function MonetizationClient() {
  const [data, setData] = useState<MonetizationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const fetched = useRef(false);
  const router = useRouter();

  useEffect(() => {
    if (fetched.current) return;
    fetched.current = true;
    async function load() {
      try {
        const res = await fetch("/api/admin/monetization");
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
    <div className="min-h-screen bg-[var(--color-background)]" data-testid="monetization-page">
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
          <a href="/admin/usage-analytics" className="px-3 py-2 text-sm font-medium border-b-2 border-transparent text-[var(--color-muted)] hover:text-[var(--color-foreground)] transition-colors whitespace-nowrap">Usage Insights</a>
          <span className="px-3 py-2 text-sm font-medium border-b-2 border-[var(--color-accent)] text-[var(--color-accent)] whitespace-nowrap">Monetization</span>
        </nav>
      </header>

      <div className="max-w-6xl mx-auto p-4 pb-20">
        {loading ? (
          <LoadingSkeleton />
        ) : error || !data ? (
          <div className="text-center py-12">
            <p className="text-[var(--color-muted)]">Failed to load monetization data</p>
          </div>
        ) : (
          <DashboardContent data={data} />
        )}
      </div>
    </div>
  );
}

function DashboardContent({ data }: { data: MonetizationData }) {
  const maxTrend = Math.max(...data.premiumTrend.map((d) => Math.max(d.gained, d.lost)), 1);
  const maxCohortTotal = Math.max(...data.cohorts.map((c) => c.total), 1);

  return (
    <div className="space-y-4" data-testid="monetization-content">
      {/* ═══════ HEADLINE KPIs ═══════ */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3" data-testid="monetization-kpis">
        <KpiCard label="MRR" value={formatCurrency(data.overview.mrr)} subtext={`ARR: ${formatCurrency(data.overview.arr)}`} />
        <KpiCard label="Conversion Rate" value={`${data.overview.conversionRate}%`} subtext={`${data.overview.premiumCommanders} of ${data.overview.totalCommanders} commanders`} />
        <KpiCard label="Monthly Churn" value={`${data.overview.churnRate}%`} subtext={`${data.waterfall.churnedThisMonth} lost this month`} color={data.overview.churnRate > 5 ? "text-red-400" : data.overview.churnRate > 2 ? "text-amber-400" : "text-green-400"} />
        <KpiCard label="Est. LTV" value={formatCurrency(data.overview.ltv)} subtext={`ARPU: ${formatCurrency(data.overview.arpu)}/mo`} />
      </div>

      {/* ═══════ REVENUE WATERFALL ═══════ */}
      <div className="rounded-xl border border-[var(--color-surface-light)] bg-[var(--color-surface)] p-4" data-testid="monetization-waterfall">
        <h3 className="text-sm font-bold text-[var(--color-foreground)] mb-1">Revenue Waterfall — This Month</h3>
        <p className="text-[10px] text-[var(--color-muted)] mb-4">Net new MRR = new conversions - churned subscribers</p>
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <p className="text-xs text-[var(--color-muted)]">New MRR</p>
            <p className="text-xl font-bold text-green-400">+{formatCurrency(data.waterfall.newMRR)}</p>
            <p className="text-[10px] text-[var(--color-muted)]">{data.waterfall.newConversions} conversions</p>
          </div>
          <div>
            <p className="text-xs text-[var(--color-muted)]">Churned MRR</p>
            <p className="text-xl font-bold text-red-400">-{formatCurrency(data.waterfall.churnedMRR)}</p>
            <p className="text-[10px] text-[var(--color-muted)]">{data.waterfall.churnedThisMonth} cancellations</p>
          </div>
          <div>
            <p className="text-xs text-[var(--color-muted)]">Net New MRR</p>
            <p className={`text-xl font-bold ${data.waterfall.netNewMRR >= 0 ? "text-green-400" : "text-red-400"}`}>
              {data.waterfall.netNewMRR >= 0 ? "+" : ""}{formatCurrency(data.waterfall.netNewMRR)}
            </p>
            <p className="text-[10px] text-[var(--color-muted)]">
              {data.waterfall.netNewMRR >= 0 ? "Growing" : "Shrinking"}
            </p>
          </div>
        </div>
      </div>

      {/* ═══════ PREMIUM GROWTH TREND + SUBSCRIPTION HEALTH ═══════ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Growth Trend */}
        <div className="rounded-xl border border-[var(--color-surface-light)] bg-[var(--color-surface)] p-4" data-testid="monetization-trend">
          <h3 className="text-sm font-bold text-[var(--color-foreground)] mb-1">Premium Growth — Last 30 Days</h3>
          <p className="text-[10px] text-[var(--color-muted)] mb-3">Green = gained, Red = lost</p>
          {data.premiumTrend.length === 0 ? (
            <p className="text-xs text-[var(--color-muted)]">No conversion data yet</p>
          ) : (
            <>
              <div className="flex items-end gap-[2px] h-16">
                {data.premiumTrend.map((d) => (
                  <div key={d.day} className="flex-1 flex flex-col justify-end gap-[1px]" title={`${d.day}: +${d.gained} / -${d.lost}`}>
                    {d.gained > 0 && (
                      <div
                        className="bg-green-400 rounded-sm"
                        style={{ height: `${(d.gained / maxTrend) * 50}%`, minHeight: "2px" }}
                      />
                    )}
                    {d.lost > 0 && (
                      <div
                        className="bg-red-400 rounded-sm"
                        style={{ height: `${(d.lost / maxTrend) * 50}%`, minHeight: "2px" }}
                      />
                    )}
                  </div>
                ))}
              </div>
              <div className="flex justify-between text-[9px] text-[var(--color-muted)] mt-1">
                <span>{data.premiumTrend[0]?.day}</span>
                <span>{data.premiumTrend[data.premiumTrend.length - 1]?.day}</span>
              </div>
            </>
          )}
        </div>

        {/* Subscription Health */}
        <div className="rounded-xl border border-[var(--color-surface-light)] bg-[var(--color-surface)] p-4" data-testid="monetization-health">
          <h3 className="text-sm font-bold text-[var(--color-foreground)] mb-1">Subscription Health</h3>
          <p className="text-[10px] text-[var(--color-muted)] mb-4">{data.subscriptionHealth.total} active premium subscribers</p>
          <div className="space-y-3">
            <HealthBar label="Healthy" count={data.subscriptionHealth.healthy} total={data.subscriptionHealth.total} color="bg-green-400" />
            <HealthBar label="Expiring within 7d" count={data.subscriptionHealth.expiringSoon} total={data.subscriptionHealth.total} color="bg-amber-400" />
          </div>
          {data.subscriptionHealth.expiringSoon > 0 && (
            <p className="mt-3 text-[10px] text-amber-400">
              ⚠ {data.subscriptionHealth.expiringSoon} subscribers renew within 7 days — monitor for payment failures
            </p>
          )}
        </div>
      </div>

      {/* ═══════ REVENUE AT RISK + COHORT ANALYSIS ═══════ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Revenue at Risk */}
        <div className="rounded-xl border border-[var(--color-surface-light)] bg-[var(--color-surface)] p-4" data-testid="monetization-at-risk">
          <h3 className="text-sm font-bold text-[var(--color-foreground)] mb-1">Revenue at Risk</h3>
          <p className="text-[10px] text-[var(--color-muted)] mb-2">Subscriptions expiring within 30 days</p>
          <p className="text-2xl font-bold text-amber-400 mb-3">{formatCurrency(data.revenueAtRisk)}</p>
          {data.atRiskSubscribers.length === 0 ? (
            <p className="text-xs text-[var(--color-muted)]">No subscriptions at risk</p>
          ) : (
            <div className="space-y-2">
              {data.atRiskSubscribers.map((s) => (
                <div key={s.displayName} className="flex items-center justify-between px-3 py-2 rounded-lg bg-[var(--color-background)]">
                  <div>
                    <span className="text-sm text-[var(--color-foreground)]">{s.displayName}</span>
                    {s.email && <span className="ml-2 text-[10px] text-[var(--color-muted)]">{s.email}</span>}
                  </div>
                  <span className="text-xs text-amber-400">Exp: {s.expiresAt}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Cohort Analysis */}
        <div className="rounded-xl border border-[var(--color-surface-light)] bg-[var(--color-surface)] p-4" data-testid="monetization-cohorts">
          <h3 className="text-sm font-bold text-[var(--color-foreground)] mb-1">Cohort Conversion</h3>
          <p className="text-[10px] text-[var(--color-muted)] mb-4">Conversion rate by signup month (last 6 months)</p>
          {data.cohorts.length === 0 ? (
            <p className="text-xs text-[var(--color-muted)]">Not enough data</p>
          ) : (
            <div className="space-y-3">
              {data.cohorts.map((c) => (
                <div key={c.month}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-[var(--color-foreground)]">{c.month}</span>
                    <span className="text-xs text-[var(--color-muted)]">{c.premium}/{c.total} ({c.conversionRate}%)</span>
                  </div>
                  <div className="flex h-2 rounded-full overflow-hidden bg-[var(--color-surface-light)]">
                    <div className="bg-amber-400 rounded-full" style={{ width: `${(c.total / maxCohortTotal) * 100}%` }}>
                      <div className="h-full bg-green-400 rounded-full" style={{ width: `${c.conversionRate}%` }} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ═══════ PREMIUM FEATURE VALUE ═══════ */}
      <div className="rounded-xl border border-[var(--color-surface-light)] bg-[var(--color-surface)] p-4" data-testid="monetization-features">
        <h3 className="text-sm font-bold text-[var(--color-foreground)] mb-1">What Premium Users Use Most</h3>
        <p className="text-[10px] text-[var(--color-muted)] mb-4">Page views by paying customers (last 30 days) — invest in these features</p>
        {data.premiumTopFeatures.length === 0 ? (
          <p className="text-xs text-[var(--color-muted)]">No premium activity yet</p>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {data.premiumTopFeatures.map((f, i) => (
              <div key={f.feature} className="rounded-lg bg-[var(--color-background)] p-3 text-center">
                <p className="text-lg font-bold text-amber-400">{i + 1}</p>
                <p className="text-xs text-[var(--color-foreground)] font-medium">{f.feature}</p>
                <p className="text-[10px] text-[var(--color-muted)]">{f.views} views</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ═══════ CHURN PREVENTION PLAYBOOK ═══════ */}
      <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4" data-testid="monetization-churn-playbook">
        <h3 className="text-sm font-bold text-amber-400 mb-1">Churn Prevention Playbook</h3>
        <p className="text-[10px] text-[var(--color-muted)] mb-3">Data-driven strategies based on your metrics</p>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <PlaybookCard
            title="Re-engage At-Risk Users"
            description="Commanders who used premium features but haven't returned in 7+ days. Send targeted push/email with personalized content."
            metric={`${data.atRiskSubscribers.length} at risk now`}
            priority={data.atRiskSubscribers.length > 3 ? "high" : "medium"}
          />
          <PlaybookCard
            title="Reduce Involuntary Churn"
            description="Enable Stripe Smart Retries and dunning emails for failed payments. Typically recovers 10-30% of failed renewals."
            metric={`${data.overview.churnRate}% monthly churn`}
            priority={data.overview.churnRate > 5 ? "high" : "low"}
          />
          <PlaybookCard
            title="Boost Conversion Funnel"
            description="Users who try AI Advisor 3+ times have 4x higher conversion. Add usage-based nudges after feature limits hit."
            metric={`${data.overview.conversionRate}% convert`}
            priority={data.overview.conversionRate < 5 ? "high" : "medium"}
          />
          <PlaybookCard
            title="Increase Feature Stickiness"
            description="Premium users who engage daily in the first week have 80% lower churn. Add onboarding sequences for new subscribers."
            metric={`$${data.overview.ltv.toFixed(0)} LTV`}
            priority="medium"
          />
        </div>
      </div>
    </div>
  );
}

function KpiCard({ label, value, subtext, color }: { label: string; value: string; subtext: string; color?: string }) {
  return (
    <div className="rounded-xl border border-[var(--color-surface-light)] bg-[var(--color-surface)] p-4">
      <p className="text-[10px] uppercase tracking-wide text-[var(--color-muted)] mb-1">{label}</p>
      <p className={`text-2xl font-bold ${color || "text-[var(--color-foreground)]"}`}>{value}</p>
      <p className="text-xs text-[var(--color-muted)] mt-1">{subtext}</p>
    </div>
  );
}

function HealthBar({ label, count, total, color }: { label: string; count: number; total: number; color: string }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-[var(--color-foreground)]">{label}</span>
        <span className="text-xs text-[var(--color-muted)]">{count} ({pct}%)</span>
      </div>
      <div className="h-2 rounded-full bg-[var(--color-surface-light)] overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function PlaybookCard({ title, description, metric, priority }: { title: string; description: string; metric: string; priority: "high" | "medium" | "low" }) {
  const priorityColors = {
    high: "border-red-500/30 bg-red-500/5",
    medium: "border-amber-500/20 bg-amber-500/5",
    low: "border-[var(--color-surface-light)] bg-[var(--color-background)]",
  };
  const priorityLabels = {
    high: <span className="text-[10px] font-semibold text-red-400 uppercase">High Priority</span>,
    medium: <span className="text-[10px] font-semibold text-amber-400 uppercase">Medium</span>,
    low: <span className="text-[10px] font-semibold text-green-400 uppercase">Low Priority</span>,
  };

  return (
    <div className={`rounded-lg border p-3 ${priorityColors[priority]}`}>
      <div className="flex items-center justify-between mb-1">
        <h4 className="text-xs font-bold text-[var(--color-foreground)]">{title}</h4>
        {priorityLabels[priority]}
      </div>
      <p className="text-[10px] text-[var(--color-muted)] mb-2">{description}</p>
      <p className="text-[10px] font-semibold text-[var(--color-accent)]">{metric}</p>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-4" data-testid="monetization-skeleton">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="rounded-xl border border-[var(--color-surface-light)] bg-[var(--color-surface)] p-4">
            <div className="h-3 w-16 rounded bg-[var(--color-surface-light)] animate-pulse mb-2" />
            <div className="h-7 w-20 rounded bg-[var(--color-surface-light)] animate-pulse" />
          </div>
        ))}
      </div>
      <div className="rounded-xl border border-[var(--color-surface-light)] bg-[var(--color-surface)] p-4">
        <div className="h-3 w-48 rounded bg-[var(--color-surface-light)] animate-pulse mb-4" />
        <div className="h-20 rounded bg-[var(--color-surface-light)] animate-pulse" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {[1, 2].map((i) => (
          <div key={i} className="rounded-xl border border-[var(--color-surface-light)] bg-[var(--color-surface)] p-4">
            <div className="h-3 w-40 rounded bg-[var(--color-surface-light)] animate-pulse mb-4" />
            <div className="h-16 rounded bg-[var(--color-surface-light)] animate-pulse" />
          </div>
        ))}
      </div>
    </div>
  );
}
