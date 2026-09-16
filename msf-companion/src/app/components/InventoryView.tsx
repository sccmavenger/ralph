"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import DashboardIcon, { type DashboardIconName } from "../(app)/dashboard/DashboardIcon";
import { filterInventory, INVENTORY_CATEGORIES, parseInventory, sortInventory, type InventoryCategory, type InventoryItem, type InventorySort } from "@/lib/inventory-view";
import styles from "./inventory.module.css";

const PAGE_SIZE = 40;
const categoryStyle: Record<InventoryCategory, { color: string; icon: DashboardIconName; label: string }> = {
  Gear: { color: "purple", icon: "inventory", label: "Gear" },
  Shards: { color: "blue", icon: "roster", label: "Shards" },
  "Ability Materials": { color: "orange", icon: "target", label: "Ability" },
  "Training Materials": { color: "teal", icon: "planner", label: "Training" },
  "ISO-8 Items": { color: "teal", icon: "route", label: "ISO-8" },
  Orbs: { color: "purple", icon: "gift", label: "Orbs" },
  Currency: { color: "orange", icon: "inventory", label: "Currency" },
  Consumables: { color: "blue", icon: "gift", label: "Consumables" },
  Other: { color: "gray", icon: "inventory", label: "Other" },
};

function ItemArtwork({ item }: { item: InventoryItem }) {
  const [failed, setFailed] = useState(false);
  return <span className={[styles.artwork, styles[categoryStyle[item.category].color]].join(" ")} aria-hidden="true">
    {item.icon && !failed ?
      // Game CDN images have variable hosts; keep them lazy and size-constrained.
      // eslint-disable-next-line @next/next/no-img-element
      <img src={item.icon} alt="" width={40} height={40} loading="lazy" onError={() => setFailed(true)} /> :
      <DashboardIcon name={categoryStyle[item.category].icon} />}
  </span>;
}

