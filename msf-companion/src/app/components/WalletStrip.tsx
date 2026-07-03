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
export default function WalletStrip() {
  const [wallet, setWallet] = useState<WalletState | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  // Session-only dismissal of the staleness nudge (US-011 / TC-011.4). Never
  // persisted and never touches the wallet values.
  const [nudgeDismissed, setNudgeDismissed] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/msf/wallet");
      if (res.ok) {
        const data = (await res.json()) as WalletState;
        setWallet(data);
      }
    } catch {
      // Non-blocking: the strip simply won't render if the wallet can't load.
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
  if (!loaded) return null;

  const hasWallet = wallet?.exists === true;
  // Show the subtle "confirm your gold?" nudge only when a wallet exists, its
  // confirmedAt is older than the 7-day threshold, and it hasn't been dismissed
  // this session (US-011 / TC-011.1..4).
  const showNudge =
    hasWallet && !nudgeDismissed && isWalletStale(wallet?.confirmedAt);

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
