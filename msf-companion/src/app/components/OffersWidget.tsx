"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";

interface OfferChoice {
  id: number;
  rewards: { itemName: string; itemId: string; quantity: number }[];
  cost: { itemName: string; itemId: string; quantity: number } | null;
}

interface Offer {
  id: string;
  name: string;
  description: string;
  expiration: number | null;
  remainingPurchases: number | null;
  choices: OfferChoice[];
  valueScore?: "High Value" | "Medium Value" | "Low Value";
  valueExplanation?: string;
}

function formatCountdown(expiration: number | null): string {
  if (!expiration) return "";
  const now = Math.floor(Date.now() / 1000);
  const diff = expiration - now;
  if (diff <= 0) return "Expired";
  const hours = Math.floor(diff / 3600);
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days}d ${hours % 24}h`;
  const mins = Math.floor((diff % 3600) / 60);
  return `${hours}h ${mins}m`;
}

function ValueBadge({ score }: { score: string }) {
  const config: Record<string, string> = {
    "High Value": "bg-green-600/20 text-green-400 border-green-600/40",
    "Medium Value": "bg-yellow-600/20 text-yellow-400 border-yellow-600/40",
    "Low Value": "bg-[var(--color-surface-light)] text-[var(--color-muted)] border-[var(--color-surface-light)]",
  };
  return (
    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${config[score] ?? config["Low Value"]}`}>
      {score}
    </span>
  );
}

function SkeletonWidget() {
  return (
    <div className="animate-pulse rounded-xl bg-[var(--color-surface)] p-4 space-y-3" data-testid="offers-widget-skeleton">
      <div className="h-4 w-40 rounded bg-[var(--color-surface-light)]" />
      {[1, 2, 3].map((i) => (
        <div key={i} className="flex items-center gap-3">
          <div className="h-8 w-8 rounded bg-[var(--color-surface-light)]" />
          <div className="flex-1 space-y-1">
            <div className="h-3 w-32 rounded bg-[var(--color-surface-light)]" />
            <div className="h-2 w-20 rounded bg-[var(--color-surface-light)]" />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function OffersWidget() {
  const [offers, setOffers] = useState<Offer[]>([]);
  const [loading, setLoading] = useState(true);
  const [scopeRequired, setScopeRequired] = useState(false);
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;

    async function fetchData() {
      try {
        const res = await fetch("/api/msf/offers");
        if (res.status === 403) {
          const data = await res.json();
          if (data.code === "SCOPE_REQUIRED") {
            setScopeRequired(true);
            return;
          }
        }
        if (res.ok) {
          const data = (await res.json()) as { data: Offer[] };
          setOffers(data.data ?? []);
        }
      } catch {
        // Non-critical widget
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  if (loading) return <SkeletonWidget />;

  if (scopeRequired) {
    return (
      <div className="rounded-xl bg-[var(--color-surface)] border border-[var(--color-surface-light)] p-4" data-testid="offers-widget">
        <h3 className="mb-2 text-sm font-bold text-[var(--color-foreground)]">🎁 Active Offers</h3>
        <p className="text-xs text-yellow-400">
          Grant access to view offers. Log out and log back in to authorize the offers scope.
        </p>
      </div>
    );
  }

  if (offers.length === 0) {
    return (
      <div className="rounded-xl bg-[var(--color-surface)] border border-[var(--color-surface-light)] p-4" data-testid="offers-widget">
        <h3 className="mb-2 text-sm font-bold text-[var(--color-foreground)]">🎁 Active Offers</h3>
        <p className="text-xs text-[var(--color-muted)]">No active offers</p>
      </div>
    );
  }

  const topOffers = offers.slice(0, 3);

  return (
    <div className="rounded-xl bg-[var(--color-surface)] border border-[var(--color-surface-light)] p-4" data-testid="offers-widget">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-bold text-[var(--color-foreground)]">🎁 Active Offers</h3>
        <Link
          href="/dashboard/offers"
          className="text-xs font-semibold text-[var(--color-accent)]"
          data-testid="offers-widget-link"
        >
          View All →
        </Link>
      </div>
      <div className="space-y-2">
        {topOffers.map((offer) => {
          const cost = offer.choices?.[0]?.cost;
          return (
            <Link
              key={offer.id}
              href="/dashboard/offers"
              className="flex items-center gap-3 rounded-lg p-2 transition-colors hover:bg-[var(--color-surface-light)]"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-[var(--color-foreground)] truncate">
                    {offer.name}
                  </span>
                  {offer.valueScore && <ValueBadge score={offer.valueScore} />}
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  {offer.expiration && (
                    <span className="text-[10px] text-[var(--color-muted)]">
                      ⏱ {formatCountdown(offer.expiration)}
                    </span>
                  )}
                  {cost && (
                    <span className="text-[10px] text-[var(--color-muted)]">
                      {cost.quantity.toLocaleString()} {cost.itemName}
                    </span>
                  )}
                </div>
                {offer.valueExplanation &&
                  offer.valueExplanation !== "No items in this offer match your current roster needs." && (
                  <p className="mt-0.5 text-[10px] text-green-400 line-clamp-2">
                    💡 {offer.valueExplanation}
                  </p>
                )}
                {(!offer.valueExplanation ||
                  offer.valueExplanation === "No items in this offer match your current roster needs.") && (
                  <p className="mt-0.5 text-[10px] text-[var(--color-muted)] italic">
                    Not matched to your current goals
                  </p>
                )}
              </div>
              <svg className="h-4 w-4 text-[var(--color-muted)] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          );
        })}
      </div>

    </div>
  );
}
