"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useSearchParams } from "next/navigation";
interface NodeReward {
  itemId: string;
  itemName: string;
  icon?: string;
  quantity: number;
  maxQuantity?: number;
  weight?: number;
  expectedValue: number;
  type: string;
  characterId?: string;
}

interface CampaignNode {
  episodicId: string;
  episodicName: string;
  chapterNumber: number;
  tierNumber: number;
  nodeName: string;
  energyCost: number;
  rewards: NodeReward[];
}

interface GapItem {
  itemId: string;
  itemName: string;
  needed: number;
  owned: number;
  deficit: number;
  farmable: boolean;
  sources: { characterName: string; currentGear: number; targetGear: number }[];
}

type LoadingState = "idle" | "loading" | "done" | "error";

const FILTER_TYPES = [
  { key: "GEAR", label: "Gear" },
  { key: "SHARD", label: "Shards" },
  { key: "CONSUMABLE", label: "Training Mats" },
  { key: "ABILITY_MATERIAL", label: "Ability Mats" },
  { key: "ISOITEM", label: "ISO-8" },
] as const;

type FilterTypeKey = (typeof FILTER_TYPES)[number]["key"];

export default function FarmingPageClient() {
  const searchParams = useSearchParams();
  const characterParam = searchParams.get("character");

  const [nodes, setNodes] = useState<CampaignNode[]>([]);
  const [loadingState, setLoadingState] = useState<LoadingState>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [activeFilters, setActiveFilters] = useState<Set<FilterTypeKey>>(
    new Set(),
  );
  const [characterGapItems, setCharacterGapItems] = useState<Set<string> | null>(null);
  const [characterGapLoading, setCharacterGapLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fetch character-specific gaps when deep-linked from planner
  const fetchCharacterGaps = useCallback(async (characterName: string) => {
    setCharacterGapLoading(true);
    try {
      const res = await fetch("/api/msf/farming/gaps");
      if (!res.ok) {
        setCharacterGapItems(null);
        return;
      }
      const data: { gaps: GapItem[] } = await res.json();
      // Find items needed by this specific character
      const itemIds = new Set<string>();
      for (const gap of data.gaps ?? []) {
        const isForCharacter = gap.sources.some(
          (s) => s.characterName.toLowerCase() === characterName.toLowerCase(),
        );
        if (isForCharacter && gap.farmable) {
          itemIds.add(gap.itemId);
        }
      }
      setCharacterGapItems(itemIds.size > 0 ? itemIds : null);
    } catch {
      setCharacterGapItems(null);
    } finally {
      setCharacterGapLoading(false);
    }
  }, []);

  const fetchNodes = useCallback(async (refresh = false) => {
    setLoadingState("loading");
    setErrorMessage("");

    try {
      const qs = refresh ? "?refresh=true" : "";
      const res = await fetch(`/api/msf/farming/nodes${qs}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const data: CampaignNode[] = await res.json();
      setNodes(data);
      setLoadingState("done");
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : String(err));
      setLoadingState("error");
    }
  }, []);

  useEffect(() => {
    fetchNodes();
    if (characterParam) {
      fetchCharacterGaps(characterParam);
    }
  }, [fetchNodes, characterParam, fetchCharacterGaps]);

  // Debounce search input by 300ms
  const handleSearchChange = useCallback(
    (value: string) => {
      setSearchQuery(value);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        setDebouncedQuery(value);
      }, 300);
    },
    [],
  );

  // Cleanup debounce timer
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const toggleFilter = useCallback((key: FilterTypeKey) => {
    setActiveFilters((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  // Filter nodes based on search query, active type filters, and character gap filter
  const filteredNodes = useMemo(() => {
    const query = debouncedQuery.toLowerCase().trim();

    const filtered = nodes
      .filter((node) => {
        // Character gap filter: only show nodes that drop items this character needs
        if (characterGapItems && characterGapItems.size > 0) {
          const hasNeededItem = node.rewards.some((r) =>
            characterGapItems.has(r.itemId),
          );
          if (!hasNeededItem) return false;
        }

        // Type filter: node must have at least one reward matching any active filter
        if (activeFilters.size > 0) {
          const hasMatchingType = node.rewards.some((r) =>
            activeFilters.has(r.type as FilterTypeKey),
          );
          if (!hasMatchingType) return false;
        }

        // Search filter: match reward item names OR character names for shard rewards
        if (query) {
          const matchesReward = node.rewards.some((r) =>
            r.itemName.toLowerCase().includes(query),
          );
          const matchesShard = node.rewards.some(
            (r) =>
              r.type === "SHARD" &&
              r.characterId &&
              r.itemName.toLowerCase().includes(query),
          );
          if (!matchesReward && !matchesShard) return false;
        }

        return true;
      });

    // Build shard match set: nodes that have a shard reward matching the query
    const shardMatchSet = new Set<string>();
    if (query) {
      for (const node of filtered) {
        const hasShard = node.rewards.some(
          (r) =>
            r.type === "SHARD" &&
            r.itemName.toLowerCase().includes(query),
        );
        if (hasShard) {
          shardMatchSet.add(
            `${node.episodicId}-${node.chapterNumber}-${node.tierNumber}`,
          );
        }
      }
    }

    // Sort: shard matches first (if searching), then chapter order
    filtered.sort((a, b) => {
      const keyA = `${a.episodicId}-${a.chapterNumber}-${a.tierNumber}`;
      const keyB = `${b.episodicId}-${b.chapterNumber}-${b.tierNumber}`;
      // Shard matches sort first when query is active
      if (shardMatchSet.size > 0) {
        const aMatch = shardMatchSet.has(keyA) ? 1 : 0;
        const bMatch = shardMatchSet.has(keyB) ? 1 : 0;
        if (aMatch !== bMatch) return bMatch - aMatch;
      }
      return (
        a.episodicName.localeCompare(b.episodicName) ||
        a.chapterNumber - b.chapterNumber ||
        a.tierNumber - b.tierNumber
      );
    });

    return { nodes: filtered, shardMatchKeys: shardMatchSet };
  }, [nodes, debouncedQuery, activeFilters, characterGapItems]);

  return (
    <div className="px-4 py-4">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-[var(--color-foreground)]">
            Farming Guide
          </h2>
          <p className="text-xs text-[var(--color-muted)]">
            Campaign node rewards &amp; farming lookup
          </p>
        </div>
        <button
          onClick={() => fetchNodes(true)}
          disabled={loadingState === "loading"}
          className="rounded-lg bg-[var(--color-surface)] px-3 py-1.5 text-xs font-medium text-[var(--color-foreground)] hover:ring-1 hover:ring-[var(--color-accent)] disabled:opacity-50"
        >
          Refresh
        </button>
      </div>

      {/* Disclaimer banner */}
      <div
        className="mb-4 rounded-xl bg-amber-500/10 px-4 py-2.5 text-xs text-amber-300"
        data-testid="farming-disclaimer"
      >
        ⚠️ Some nodes may require campaign progression you haven&apos;t completed yet.
      </div>

      {/* Character filter banner (when deep-linked from planner) */}
      {characterParam && (
        <div
          className="mb-4 flex items-center justify-between rounded-xl bg-[var(--color-accent)]/10 px-4 py-2.5"
          data-testid="character-filter-banner"
        >
          <span className="text-xs text-[var(--color-accent)]">
            {characterGapLoading
              ? `Loading gear needs for ${characterParam}…`
              : characterGapItems && characterGapItems.size > 0
                ? `Showing nodes for ${characterParam}'s gear upgrades (${characterGapItems.size} items)`
                : `Showing all nodes — no farmable gaps found for ${characterParam}`}
          </span>
          <a
            href="/analyze/farming"
            className="ml-2 shrink-0 rounded-md bg-[var(--color-surface)] px-2 py-1 text-[10px] font-medium text-[var(--color-foreground)] hover:ring-1 hover:ring-[var(--color-accent)]"
            data-testid="clear-character-filter"
          >
            Clear
          </a>
        </div>
      )}

      {/* Loading */}
      {loadingState === "loading" && (
        <div className="flex flex-col items-center justify-center py-16">
          <div className="mb-3 h-8 w-8 animate-spin rounded-full border-2 border-[var(--color-muted)] border-t-[var(--color-accent)]" />
          <p className="text-sm text-[var(--color-muted)]">
            Loading campaign data…
          </p>
          <p className="mt-1 text-xs text-[var(--color-muted)]">
            This may take a moment on first load
          </p>
        </div>
      )}

      {/* Error */}
      {loadingState === "error" && (
        <div className="rounded-xl bg-red-900/20 p-4 text-center">
          <p className="mb-2 text-sm text-red-400">{errorMessage}</p>
          <button
            onClick={() => fetchNodes()}
            className="rounded-lg bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-white"
          >
            Retry
          </button>
        </div>
      )}

      {/* Results */}
      {loadingState === "done" && (
        <>
          {/* Search bar */}
          <div className="sticky top-0 z-10 -mx-4 bg-[var(--color-background)] px-4 pb-3">
            <div className="relative">
              <svg
                className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-[var(--color-muted)]"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => handleSearchChange(e.target.value)}
                placeholder="Search resources or character names…"
                className="w-full rounded-xl bg-[var(--color-surface)] py-2.5 pr-4 pl-10 text-sm text-[var(--color-foreground)] placeholder-[var(--color-muted)] outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
                data-testid="farming-search"
              />
            </div>

            {/* Filter chips */}
            <div className="mt-2 flex gap-2 overflow-x-auto" data-testid="filter-chips">
              {FILTER_TYPES.map((ft) => {
                const isActive = activeFilters.has(ft.key);
                return (
                  <button
                    key={ft.key}
                    onClick={() => toggleFilter(ft.key)}
                    data-testid={`filter-chip-${ft.key}`}
                    className={`inline-flex shrink-0 items-center gap-1 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                      isActive
                        ? getChipActiveStyle(ft.key)
                        : "bg-[var(--color-surface)] text-[var(--color-muted)] hover:text-[var(--color-foreground)]"
                    }`}
                  >
                    <RewardTypeIcon type={ft.key} size={12} />
                    {ft.label}
                  </button>
                );
              })}
            </div>

          </div>

          {/* Results count + active filter indicator */}
          <div className="mb-3 flex items-center justify-between">
            <p className="text-xs text-[var(--color-muted)]">
              {filteredNodes.nodes.length === nodes.length
              ? `${nodes.length} campaign node${nodes.length !== 1 ? "s" : ""} indexed`
              : `${filteredNodes.nodes.length} of ${nodes.length} nodes match`}
            </p>
            {activeFilters.size > 0 && (
              <button
                onClick={() => setActiveFilters(new Set())}
                className="rounded-md bg-[var(--color-surface)] px-2 py-0.5 text-[10px] font-medium text-[var(--color-accent)] hover:ring-1 hover:ring-[var(--color-accent)]"
                data-testid="clear-filters"
              >
                Clear filters
              </button>
            )}
          </div>

          {filteredNodes.nodes.length === 0 ? (
            <div
              className="rounded-xl bg-[var(--color-surface)] p-6 text-center"
              data-testid="farming-empty-state"
            >
              <p className="text-sm text-[var(--color-muted)]">
                {nodes.length === 0
                  ? "No campaign nodes found"
                  : "No nodes match your search or filters"}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredNodes.nodes.map((node) => {
                const nodeKey = `${node.episodicId}-${node.chapterNumber}-${node.tierNumber}`;
                const isShardMatch = filteredNodes.shardMatchKeys.has(nodeKey);
                return (
                <div
                  key={nodeKey}
                  className={`rounded-xl p-3 ${
                    isShardMatch
                      ? "bg-purple-500/10 ring-1 ring-purple-500/40"
                      : "bg-[var(--color-surface)]"
                  }`}
                  data-testid="farming-node-card"
                  data-shard-match={isShardMatch ? "true" : undefined}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-semibold text-[var(--color-foreground)]">
                        {node.nodeName}
                      </h4>
                      {isShardMatch && (
                        <span
                          className="rounded-md bg-purple-500/20 px-1.5 py-0.5 text-[10px] font-bold text-purple-400"
                          data-testid="shard-match-badge"
                        >
                          SHARD
                        </span>
                      )}
                    </div>
                  </div>
                  <p className="mt-0.5 text-xs text-[var(--color-muted)]">
                    {node.episodicName}
                  </p>

                  {node.rewards.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {(activeFilters.size > 0
                        ? node.rewards.filter((r) => activeFilters.has(r.type as FilterTypeKey))
                        : node.rewards
                      ).slice(0, 6).map((reward) => (
                        <span
                          key={reward.itemId}
                          className={`inline-flex items-center justify-center rounded-md p-1 ${getRewardTypeStyle(reward.type)}`}
                          title={reward.itemName}
                        >
                          {reward.icon ? (
                            <img
                              src={reward.icon}
                              alt={reward.itemName}
                              width={32}
                              height={32}
                              className="h-8 w-8 rounded-sm object-contain"
                              loading="lazy"
                              onError={(e) => { e.currentTarget.style.display = "none"; e.currentTarget.nextElementSibling?.removeAttribute("style"); }}
                            />
                          ) : null}
                          <span style={reward.icon ? { display: "none" } : undefined}>
                            <RewardTypeIcon type={reward.type} size={28} />
                          </span>
                        </span>
                      ))}
                      {(activeFilters.size > 0
                        ? node.rewards.filter((r) => activeFilters.has(r.type as FilterTypeKey))
                        : node.rewards
                      ).length > 6 && (
                        <span className="inline-block rounded-md bg-[var(--color-muted)]/20 px-1.5 py-0.5 text-[10px] text-[var(--color-muted)]">
                          +{(activeFilters.size > 0
                            ? node.rewards.filter((r) => activeFilters.has(r.type as FilterTypeKey))
                            : node.rewards
                          ).length - 6}
                        </span>
                      )}
                    </div>
                  )}
                </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function getChipActiveStyle(key: string): string {
  switch (key) {
    case "GEAR":
      return "bg-blue-500/30 text-blue-300 ring-1 ring-blue-500/50";
    case "SHARD":
      return "bg-purple-500/30 text-purple-300 ring-1 ring-purple-500/50";
    case "ABILITY_MATERIAL":
      return "bg-green-500/30 text-green-300 ring-1 ring-green-500/50";
    case "ISOITEM":
      return "bg-teal-500/30 text-teal-300 ring-1 ring-teal-500/50";
    case "CONSUMABLE":
      return "bg-orange-500/30 text-orange-300 ring-1 ring-orange-500/50";
    default:
      return "bg-[var(--color-accent)]/30 text-[var(--color-accent)] ring-1 ring-[var(--color-accent)]/50";
  }
}

function getRewardTypeStyle(type: string): string {
  switch (type) {
    case "GEAR":
      return "bg-blue-500/20 text-blue-400";
    case "SHARD":
      return "bg-purple-500/20 text-purple-400";
    case "ABILITY_MATERIAL":
      return "bg-green-500/20 text-green-400";
    case "ISOITEM":
      return "bg-teal-500/20 text-teal-400";
    case "CONSUMABLE":
      return "bg-orange-500/20 text-orange-400";
    default:
      return "bg-[var(--color-muted)]/20 text-[var(--color-muted)]";
  }
}

/** Compact SVG icon for each reward type (14×14) */
function RewardTypeIcon({ type, size = 14 }: { type: string; size?: number }) {
  const s = size;
  switch (type) {
    case "GEAR":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      );
    case "SHARD":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
        </svg>
      );
    case "ABILITY_MATERIAL":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
          <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
        </svg>
      );
    case "ISOITEM":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 3h12l4 6-10 13L2 9z" />
        </svg>
      );
    case "CONSUMABLE":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2v4a2 2 0 0 0 2 2h4" />
          <path d="M16 22H8a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h6l6 6v12a2 2 0 0 1-2 2z" />
          <line x1="10" y1="12" x2="14" y2="12" />
          <line x1="10" y1="16" x2="14" y2="16" />
        </svg>
      );
    default:
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
        </svg>
      );
  }
}
