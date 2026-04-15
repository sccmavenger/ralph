"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { CharPortrait } from "@/app/components/CharPortrait";

interface CharacterTarget {
  level?: number;
  gearTier?: number;
  basic?: number;
  special?: number;
  ultimate?: number;
  passive?: number;
  activeYellow?: number;
}

interface CharDeficit {
  characterId: string;
  characterName: string;
  portrait: string;
  current: {
    level: number;
    gearTier: number;
    basic: number;
    special: number;
    ultimate: number;
    passive: number;
  };
  deficits: string[];
}

interface TokenLevel {
  id: string;
  characterTarget: CharacterTarget;
  rosterComparison: {
    totalCharacters: number;
    meetsBenchmark: number;
    doesNotMeet: CharDeficit[];
  };
}

function SkeletonPage() {
  return (
    <div className="px-4 py-4 space-y-4" data-testid="upgrade-tokens-skeleton">
      <div className="h-4 w-24 rounded bg-[var(--color-surface-light)] animate-pulse" />
      <div className="h-6 w-56 rounded bg-[var(--color-surface-light)] animate-pulse" />
      <div className="h-10 w-full rounded bg-[var(--color-surface-light)] animate-pulse" />
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="animate-pulse rounded-xl bg-[var(--color-surface)] p-4 flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-[var(--color-surface-light)]" />
          <div className="flex-1 space-y-2">
            <div className="h-3 w-32 rounded bg-[var(--color-surface-light)]" />
            <div className="h-2 w-48 rounded bg-[var(--color-surface-light)]" />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function UpgradeTokensClient() {
  const [tokens, setTokens] = useState<TokenLevel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedToken, setSelectedToken] = useState<string>("");
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;

    async function fetchData() {
      try {
        const res = await fetch("/api/msf/upgrade-tokens");
        if (!res.ok) {
          setError("Failed to load upgrade token data");
          return;
        }
        const data = (await res.json()) as { data: TokenLevel[] };
        const tokenList = data.data ?? [];
        setTokens(tokenList);
        if (tokenList.length > 0) {
          setSelectedToken(tokenList[0].id);
        }
      } catch {
        setError("Failed to load upgrade token data");
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  if (loading) return <SkeletonPage />;

  const selected = tokens.find((t) => t.id === selectedToken);

  return (
    <div className="px-4 py-4">
      <Link
        href="/analyze"
        className="mb-3 inline-flex items-center gap-1 text-xs text-[var(--color-accent)] hover:underline"
      >
        ← Back to Analyze
      </Link>

      <h2 className="mb-1 text-xl font-bold text-[var(--color-foreground)]">
        Upgrade Token Build Guide
      </h2>
      <p className="mb-4 text-xs text-[var(--color-muted)]">
        See which characters meet each upgrade token benchmark
      </p>

      {error && (
        <div className="mb-4 rounded-xl bg-red-600/20 border border-red-600/40 p-4">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      {!error && tokens.length > 0 && (
        <>
          {/* Token selector */}
          <select
            value={selectedToken}
            onChange={(e) => setSelectedToken(e.target.value)}
            className="mb-4 w-full rounded-lg border border-[var(--color-surface-light)] bg-[var(--color-surface)] px-3 py-2.5 text-sm text-[var(--color-foreground)]"
            data-testid="token-selector"
          >
            {tokens.map((t) => (
              <option key={t.id} value={t.id}>
                {t.id} — Lv{t.characterTarget.level ?? "?"} / G{t.characterTarget.gearTier ?? "?"}
              </option>
            ))}
          </select>

          {selected && (
            <>
              {/* Summary */}
              <div className="mb-4 rounded-xl bg-[var(--color-surface)] p-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-[var(--color-foreground)]">
                    {selected.rosterComparison.meetsBenchmark} of {selected.rosterComparison.totalCharacters} characters meet this benchmark
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap gap-2 text-[10px] text-[var(--color-muted)]">
                  {selected.characterTarget.level && <span>Level {selected.characterTarget.level}</span>}
                  {selected.characterTarget.gearTier && <span>• Gear {selected.characterTarget.gearTier}</span>}
                  {selected.characterTarget.basic && <span>• Basic {selected.characterTarget.basic}</span>}
                  {selected.characterTarget.special && <span>• Special {selected.characterTarget.special}</span>}
                  {selected.characterTarget.ultimate && <span>• Ultimate {selected.characterTarget.ultimate}</span>}
                  {selected.characterTarget.passive && <span>• Passive {selected.characterTarget.passive}</span>}
                </div>
              </div>

              {/* Characters that don't meet benchmark */}
              {selected.rosterComparison.doesNotMeet.length === 0 ? (
                <div className="rounded-xl bg-green-600/10 border border-green-600/30 p-4 text-center">
                  <p className="text-sm text-green-400">🎉 All characters meet this benchmark!</p>
                </div>
              ) : (
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold text-[var(--color-foreground)]">
                    Characters Below Benchmark ({selected.rosterComparison.doesNotMeet.length})
                  </h3>
                  {selected.rosterComparison.doesNotMeet.map((char) => (
                    <div
                      key={char.characterId}
                      className="flex items-center gap-3 rounded-xl bg-[var(--color-surface)] border border-[var(--color-surface-light)] p-3"
                      data-testid={`ut-char-${char.characterId}`}
                    >
                      <CharPortrait
                        src={char.portrait}
                        name={char.characterName}
                        imgClassName="h-10 w-10 rounded-full border border-[var(--color-surface-light)] object-cover"
                        fallbackClassName="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--color-surface-light)] text-xs font-bold text-[var(--color-muted)]"
                      />
                      <div className="flex-1 min-w-0">
                        <span className="text-xs font-semibold text-[var(--color-foreground)] block truncate">
                          {char.characterName}
                        </span>
                        <div className="flex flex-wrap gap-1.5 mt-1">
                          {char.deficits.map((d, i) => (
                            <span key={i} className="text-[10px] text-red-400 bg-red-600/10 px-1.5 py-0.5 rounded">
                              {d}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
