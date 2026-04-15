"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";

/* ── Types ─────────────────────────────────────────────────────── */

interface BriefingReward {
  itemName: string;
  itemId: string;
  icon: string;
  quantity: number;
}

interface FreeOffer {
  id: string;
  name: string;
  description: string;
  expiration: number | null;
  remainingPurchases: number | null;
  rewards: BriefingReward[];
  art: string | null;
  chain: { id: string; index: number } | null;
  webBonusRewards: BriefingReward[];
}

interface MilestoneBracket {
  points: number;
  goal: number;
  completedTier: number;
  goalTier: number;
  claimableTiers: number[];
}

interface MilestoneTier {
  tier: number;
  rewards: BriefingReward[];
}

interface MilestoneScoring {
  methods: { description: string; points: number }[];
  cappedScorings: {
    cap: number;
    soFar: number;
    methods: { description: string; points: number }[];
  }[];
}

interface Milestone {
  id: string;
  name: string;
  startTime: number | null;
  endTime: number | null;
  milestoneType: string;
  brackets: MilestoneBracket[];
  tiers: MilestoneTier[];
  scoring: MilestoneScoring | null;
}

interface BriefingSummary {
  freeOfferCount: number;
  claimableMilestoneCount: number;
  totalActionItems: number;
}

interface DailyBriefingData {
  freeOffers: FreeOffer[];
  milestones: Milestone[];
  summary: BriefingSummary;
}

/* ── Helpers ───────────────────────────────────────────────────── */

