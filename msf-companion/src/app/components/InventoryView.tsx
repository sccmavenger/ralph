"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface InventoryItem {
  id: string;
  name?: string;
  quantity?: number;
  category?: string;
}

interface InventoryApiResponse {
  data?: InventoryItem[];
  error?: string;
}

const CATEGORY_ORDER = [
  "Gear",
  "Shards",
  "Ability Materials",
  "ISO-8 Items",
  "Consumables",
  "Other",
];

function categorizeItem(item: InventoryItem): string {
  const cat = item.category?.toLowerCase() ?? "";
  if (cat.includes("gear")) return "Gear";
  if (cat.includes("shard")) return "Shards";
  if (cat.includes("ability") || cat.includes("material"))
    return "Ability Materials";
  if (cat.includes("iso")) return "ISO-8 Items";
  if (cat.includes("consumable")) return "Consumables";
  return "Other";
}

function formatQuantity(n: number): string {
  return n.toLocaleString();
}

function InventorySkeleton() {
  return (
    <div className="space-y-4">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="animate-pulse">
          <div className="mb-2 h-5 w-1/3 rounded bg-[var(--color-surface-light)]" />
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, j) => (
              <div
                key={j}
                className="flex items-center justify-between rounded-lg bg-[var(--color-surface)] p-3"
              >
                <div className="h-4 w-1/2 rounded bg-[var(--color-surface-light)]" />
                <div className="h-4 w-16 rounded bg-[var(--color-surface-light)]" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function CollapsibleCategory({
  name,
  items,
}: {
  name: string;
  items: InventoryItem[];
}) {
  const [expanded, setExpanded] = useState(true);

  return (
    <div className="mb-4">
      <button
        onClick={() => setExpanded(!expanded)}
        className="mb-2 flex w-full items-center justify-between"
      >
        <h3 className="text-sm font-bold text-[var(--color-foreground)]">
          {name}{" "}
          <span className="text-xs font-normal text-[var(--color-muted)]">
            ({items.length})
          </span>
        </h3>
        <span
          className="text-[var(--color-muted)] transition-transform"
          style={{ transform: expanded ? "rotate(180deg)" : "none" }}
        >
          ▾
        </span>
      </button>

      {expanded && (
        <div className="space-y-1">
          {items.map((item, idx) => (
            <div
              key={`${item.id}-${idx}`}
              className="flex items-center justify-between rounded-lg bg-[var(--color-surface)] px-4 py-3"
            >
              <span className="text-sm text-[var(--color-foreground)]">
                {item.name ?? item.id}
              </span>
              <span className="text-sm font-semibold text-[var(--color-accent)]">
                {formatQuantity(item.quantity ?? 0)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function InventoryView() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const fetchedRef = useRef(false);

  const fetchInventory = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/msf/inventory");
      if (!res.ok) {
        const data = (await res.json()) as InventoryApiResponse;
        throw new Error(data.error || "Failed to load inventory");
      }

      const data = (await res.json()) as InventoryApiResponse;
      setItems(data.data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!fetchedRef.current) {
      fetchedRef.current = true;
      fetchInventory();
    }
  }, [fetchInventory]);

  if (loading) {
    return (
      <div className="px-4 py-4">
        <div className="mb-4 h-10 w-full rounded-lg bg-[var(--color-surface)]" />
        <InventorySkeleton />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center px-4 py-12 text-center">
        <p className="mb-4 text-sm text-[var(--color-muted)]">{error}</p>
        <button
          onClick={() => fetchInventory()}
          className="rounded-lg bg-[var(--color-accent)] px-6 py-2 text-sm font-semibold text-white"
        >
          Retry
        </button>
      </div>
    );
  }

  // Filter by search
  const filtered = search.trim()
    ? items.filter(
        (item) =>
          (item.name ?? item.id)
            .toLowerCase()
            .includes(search.trim().toLowerCase())
      )
    : items;

  // Group by category
  const grouped = new Map<string, InventoryItem[]>();
  for (const item of filtered) {
    const cat = categorizeItem(item);
    const group = grouped.get(cat) ?? [];
    group.push(item);
    grouped.set(cat, group);
  }

  // Sort categories in defined order
  const sortedCategories = CATEGORY_ORDER.filter((c) => grouped.has(c));

  return (
    <div className="px-4 py-4">
      {/* Sticky search bar */}
      <div className="sticky top-14 z-10 -mx-4 bg-[var(--color-background)] px-4 pb-3">
        <input
          type="text"
          placeholder="Search items..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-lg border border-[var(--color-surface-light)] bg-[var(--color-surface)] px-4 py-2.5 text-sm text-[var(--color-foreground)] placeholder-[var(--color-muted)] outline-none focus:border-[var(--color-accent)]"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <p className="text-sm text-[var(--color-muted)]">
            {search.trim()
              ? "No items found matching your search."
              : "No items in your inventory."}
          </p>
        </div>
      ) : (
        sortedCategories.map((cat) => (
          <CollapsibleCategory
            key={cat}
            name={cat}
            items={grouped.get(cat) ?? []}
          />
        ))
      )}
    </div>
  );
}
