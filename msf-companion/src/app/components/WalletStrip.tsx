"use client";

import { useState, useEffect, useCallback } from "react";
import WalletInputSheet, { type SavedWallet } from "./WalletInputSheet";
import {
  formatWalletCompact,
  formatConfirmedAgo,
  isWalletStale,
} from "@/lib/wallet-format";

// Wallet accent colors from the approved mockup.
const GOLD = "#f0c14b";
const CORE = "#5fd0e0";

interface WalletState {
  exists: boolean;
  gold: number;
  cores: number;
  confirmedAt: string | null;
}

/**
 * "Your Wallet" strip shown above the planner event cards (US-004).
 *
 * - Loads the account wallet from GET /api/msf/wallet on mount.
 * - When a wallet exists, shows Gold + Cores (formatted) with a "self-reported"
 *   label and a "confirmed Nd ago" age, plus a per-balance "edit" affordance
 *   that opens the reusable US-003 input sheet pre-filled.
 * - When no wallet exists, shows an "Add your wallet" first-run prompt (never
 *   zeros) that opens the same sheet.
 * - Saving updates the strip in place (no page reload).
 */
export default function WalletStrip({ compact = false }: { compact?: boolean }) {
  const [wallet, setWallet] = useState<WalletState | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  // Session-only dismissal of the staleness nudge (US-011 / TC-011.4). Never
  // persisted and never touches the wallet values.
  const [nudgeDismissed, setNudgeDismissed] = useState(false);

  const load = useCallback(async () => {
    setLoaded(false);
    setLoadError(false);
    try {
      const res = await fetch("/api/msf/wallet");
      if (!res.ok) throw new Error("Wallet unavailable");
      const data = (await res.json()) as WalletState;
      if (typeof data.exists !== "boolean" || (data.exists && (![data.gold, data.cores].every((v) => Number.isInteger(v) && v >= 0)))) throw new Error("Invalid wallet");
      setWallet(data);
    } catch {
      setLoadError(true);
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleSaved = (saved: SavedWallet) => {
    setWallet({
      exists: true,
      gold: saved.gold,
      cores: saved.cores,
      confirmedAt: saved.confirmedAt,
    });
    setSheetOpen(false);
    // Saving refreshes confirmedAt to now, which clears staleness. Reset the
    // session dismissal so a future re-staleness can nudge again (TC-011.3).
    setNudgeDismissed(false);
  };

  // Don't flash any UI until the wallet state is known.
  if (!loaded) return compact ? <div className="rounded-2xl border border-slate-700 bg-slate-800/70 p-4 text-sm text-slate-300" role="status">Loading your wallet…</div> : null;

  if (loadError) return <section className="rounded-2xl border border-slate-700 bg-slate-800/70 p-4" data-testid="wallet-load-error" role="status">
    <p className="text-sm font-semibold">Wallet temporarily unavailable</p>
    <button type="button" onClick={load} className="min-h-11 text-sm font-semibold text-blue-300">Try again</button>
  </section>;

  const hasWallet = wallet?.exists === true;
  // Show the subtle "confirm your gold?" nudge only when a wallet exists, its
  // confirmedAt is older than the 7-day threshold, and it hasn't been dismissed
  // this session (US-011 / TC-011.1..4).
  const showNudge =
    hasWallet && !nudgeDismissed && isWalletStale(wallet?.confirmedAt);

  if (compact) return <>
    <section className="rounded-2xl border border-slate-700 bg-gradient-to-br from-slate-800 to-slate-900 px-3 py-3" data-testid="wallet-strip" aria-label="Your wallet">
      {hasWallet ? <>
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-center gap-2">
          <div className="min-w-0"><p className="text-xs text-slate-400">Gold</p><p className="mt-1 text-xl font-extrabold tracking-tight text-amber-300" data-testid="wallet-value-gold">{formatWalletCompact(wallet.gold)}</p>{wallet.confirmedAt && <p className="text-[11px] text-slate-400">{formatConfirmedAgo(wallet.confirmedAt)}</p>}</div>
          <div className="min-w-0 border-l border-slate-600/60 pl-3"><p className="text-xs text-slate-400">Cores</p><p className="mt-1 text-xl font-extrabold tracking-tight text-purple-300" data-testid="wallet-value-cores">{formatWalletCompact(wallet.cores)}</p></div>
          <div className="border-l border-slate-600/60 pl-3"><p className="text-[11px] text-slate-400" data-testid="wallet-self-reported">Self-reported</p><button type="button" className="min-h-11 text-sm font-semibold text-blue-300" onClick={() => setSheetOpen(true)} data-testid="wallet-update">Update</button></div>
        </div>
        {showNudge && <button type="button" onClick={() => setSheetOpen(true)} className="mt-1 min-h-11 text-left text-xs font-medium text-amber-300" data-testid="wallet-stale-nudge">Balances may be out of date. Confirm your wallet →</button>}
      </> : <button type="button" onClick={() => setSheetOpen(true)} className="min-h-14 w-full text-left" data-testid="wallet-add-prompt"><strong className="block text-sm">Add your wallet →</strong><span className="mt-1 block text-xs text-slate-400">Enter your Gold &amp; Cores. Balances are self-reported.</span></button>}
    </section>
    {sheetOpen && <WalletInputSheet initialGold={hasWallet ? wallet?.gold : null} initialCores={hasWallet ? wallet?.cores : null} onSkip={() => setSheetOpen(false)} onSaved={handleSaved} />}
  </>;

  return (
    <>
      {hasWallet ? (
        <section
          className="mb-4 rounded-xl border border-purple-500/40 bg-gradient-to-b from-purple-500/10 to-purple-500/[0.03] p-4"
          data-testid="wallet-strip"
        >
          <div className="mb-3 flex items-center justify-between">
            <span className="text-xs font-bold tracking-wide text-[var(--color-foreground)]">
              YOUR WALLET
            </span>
            <span
              className="rounded-full border border-purple-500/50 px-2 py-0.5 text-[9px] font-extrabold text-purple-300"
              data-testid="wallet-self-reported"
            >
              self-reported
            </span>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <WalletBalance
              label="Gold"
              dotColor={GOLD}
              valueColor={GOLD}
              value={formatWalletCompact(wallet.gold)}
              confirmedAt={wallet.confirmedAt}
              onEdit={() => setSheetOpen(true)}
            />
            <WalletBalance
              label="Cores"
              dotColor={CORE}
              valueColor={CORE}
              value={formatWalletCompact(wallet.cores)}
              confirmedAt={wallet.confirmedAt}
              onEdit={() => setSheetOpen(true)}
            />
          </div>
          {showNudge && (
            <div
              className="mt-3 flex items-center justify-between gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2"
              data-testid="wallet-stale-nudge"
              role="status"
            >
              <button
                type="button"
                onClick={() => setSheetOpen(true)}
                className="flex flex-1 items-center gap-2 text-left text-[11px] font-semibold text-amber-300"
                data-testid="wallet-nudge-confirm"
              >
                <span aria-hidden>🔔</span>
                <span>Been a while — confirm your gold?</span>
              </button>
              <button
                type="button"
                onClick={() => setNudgeDismissed(true)}
                className="shrink-0 rounded p-0.5 text-sm leading-none text-[var(--color-muted)] transition-colors hover:text-[var(--color-foreground)]"
                aria-label="Dismiss reminder"
                data-testid="wallet-nudge-dismiss"
              >
                ✕
              </button>
            </div>
          )}
        </section>
      ) : (
        <section
          className="mb-4 rounded-xl border border-purple-500/40 bg-gradient-to-b from-purple-500/10 to-purple-500/[0.03] p-4"
          data-testid="wallet-strip"
        >
          <button
            type="button"
            onClick={() => setSheetOpen(true)}
            className="flex w-full items-center justify-between text-left"
            data-testid="wallet-add-prompt"
          >
            <span className="flex items-center gap-2">
              <span aria-hidden>💰</span>
              <span className="text-sm font-bold text-[var(--color-foreground)]">
                Add your wallet
              </span>
            </span>
            <span className="text-xs font-semibold text-purple-300">
              Gold &amp; Cores →
            </span>
          </button>
          <p className="mt-1 text-[11px] text-[var(--color-muted)]">
            Enter your Gold and Power Cores to see affordability on the planner.
          </p>
        </section>
      )}

      {sheetOpen && (
        <WalletInputSheet
          initialGold={hasWallet ? wallet?.gold : null}
          initialCores={hasWallet ? wallet?.cores : null}
          onSkip={() => setSheetOpen(false)}
          onSaved={handleSaved}
        />
      )}
    </>
  );
}

function WalletBalance({
  label,
  dotColor,
  valueColor,
  value,
  confirmedAt,
  onEdit,
}: {
  label: string;
  dotColor: string;
  valueColor: string;
  value: string;
  confirmedAt: string | null;
  onEdit: () => void;
}) {
  return (
    <div className="rounded-lg bg-[var(--color-surface)]/40 p-1">
      <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold text-[var(--color-muted)]">
        <span
          className="inline-block h-2 w-2 rounded-full"
          style={{ background: dotColor }}
        />
        {label}
        <button
          type="button"
          onClick={onEdit}
          className="ml-1 text-[10px] font-semibold text-[var(--color-accent)] underline underline-offset-2 hover:text-blue-400"
          aria-label={`Edit ${label}`}
          data-testid={`wallet-edit-${label.toLowerCase()}`}
        >
          edit
        </button>
      </div>
      <div
        className="text-lg font-bold"
        style={{ color: valueColor }}
        data-testid={`wallet-value-${label.toLowerCase()}`}
      >
        {value}
      </div>
      {confirmedAt && (
        <div className="mt-0.5 text-[10px] text-[var(--color-muted)]">
          {formatConfirmedAgo(confirmedAt)}
        </div>
      )}
    </div>
  );
}