export default function InventoryView() {
  const [items, setItems] = useState<InventoryItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [accessError, setAccessError] = useState<number | null>(null);
  const [loadedAt, setLoadedAt] = useState<Date | null>(null);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<InventoryCategory | "All">("All");
  const [inStockOnly, setInStockOnly] = useState(false);
  const [sort, setSort] = useState<InventorySort>("name");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const request = useRef<AbortController | null>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const moreFocus = useRef<HTMLLIElement>(null);
  const shouldFocusMore = useRef(false);

  const fetchInventory = useCallback(async () => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    setError(null);
    setAccessError(null);
    try {
      const response = await fetch("/api/msf/inventory", { cache: "no-store", signal: controller.signal });
      if (!response.ok) {
        if (!controller.signal.aborted) setAccessError(response.status);
        throw new Error(response.status === 401 ? "Your game session has expired. Sign in again to refresh your inventory." : response.status === 403 ? "Inventory access requires an active Premium account." : "We couldn't refresh your inventory. Please try again.");
      }
      const data = parseInventory(await response.json());
      if (controller.signal.aborted) return;
      setItems(data);
      setLoadedAt(new Date());
    } catch (err) {
      if (!controller.signal.aborted) setError(err instanceof Error ? err.message : "Inventory is temporarily unavailable.");
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void fetchInventory(), 0);
    return () => { clearTimeout(timer); request.current?.abort(); };
  }, [fetchInventory]);

  useEffect(() => {
    if (shouldFocusMore.current) {
      moreFocus.current?.focus({ preventScroll: true });
      shouldFocusMore.current = false;
    }
  }, [visibleCount]);

  const searched = filterInventory(items ?? [], search, inStockOnly);
  const filtered = sortInventory(searched.filter(item => category === "All" || item.category === category), sort);
  const displayed = filtered.slice(0, visibleCount);
  const ownedCount = items?.filter(item => item.quantity !== null && item.quantity > 0).length;
  const unknownCount = items?.filter(item => item.quantity === null).length ?? 0;
  const stockCount = ownedCount === undefined || (unknownCount > 0 && ownedCount === 0) ? "—" : ownedCount.toLocaleString() + (unknownCount > 0 ? "+" : "");
  const categoryCount = items ? new Set(items.map(item => item.category)).size : null;
  const hasFilters = !!search.trim() || category !== "All" || inStockOnly;
  const resetFilters = () => { setSearch(""); setCategory("All"); setInStockOnly(false); setVisibleCount(PAGE_SIZE); searchInput.current?.focus(); };

  return <div className={styles.page} data-testid="inventory-page">
    <header className={styles.heading}>
      <span className={styles.eyebrow}>YOUR RESOURCES</span>
      <h1>Inventory</h1>
      <p>Know what you have. Plan what comes next.</p>
    </header>

    <section className={styles.overview} aria-label="Inventory snapshot">
      <div className={styles.snapshotHeading}>
        <span><DashboardIcon name="inventory" /> ON HAND</span>
        <button type="button" onClick={fetchInventory} disabled={loading} aria-label="Refresh inventory" className={styles.refresh}><DashboardIcon name="refresh" /></button>
      </div>
      <div className={styles.stats}>
        <div><strong data-testid="inventory-in-stock">{stockCount}</strong><span>item types in stock</span></div>
        <div><strong>{categoryCount === null ? "—" : categoryCount}</strong><span>resource categories</span></div>
      </div>
      <div className={styles.freshness}><span className={error ? styles.staleDot : styles.dot} /><span>{loading ? "Checking your inventory…" : loadedAt ? (error ? "Last loaded" : "Loaded") + " at " + loadedAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "Not loaded yet"}</span><span>Game-reported</span></div>
      {unknownCount > 0 && <p className={styles.snapshotNote}>{unknownCount} {unknownCount === 1 ? "balance not reported" : "balances not reported"}. Stock count is incomplete.</p>}
    </section>

    <nav className={styles.actions} aria-label="Resource planning tools">
      <Link href="/planner" className={styles.planAction}><DashboardIcon name="target" /><span><strong>Plan upgrades</strong><span>Check your next investment</span></span><span aria-hidden="true">›</span></Link>
      <Link href="/analyze/farming" className={styles.farmAction}><DashboardIcon name="route" /><span><strong>Find resources</strong><span>Explore farming sources</span></span><span aria-hidden="true">›</span></Link>
    </nav>

    {error && <section className={styles.error} role="alert" data-testid="inventory-error">
      <strong>{items ? "Refresh unsuccessful" : "Inventory unavailable"}</strong>
      <p>{error}</p>
      {items && <p>Showing your last successful load. Quantities may have changed.</p>}
      <button type="button" onClick={fetchInventory} disabled={loading}>Try again</button>
      {accessError === 401 && <a className={styles.recoverAccess} href="/api/auth/login">Sign in again →</a>}
      {accessError === 403 && <Link className={styles.recoverAccess} href="/subscribe">View plans →</Link>}
    </section>}

    <section aria-label="Browse inventory" className={styles.browser}>
      <div className={styles.searchBox}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 4.5 4.5" /></svg>
        <input ref={searchInput} type="search" aria-label="Search inventory" placeholder="Search by item name or ID" value={search} onChange={e => { setSearch(e.target.value); setVisibleCount(PAGE_SIZE); }} />
        {search && <button type="button" aria-label="Clear search" onClick={() => { setSearch(""); setVisibleCount(PAGE_SIZE); searchInput.current?.focus(); }}>×</button>}
      </div>
      <div className={styles.categories} role="group" aria-label="Filter by resource category">
        <button type="button" aria-pressed={category === "All"} onClick={() => { setCategory("All"); setVisibleCount(PAGE_SIZE); }}>All <span>{items ? searched.length : "—"}</span></button>
        {INVENTORY_CATEGORIES.filter(c => items?.some(item => item.category === c) || category === c).map(c => <button key={c} type="button" aria-pressed={category === c} onClick={() => { setCategory(c); setVisibleCount(PAGE_SIZE); }} aria-label={c + " category"}>
          {categoryStyle[c].label} <span>{searched.filter(item => item.category === c).length}</span>
        </button>)}
      </div>
      <div className={styles.options}>
        <label className={styles.stockToggle}><input type="checkbox" checked={inStockOnly} onChange={e => { setInStockOnly(e.target.checked); setVisibleCount(PAGE_SIZE); }} /><span>In stock only</span></label>
        <label className={styles.sort}>Sort <select aria-label="Sort inventory" value={sort} onChange={e => { setSort(e.target.value as InventorySort); setVisibleCount(PAGE_SIZE); }}><option value="name">Name A–Z</option><option value="quantity-desc">Most owned</option><option value="quantity-asc">Least owned</option></select></label>
      </div>

      <div className={styles.listHeading}>
        <h2>{category === "All" ? "Your items" : category}</h2>
        <span role="status" aria-live="polite">{items ? filtered.length.toLocaleString() + (filtered.length === 1 ? " item type" : " item types") : loading ? "Loading…" : "Unavailable"}</span>
      </div>

      {items === null && loading ? <div className={styles.skeleton} role="status" aria-label="Loading inventory">{[1, 2, 3, 4].map(i => <div key={i} />)}</div> : items && filtered.length > 0 ? <>
        <ul className={styles.itemList} aria-label="Inventory items" aria-busy={loading}>
          {displayed.map((item, index) => <li key={item.id} ref={index === visibleCount - PAGE_SIZE ? moreFocus : undefined} tabIndex={-1} className={styles.item} data-testid="inventory-item">
            <ItemArtwork item={item} />
            <div className={styles.itemName}><h3>{item.name ?? item.id}</h3><span className={styles[categoryStyle[item.category].color]}>{item.category}</span>{!item.name && <small>Item name not provided</small>}</div>
            <div className={styles.quantity}><strong className={item.quantity === 0 ? styles.zero : ""}>{item.quantity === null ? "—" : item.quantity.toLocaleString()}</strong><span>{item.quantity === null ? "Not reported" : item.quantity === 0 ? "None on hand" : "on hand"}</span></div>
          </li>)}
        </ul>
        {filtered.length > visibleCount && <button className={styles.loadMore} type="button" onClick={() => { shouldFocusMore.current = true; setVisibleCount(n => n + PAGE_SIZE); }}>Show {Math.min(PAGE_SIZE, filtered.length - visibleCount)} more <span>({visibleCount} of {filtered.length})</span></button>}
      </> : items && <div className={styles.empty} data-testid="inventory-empty">
        <DashboardIcon name="inventory" /><h3>{hasFilters ? "No matching resources" : "No items reported yet"}</h3>
        <p>{hasFilters ? "Try another search or clear your filters to see everything." : "The game returned an empty inventory. Refresh after your next session to check again."}</p>
        {hasFilters && <button type="button" onClick={resetFilters}>Clear filters</button>}
      </div>}
    </section>

    <aside className={styles.note}><DashboardIcon name="clock" /><p>Inventory is a snapshot, not a spending budget. <Link href="/planner">Use the planner</Link> to check upgrade requirements and your self-reported Gold &amp; Cores.</p></aside>
  </div>;
}
