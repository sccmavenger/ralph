"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import WalletStrip from "@/app/components/WalletStrip";
import { expiryLabel, parseDashboardBriefing, summarizeDashboardBriefing, type DashboardBriefing } from "@/lib/dashboard-briefing";
import DashboardInsights from "./DashboardInsights";
import DashboardIcon from "./DashboardIcon";
import styles from "./dashboard.module.css";

export default function DashboardOverview({ displayName, portrait, offersEnabled = false }: {
  displayName: string;
  portrait?: string | null;
  offersEnabled?: boolean;
}) {
  const [data, setData] = useState<DashboardBriefing | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [checkedAt, setCheckedAt] = useState<number | null>(null);
  const [now, setNow] = useState(0);
  const [showRewards, setShowRewards] = useState(false);
  const [showInsights, setShowInsights] = useState(false);
  const rewardsHeading = useRef<HTMLHeadingElement>(null);
  const controller = useRef<AbortController | null>(null);

  const refresh = useCallback(async () => {
    controller.current?.abort();
    const request = new AbortController();
    controller.current = request;
    setLoading(true);
    try {
      const response = await fetch("/api/msf/daily-briefing", { cache: "no-store", signal: request.signal });
      if (!response.ok) throw new Error("Rewards unavailable");
      const parsed = parseDashboardBriefing(await response.json());
      if (request.signal.aborted) return;
      setData(parsed);
      setError(false);
      setCheckedAt(Date.now());
      setNow(Date.now());
    } catch {
      if (request.signal.aborted) return;
      setError(true);
      setData(null);
      setCheckedAt(null);
    } finally {
      if (!request.signal.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(), 0);
    const clock = window.setInterval(() => setNow(Date.now()), 1_000);
    const resume = () => { if (document.visibilityState === "visible") setNow(Date.now()); };
    document.addEventListener("visibilitychange", resume);
    return () => {
      window.clearTimeout(timer);
      window.clearInterval(clock);
      controller.current?.abort();
      document.removeEventListener("visibilitychange", resume);
    };
  }, [refresh]);

  useEffect(() => {
    if (showRewards) rewardsHeading.current?.focus();
  }, [showRewards]);

  const summary = data ? summarizeDashboardBriefing(data, now) : null;
  const next = summary?.nextExpiry;
  const partial = summary?.partial ?? false;
  const checkedMinutes = checkedAt === null ? null : Math.max(0, Math.floor((now - checkedAt) / 60_000));
  const count = loading ? "…" : !summary || (partial && summary.count === 0) ? "—" : `${summary.count}${partial ? "+" : ""}`;
  const reward = next?.rewards[0];

  return (
    <div className={styles.dashboard} data-testid="resource-dashboard">
      <header className={styles.heading}>
        <h1>Here&apos;s what matters today</h1>
        <p>Collect in time. Spend with a plan.</p>
      </header>

      <section className={`${styles.expiry} ${!next ? styles.neutralExpiry : ""}`} aria-label="Reward briefing" aria-busy={loading} data-testid="daily-briefing-widget">
        <div className={styles.expiryTop}>
          <span className={styles.badge}><DashboardIcon name="clock" />{loading ? "CHECKING REWARDS" : next ? (summary!.endingSoon > 0 ? "ENDING SOON" : "NEXT EXPIRY") : "DAILY REWARDS"}</span>
          {!loading && next?.expiration && <span className={styles.countdown} data-testid="reward-countdown">{expiryLabel(next.expiration, now)}</span>}
        </div>
        <div className={styles.expiryBody}>
          <span className={styles.rewardIcon}><DashboardIcon name="gift" /></span>
          <div className={styles.rewardText}>
            {loading ? <><h2>Looking for opportunities…</h2><p>Your tools are ready below.</p></> : next ? <>
              <p className={styles.offerName}>{next.name}</p>
              <h2>{reward ? `${new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(reward.quantity)} ${reward.itemName}` : "Free offer available"}</h2>
              {next.rewards.length > 1 && <p>+ {next.rewards.length - 1} more reward {next.rewards.length === 2 ? "item" : "items"}</p>}
            </> : <>
              <h2>{error || (partial && !summary?.count) ? "Rewards temporarily unavailable" : summary?.count ? "Rewards to review" : "No opportunities reported"}</h2>
              <p>{error ? "Try refreshing. You can still use your tools." : summary?.count ? "Review available rewards below." : "Check the game for other daily rewards."}</p>
            </>}
          </div>
          {!loading && !!summary?.count && <button className={styles.reviewButton} onClick={() => setShowRewards(true)}>{next ? "Review offer" : "Review rewards"}</button>}
        </div>
        {!loading && next && <p className={styles.claimNote}>Collect in the game or web store.</p>}
        {!loading && partial && <p role="status" className={styles.warning} data-testid="daily-briefing-widget-warning">Some reward sources are unavailable. The count is incomplete.</p>}
        {!loading && error && <p role="status" className={styles.warning} data-testid="daily-briefing-widget-error">Reward data could not be refreshed.</p>}
        <div className={styles.refreshRow}>
          <span><DashboardIcon name="clock" />{loading ? "Checking available sources…" : checkedMinutes === null ? "Not checked" : `${partial ? "Partial check" : "Checked"} ${checkedMinutes === 0 ? "just now" : `${checkedMinutes} min ago`}`}</span>
          <button type="button" onClick={refresh} disabled={loading} aria-label="Refresh rewards" className={styles.refreshButton} data-testid="daily-briefing-widget-retry"><DashboardIcon name="refresh" /></button>
        </div>
      </section>

      <WalletStrip compact />

      <nav className={styles.tiles} aria-label="Resource tools">
        <button className={`${styles.tile} ${styles.collect}`} onClick={() => setShowRewards(!showRewards)} aria-expanded={showRewards} aria-controls="dashboard-rewards" data-testid="dashboard-collect">
          <span className={styles.tileLabel}><DashboardIcon name="gift" /><span>COLLECT</span><span aria-hidden="true">›</span></span>
          <strong className={styles.total}>{count}</strong>
          <span>reward opportunities</span>
          <span className={styles.tileFoot}>{loading ? "Checking sources" : error || partial ? "Some sources unavailable" : summary?.endingSoon ? `${summary.endingSoon} ending soon` : "Review available rewards"}</span>
          <span className={styles.viewAll}>{showRewards ? "Hide rewards ↑" : "View all →"}</span>
        </button>
        <Link href="/planner" className={`${styles.tile} ${styles.plan}`}>
          <span className={styles.tileLabel}><DashboardIcon name="target" /><span>PLAN</span><span aria-hidden="true">›</span></span>
          <strong>Next upgrade</strong><span>Review priorities</span>
        </Link>
        <Link href="/analyze/farming" className={`${styles.tile} ${styles.farm}`}>
          <span className={styles.tileLabel}><DashboardIcon name="route" /><span>FARM</span><span aria-hidden="true">›</span></span>
          <strong>Find sources</strong><span>Gear &amp; character shards</span>
        </Link>
        <Link href="/inventory" className={`${styles.tile} ${styles.check}`}>
          <span className={styles.tileLabel}><DashboardIcon name="inventory" /><span>CHECK</span><span aria-hidden="true">›</span></span>
          <strong>Inventory</strong><span>Materials on hand</span>
        </Link>
      </nav>

      <section id="dashboard-rewards" hidden={!showRewards} className={styles.rewardList}>
        <h2 ref={rewardsHeading} tabIndex={-1}>Available rewards</h2>
        <p>Review in the game or web store to collect. This list covers sources available to the toolkit.</p>
        {loading ? <p role="status">Checking rewards…</p> : <>
          {(error || partial) && <p role="status" className={styles.warning}>Some reward sources are unavailable. Refresh to check again.</p>}
          {summary?.offers.map((offer) => <article key={offer.id} className={styles.rewardItem}>
            <div><h3>{offer.name}</h3><span>{offer.expiration ? expiryLabel(offer.expiration, now) : "Expiry not provided"}</span></div>
            {offer.rewards.length > 0 && <ul>{offer.rewards.map((item, i) => <li key={i}>{item.quantity.toLocaleString()} {item.itemName}</li>)}</ul>}
          </article>)}
          {summary?.milestones.map((milestone) => <article key={milestone.id} className={styles.rewardItem}><h3>{milestone.name}</h3><p>Milestone rewards available to collect.</p></article>)}
          {summary?.count === 0 && !partial && <p>No available rewards reported by these sources.</p>}
        </>}
        <button className={styles.closeButton} onClick={() => { setShowRewards(false); document.querySelector<HTMLButtonElement>('[data-testid="dashboard-collect"]')?.focus(); }}>Close rewards</button>
      </section>

      <Link href="/advisor" className={styles.advisor}>
        <span className={styles.advisorIcon}><DashboardIcon name="chat" /></span>
        <span><strong>Need help choosing?</strong><span>Ask the AI Advisor →</span></span><span aria-hidden="true">›</span>
      </Link>

      <details className={styles.insights} onToggle={(event) => setShowInsights(event.currentTarget.open)}>
        <summary><DashboardIcon name="roster" /><span>Roster &amp; mode insights</span><span className={styles.expandIcon} aria-hidden="true">⌄</span></summary>
        {showInsights && <DashboardInsights displayName={displayName} portrait={portrait} offersEnabled={offersEnabled} />}
      </details>
    </div>
  );
}