function formatCountdown(expiration: number | null): string {
  if (!expiration) return "";
  const now = Math.floor(Date.now() / 1000);
  const diff = expiration - now;
  if (diff <= 0) return "Expired";
  const hours = Math.floor(diff / 3600);
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days}d ${hours % 24}h left`;
  const mins = Math.floor((diff % 3600) / 60);
  return `${hours}h ${mins}m left`;
}

function formatNumber(n: number): string {
  return n.toLocaleString();
}

/* ── Skeleton ──────────────────────────────────────────────────── */

function PageSkeleton() {
  return (
    <div className="space-y-4 px-4 py-4 animate-pulse">
      <div className="h-4 w-32 rounded bg-[var(--color-surface-light)]" />
      <div className="h-6 w-48 rounded bg-[var(--color-surface-light)]" />
      {[1, 2, 3].map((i) => (
        <div key={i} className="h-32 rounded-xl bg-[var(--color-surface)]" />
      ))}
    </div>
  );
}

/* ── Offer Card ────────────────────────────────────────────────── */

function OfferCard({ offer, countdown }: { offer: FreeOffer; countdown: string }) {
  return (
    <div className="rounded-xl border border-[var(--color-surface-light)] bg-[var(--color-surface)] overflow-hidden">
      {/* Art banner */}
      {offer.art && (
        <img
          src={offer.art}
          alt={offer.name}
          className="w-full h-24 object-cover"
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = "none";
          }}
        />
      )}

      <div className="p-3 space-y-2">
        {/* Name + badges */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-bold text-[var(--color-foreground)]">{offer.name}</span>
          {offer.chain && (
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-purple-600/20 text-purple-400 border border-purple-600/40">
              Step {offer.chain.index}
            </span>
          )}
          {offer.webBonusRewards.length > 0 && (
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-blue-600/20 text-blue-400 border border-blue-600/40">
              🌐 Web Bonus!
            </span>
          )}
        </div>

        {/* Rewards */}
        <div className="space-y-1">
          {offer.rewards.map((reward, i) => (
            <div key={`${reward.itemId}-${i}`} className="flex items-center gap-2">
              <span className="flex-shrink-0 text-sm">🎁</span>
              <span className="text-xs text-[var(--color-foreground)]">
                {reward.itemName}
              </span>
              <span className="text-xs text-[var(--color-muted)]">×{reward.quantity}</span>
            </div>
          ))}
        </div>

        {/* Web bonus rewards */}
        {offer.webBonusRewards.length > 0 && (
          <div className="border-t border-[var(--color-surface-light)] pt-2">
            <p className="text-[10px] text-blue-400 mb-1">Web Bonus Rewards:</p>
            {offer.webBonusRewards.map((reward, i) => (
              <div key={`web-${reward.itemId}-${i}`} className="flex items-center gap-2">
                <span className="flex-shrink-0 text-sm">🌐</span>
                <span className="text-xs text-blue-400">{reward.itemName} ×{reward.quantity}</span>
              </div>
            ))}
          </div>
        )}

        {/* Footer: countdown + remaining purchases */}
        <div className="flex items-center justify-between text-[10px] text-[var(--color-muted)]">
          {countdown && <span>⏰ {countdown}</span>}
          {offer.remainingPurchases != null && (
            <span>{offer.remainingPurchases} claim{offer.remainingPurchases !== 1 ? "s" : ""} left</span>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Milestone Card ────────────────────────────────────────────── */

function MilestoneCard({ milestone }: { milestone: Milestone }) {
  const bracket = milestone.brackets[0];
  if (!bracket) return null;

  const { points, goal, completedTier, goalTier, claimableTiers } = bracket;
  const progressPct = goal > 0 ? Math.min((points / goal) * 100, 100) : 0;

  // Find next tier reward
  const nextTierData = milestone.tiers.find((t) => t.tier === goalTier);
  const nextReward = nextTierData?.rewards[0];

  return (
    <div className="rounded-xl border border-[var(--color-surface-light)] bg-[var(--color-surface)] p-3 space-y-2">
      {/* Name + type badge */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-bold text-[var(--color-foreground)]">{milestone.name}</span>
        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-[var(--color-surface-light)] text-[var(--color-muted)]">
          {milestone.milestoneType === "alliance" ? "Alliance" : "Solo"}
        </span>
      </div>

      {/* Claimable badge */}
      {claimableTiers.length > 0 && (
        <span className="inline-block text-xs font-semibold px-2 py-1 rounded bg-green-600/20 text-green-400 border border-green-600/40">
          ⚡ {claimableTiers.length} reward{claimableTiers.length !== 1 ? "s" : ""} to claim!
        </span>
      )}

      {/* Progress bar */}
      <div>
        <div className="w-full h-2 rounded-full bg-[var(--color-surface-light)] overflow-hidden">
          <div
            className="h-full rounded-full bg-[var(--color-accent)]"
            style={{ width: `${progressPct}%` }}
          />
        </div>
        <div className="flex justify-between mt-1">
          <span className="text-[10px] text-[var(--color-muted)]">
            {formatNumber(points)} / {formatNumber(goal)} points
          </span>
          <span className="text-[10px] text-[var(--color-muted)]">
            Tier {completedTier} → Tier {goalTier}
          </span>
        </div>
      </div>

      {/* Next tier reward */}
      {nextReward && (
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-[var(--color-muted)]">Next:</span>
          <span className="flex-shrink-0 text-sm">🏆</span>
          <span className="text-xs text-[var(--color-foreground)]">
            {nextReward.itemName}
          </span>
          <span className="text-xs text-[var(--color-muted)]">×{nextReward.quantity}</span>
        </div>
      )}

      {/* Scoring caps */}
      {milestone.scoring?.cappedScorings?.map((cs, i) => (
        <div key={i} className="space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-[var(--color-muted)]">Daily Cap:</span>
            <span className="text-[10px] text-[var(--color-foreground)]">
              {formatNumber(cs.soFar)} / {formatNumber(cs.cap)}
            </span>
          </div>
          <div className="w-full h-1.5 rounded-full bg-[var(--color-surface-light)] overflow-hidden">
            <div
              className="h-full rounded-full bg-yellow-500"
              style={{ width: `${cs.cap > 0 ? Math.min((cs.soFar / cs.cap) * 100, 100) : 0}%` }}
            />
          </div>
          {cs.methods.map((m, j) => (
            <p key={j} className="text-[10px] text-[var(--color-muted)]">
              {m.description}{m.points > 0 ? ` (${m.points} pts)` : ""}
            </p>
          ))}
        </div>
      ))}

      {/* Scoring methods (non-capped) */}
      {milestone.scoring?.methods && milestone.scoring.methods.length > 0 && (
        <div>
          {milestone.scoring.methods.map((m, i) => (
            <p key={i} className="text-[10px] text-[var(--color-muted)]">
              {m.description}{m.points > 0 ? ` (${m.points} pts)` : ""}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Main Page ─────────────────────────────────────────────────── */

export default function DailyBriefingFullPageClient() {
  const [data, setData] = useState<DailyBriefingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [countdowns, setCountdowns] = useState<Record<string, string>>({});
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;

    async function fetchData() {
      try {
        const res = await fetch("/api/msf/daily-briefing");
        if (!res.ok) {
          setError("Failed to load daily briefing data");
          return;
        }
        const json = (await res.json()) as DailyBriefingData;
        setData(json);
        // Initialize countdowns
        const initial: Record<string, string> = {};
        for (const offer of json.freeOffers) {
          initial[offer.id] = formatCountdown(offer.expiration);
        }
        setCountdowns(initial);
      } catch {
        setError("Failed to load daily briefing data");
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  // Live countdown timer (every 60s)
  useEffect(() => {
    if (!data) return;
    const interval = setInterval(() => {
      const updated: Record<string, string> = {};
      for (const offer of data.freeOffers) {
        updated[offer.id] = formatCountdown(offer.expiration);
      }
      setCountdowns(updated);
    }, 60_000);
    return () => clearInterval(interval);
  }, [data]);

  if (loading) return <PageSkeleton />;

  if (error) {
    return (
      <div className="px-4 py-4 space-y-3">
        <Link
          href="/dashboard"
          className="text-xs text-[var(--color-accent)] hover:underline"
          data-testid="daily-briefing-back-link"
        >
          ← Back to Dashboard
        </Link>
        <h1 className="text-lg font-bold text-[var(--color-foreground)]" data-testid="daily-briefing-page-title">
          Daily Briefing
        </h1>
        <p className="text-sm text-red-400">{error}</p>
      </div>
    );
  }

  // Sort offers by soonest expiration
  const sortedOffers = [...(data?.freeOffers ?? [])].sort(
    (a, b) => (a.expiration ?? Infinity) - (b.expiration ?? Infinity)
  );

  // Sort milestones: claimable first, then closest to next tier
  const sortedMilestones = [...(data?.milestones ?? [])].sort((a, b) => {
    const aClaimable = a.brackets.some((br) => br.claimableTiers.length > 0) ? 1 : 0;
    const bClaimable = b.brackets.some((br) => br.claimableTiers.length > 0) ? 1 : 0;
    if (aClaimable !== bClaimable) return bClaimable - aClaimable;
    // Closest to next tier (smallest gap)
    const aGap = (a.brackets[0]?.goal ?? 0) - (a.brackets[0]?.points ?? 0);
    const bGap = (b.brackets[0]?.goal ?? 0) - (b.brackets[0]?.points ?? 0);
    return aGap - bGap;
  });

  return (
    <div className="px-4 py-4 space-y-4">
      {/* Back link */}
      <Link
        href="/dashboard"
        className="text-xs text-[var(--color-accent)] hover:underline"
        data-testid="daily-briefing-back-link"
      >
        ← Back to Dashboard
      </Link>

      {/* Page title */}
      <h1 className="text-lg font-bold text-[var(--color-foreground)]" data-testid="daily-briefing-page-title">
        Daily Briefing
      </h1>

      {/* Free Offers Section */}
      <section>
        <h2 className="text-base font-semibold text-[var(--color-foreground)] mb-3">
          Free Offers
        </h2>
        {sortedOffers.length === 0 ? (
          <p className="text-sm text-[var(--color-muted)]">No free offers available right now</p>
        ) : (
          <div className="space-y-3">
            {sortedOffers.map((offer) => (
              <OfferCard
                key={offer.id}
                offer={offer}
                countdown={countdowns[offer.id] ?? formatCountdown(offer.expiration)}
              />
            ))}
          </div>
        )}
      </section>

      {/* Milestone Progress Section */}
      <section>
        <h2 className="text-base font-semibold text-[var(--color-foreground)] mb-3">
          Milestone Progress
        </h2>
        {sortedMilestones.length === 0 ? (
          <p className="text-sm text-[var(--color-muted)]">No active milestones</p>
        ) : (
          <div className="space-y-3">
            {sortedMilestones.map((milestone) => (
              <MilestoneCard key={milestone.id} milestone={milestone} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
