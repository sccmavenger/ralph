"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";

interface OfferRewardItem {
  itemName: string;
  itemId: string;
  quantity: number;
}

interface OfferChoice {
  id: number;
  art?: string | null;
  rewards: OfferRewardItem[];
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

function SkeletonPage() {
  return (
    <div className="px-4 py-4 space-y-4" data-testid="offers-page-skeleton">
      <div className="h-4 w-32 rounded bg-[var(--color-surface-light)] animate-pulse" />
      <div className="h-6 w-48 rounded bg-[var(--color-surface-light)] animate-pulse" />
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="animate-pulse rounded-xl bg-[var(--color-surface)] p-4 space-y-2">
          <div className="h-4 w-40 rounded bg-[var(--color-surface-light)]" />
          <div className="h-3 w-64 rounded bg-[var(--color-surface-light)]" />
          <div className="h-3 w-32 rounded bg-[var(--color-surface-light)]" />
        </div>
      ))}
    </div>
  );
}

export default function OffersFullPageClient() {
  const [offers, setOffers] = useState<Offer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;

    async function fetchData() {
      try {
        const res = await fetch("/api/msf/offers");
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setError(data.error ?? `Failed to load offers (${res.status})`);
          return;
        }
        const data = (await res.json()) as { data: Offer[] };
        setOffers(data.data ?? []);
      } catch {
        setError("Failed to load offers");
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  if (loading) return <SkeletonPage />;

  return (
    <div className="px-4 py-4">
      <Link
        href="/dashboard"
        className="mb-3 inline-flex items-center gap-1 text-xs text-[var(--color-accent)] hover:underline"
      >
        ← Back to Dashboard
      </Link>

      <h2 className="mb-1 text-xl font-bold text-[var(--color-foreground)]">
        Active Offers
      </h2>
      <p className="mb-4 text-xs text-[var(--color-muted)]">
        {offers.length} offer{offers.length !== 1 ? "s" : ""} available
      </p>

      {/* Search */}
      {!error && offers.length > 0 && (
        <input
          type="text"
          placeholder="Search offers..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="mb-4 w-full rounded-lg border border-[var(--color-surface-light)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-foreground)] placeholder:text-[var(--color-muted)]"
          data-testid="offers-search"
        />
      )}

      {error && (
        <div className="mb-4 rounded-xl bg-red-600/20 border border-red-600/40 p-4">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      {!error && offers.length === 0 && (
        <div className="rounded-xl bg-[var(--color-surface)] p-6 text-center">
          <p className="text-sm text-[var(--color-muted)]">No active offers right now</p>
        </div>
      )}

      <div className="space-y-3">
        {offers
          .filter((offer) => {
            if (!searchQuery.trim()) return true;
            const q = searchQuery.toLowerCase();
            const searchableText = [
              offer.name,
              offer.description,
              offer.valueScore,
              offer.valueExplanation,
              ...offer.choices.flatMap((c) => [
                c.cost?.itemName,
                ...c.rewards.map((r) => r.itemName),
              ]),
            ]
              .filter(Boolean)
              .join(" ")
              .toLowerCase();
            return searchableText.includes(q);
          })
          .map((offer) => (
          <div
            key={offer.id}
            className="rounded-xl bg-[var(--color-surface)] border border-[var(--color-surface-light)] p-4"
            data-testid={`offer-card-${offer.id}`}
          >
            {/* Header */}
            <div className="flex items-start justify-between mb-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-sm font-bold text-[var(--color-foreground)]">
                    {offer.name}
                  </h3>
                  {offer.valueScore && <ValueBadge score={offer.valueScore} />}
                </div>
                {offer.description && (
                  <p className="mt-1 text-xs text-[var(--color-muted)] line-clamp-2">
                    {offer.description}
                  </p>
                )}
              </div>
            </div>

            {/* Meta info */}
            <div className="flex flex-wrap items-center gap-3 mb-3 text-[10px] text-[var(--color-muted)]">
              {offer.expiration && (
                <span>⏱ {formatCountdown(offer.expiration)}</span>
              )}
              {offer.remainingPurchases != null && (
                <span>{offer.remainingPurchases} purchase{offer.remainingPurchases !== 1 ? "s" : ""} left</span>
              )}
            </div>

            {/* Choices - rewards & cost */}
            {offer.choices.map((choice) => (
              <div key={choice.id} className="mb-2 rounded-lg bg-[var(--color-background)] p-3">
                {/* Cost */}
                {choice.cost && (
                  <div className="mb-2 text-xs font-semibold text-[var(--color-foreground)]">
                    💰 {choice.cost.quantity.toLocaleString()} {choice.cost.itemName}
                  </div>
                )}
                {/* Rewards */}
                {choice.rewards.length > 0 && (
                  <div className="space-y-1">
                    {choice.rewards.map((reward, idx) => (
                      <div key={idx} className="flex justify-between text-xs">
                        <span className="text-[var(--color-foreground)]">{reward.itemName}</span>
                        <span className="text-[var(--color-muted)]">×{reward.quantity.toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}

            {/* Scoring explanation — always visible */}
            {offer.valueExplanation && (
              <p
                className={`mt-2 text-xs leading-relaxed ${
                  offer.valueExplanation.startsWith("No items")
                    ? "text-[var(--color-muted)] italic"
                    : "text-green-400"
                }`}
                data-testid="offer-explanation"
              >
                {offer.valueExplanation.startsWith("No items")
                  ? offer.valueExplanation
                  : `💡 ${offer.valueExplanation}`}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
