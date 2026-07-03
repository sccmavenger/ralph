"use client";

import { useState } from "react";
import {
  formatWalletNumber,
  isValidWalletValue,
  parseWalletNumber,
} from "@/lib/wallet-format";

export interface SavedWallet {
  gold: number;
  cores: number;
  confirmedAt: string | null;
}

interface WalletInputSheetProps {
  /** Called when the sheet is dismissed WITHOUT saving ("Skip for now" or
   * backdrop). No PUT is sent; no wallet is created. */
  onSkip: () => void;
  /** Called after a successful PUT with the saved balances. The caller closes
   * the sheet and reflects the new values. */
  onSaved: (wallet: SavedWallet) => void;
  /** Optional pre-fill (raw integers) for the edit flow (US-004/US-011). */
  initialGold?: number | null;
  initialCores?: number | null;
}

// Wallet accent colors from the approved mockup.
const GOLD = "#f0c14b";
const CORE = "#5fd0e0";

export default function WalletInputSheet({
  onSkip,
  onSaved,
  initialGold,
  initialCores,
}: WalletInputSheetProps) {
  const [gold, setGold] = useState(
    initialGold != null ? formatWalletNumber(String(initialGold)) : "",
  );
  const [cores, setCores] = useState(
    initialCores != null ? formatWalletNumber(String(initialCores)) : "",
  );
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const canSave =
    !saving && isValidWalletValue(gold) && isValidWalletValue(cores);

  async function handleSave() {
    const goldValue = parseWalletNumber(gold);
    const coresValue = parseWalletNumber(cores);
    // Guard: never send a request unless both fields are valid non-negative
    // integers. This blocks non-numeric/negative input from ever reaching the
    // API (TC-003.3 / TC-003.4).
    if (goldValue === null || coresValue === null) {
      setError("Enter a whole number for both Gold and Power Cores.");
      return;
    }

    setSaving(true);
    setError("");

    try {
      const res = await fetch("/api/msf/wallet", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gold: goldValue, cores: coresValue }),
      });

      if (!res.ok) {
        let message = "Couldn't save your wallet. Please try again.";
        try {
          const data = (await res.json()) as { error?: string };
          if (data?.error) message = data.error;
        } catch {
          // Non-JSON error body — keep the generic message.
        }
        // Surface the error and DO NOT close or report success (TC-003.7).
        setError(message);
        setSaving(false);
        return;
      }

      const data = (await res.json()) as {
        gold: number;
        cores: number;
        confirmedAt: string | null;
      };
      onSaved({
        gold: data.gold,
        cores: data.cores,
        confirmedAt: data.confirmedAt,
      });
    } catch {
      setError("Something went wrong. Please try again.");
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 px-4 pb-6 pt-10 sm:items-center"
      onClick={onSkip}
      role="presentation"
    >
      <div
        className="w-full max-w-sm rounded-2xl bg-[var(--color-surface)] p-6"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Enter your balances"
      >
        <h2 className="mb-1 text-lg font-bold text-[var(--color-foreground)]">
          Enter your balances
        </h2>
        <p className="mb-4 text-sm text-[var(--color-muted)]">
          Takes 10 seconds. Optional — the planner still works without it.
        </p>

        <label className="mb-1.5 flex items-center gap-2 text-xs font-semibold text-[var(--color-muted)]">
          <span
            className="inline-block h-2.5 w-2.5 rounded-full"
            style={{ background: GOLD }}
          />
          Gold
        </label>
        <div className="mb-3 flex items-center gap-2 rounded-lg border border-[var(--color-surface-light)] bg-[var(--color-background)] px-4 py-3 focus-within:border-[var(--color-accent)]">
          <input
            inputMode="numeric"
            aria-label="Gold"
            placeholder="1,840,000"
            value={gold}
            onChange={(e) => {
              setGold(formatWalletNumber(e.target.value));
              if (error) setError("");
            }}
            className="flex-1 bg-transparent text-base font-bold text-[var(--color-foreground)] placeholder-[var(--color-muted)] outline-none"
            autoFocus
          />
          <span className="text-xs text-[var(--color-muted)]">gold</span>
        </div>

        <label className="mb-1.5 flex items-center gap-2 text-xs font-semibold text-[var(--color-muted)]">
          <span
            className="inline-block h-2.5 w-2.5 rounded-full"
            style={{ background: CORE }}
          />
          Power Cores
        </label>
        <div className="mb-3 flex items-center gap-2 rounded-lg border border-[var(--color-surface-light)] bg-[var(--color-background)] px-4 py-3 focus-within:border-[var(--color-accent)]">
          <input
            inputMode="numeric"
            aria-label="Power Cores"
            placeholder="6,120"
            value={cores}
            onChange={(e) => {
              setCores(formatWalletNumber(e.target.value));
              if (error) setError("");
            }}
            className="flex-1 bg-transparent text-base font-bold text-[var(--color-foreground)] placeholder-[var(--color-muted)] outline-none"
          />
          <span className="text-xs text-[var(--color-muted)]">cores</span>
        </div>

        <p className="mb-4 text-xs text-[var(--color-muted)]">
          Find these on your in-game profile header. Gold and Power Cores aren&apos;t
          in the MSF API — we store them privately on your account and mark them
          &ldquo;self-reported.&rdquo;
        </p>

        {error && (
          <p className="mb-3 text-xs text-red-400" role="alert">
            {error}
          </p>
        )}

        <button
          onClick={handleSave}
          disabled={!canSave}
          className="w-full rounded-lg bg-[var(--color-accent)] px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-blue-600 active:bg-blue-700 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save wallet"}
        </button>

        <button
          onClick={onSkip}
          disabled={saving}
          className="mt-3 w-full text-center text-sm text-[var(--color-muted)] transition-colors hover:text-[var(--color-foreground)] disabled:opacity-50"
        >
          Skip for now
        </button>
      </div>
    </div>
  );
}
