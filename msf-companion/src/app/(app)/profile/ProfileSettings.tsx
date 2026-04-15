"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function formatNumber(n: number): string {
  return n.toLocaleString();
}

export default function ProfileSettings({
  displayName,
  portrait,
  level,
  tcp,
  allianceName,
  email: initialEmail,
  rosterSnapshotCount,
  inventorySnapshotCount,
  subscriptionTier,
  cancelAtPeriodEnd,
  currentPeriodEnd,
}: {
  displayName: string;
  portrait?: string | null;
  level: number | null;
  tcp: number | null;
  allianceName: string | null;
  email: string | null;
  rosterSnapshotCount: number;
  inventorySnapshotCount: number;
  subscriptionTier: string;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: string | null;
}) {
  const [email, setEmail] = useState(initialEmail ?? "");
  const [savedEmail, setSavedEmail] = useState(initialEmail);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [subCancelAtPeriodEnd, setSubCancelAtPeriodEnd] = useState(cancelAtPeriodEnd);
  const [subCurrentPeriodEnd, setSubCurrentPeriodEnd] = useState(currentPeriodEnd);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [cancellingSubscription, setCancellingSubscription] = useState(false);
  const [reactivating, setReactivating] = useState(false);
  const [snapshotCounts, setSnapshotCounts] = useState({
    roster: rosterSnapshotCount,
    inventory: inventorySnapshotCount,
  });
  const router = useRouter();

  async function handleSaveEmail() {
    const trimmed = email.trim();
    if (!trimmed || !EMAIL_REGEX.test(trimmed)) {
      setError("Please enter a valid email address");
      return;
    }

    setSaving(true);
    setError("");

    try {
      const res = await fetch("/api/commander/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmed }),
      });

      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        setError(data.error || "Failed to save");
        setSaving(false);
        return;
      }

      setSavedEmail(trimmed);
      setEditing(false);
    } catch {
      setError("Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="px-4 py-4">
      {/* Commander header */}
      <div className="mb-4 flex items-center gap-3 rounded-xl bg-[var(--color-surface)] p-4">
        {portrait ? (
          <img
            src={portrait}
            alt={displayName}
            className="h-12 w-12 rounded-full object-cover"
          />
        ) : (
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-yellow-500 to-red-500 text-lg font-bold text-white">
            {displayName[0].toUpperCase()}
          </div>
        )}
        <div className="flex-1">
          <h2 className="text-base font-bold text-[var(--color-foreground)]">
            {displayName}
          </h2>
          <div className="flex gap-3 text-xs text-[var(--color-muted)]">
            {level !== null && <span>Level {level}</span>}
            {tcp !== null && <span>TCP {formatNumber(tcp)}</span>}
          </div>
          {allianceName && (
            <p className="text-xs text-[var(--color-muted)]">
              Alliance: {allianceName}
            </p>
          )}
        </div>
      </div>

      {/* Email Section */}
      <div className="mb-4 rounded-xl bg-[var(--color-surface)] p-4">
        <h3 className="mb-3 text-sm font-bold text-[var(--color-foreground)]">
          Email Address
        </h3>

        {savedEmail && !editing ? (
          <div className="flex items-center justify-between">
            <span className="text-sm text-[var(--color-foreground)]">
              {savedEmail}
            </span>
            <button
              onClick={() => {
                setEditing(true);
                setEmail(savedEmail);
              }}
              className="text-sm font-medium text-[var(--color-accent)]"
            >
              Update
            </button>
          </div>
        ) : (
          <div>
            {!savedEmail && !editing && (
              <p className="mb-3 text-sm text-[var(--color-muted)]">
                Add your email for community updates and announcements.
              </p>
            )}
            <input
              type="email"
              placeholder="commander@example.com"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (error) setError("");
              }}
              onFocus={() => {
                if (!editing) setEditing(true);
              }}
              className="mb-2 w-full rounded-lg border border-[var(--color-surface-light)] bg-[var(--color-background)] px-4 py-3 text-sm text-[var(--color-foreground)] placeholder-[var(--color-muted)] outline-none focus:border-[var(--color-accent)]"
            />
            {error && <p className="mb-2 text-xs text-red-400">{error}</p>}
            {editing && (
              <div className="flex gap-2">
                <button
                  onClick={handleSaveEmail}
                  disabled={saving}
                  className="flex-1 rounded-lg bg-[var(--color-accent)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {saving ? "Saving..." : "Save"}
                </button>
                <button
                  onClick={() => {
                    setEditing(false);
                    setEmail(savedEmail ?? "");
                    setError("");
                  }}
                  className="rounded-lg px-4 py-2 text-sm text-[var(--color-muted)]"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Subscription Status */}
      <div className="mb-4 rounded-xl bg-[var(--color-surface)] p-4">
        <h3 className="mb-3 text-sm font-bold text-[var(--color-foreground)]">
          Subscription
        </h3>
        {subscriptionTier === "PREMIUM" ? (
          <div>
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-[var(--color-accent)]/20 px-3 py-1 text-xs font-semibold text-[var(--color-accent)]">
                Premium Member
              </span>
            </div>
            {subCancelAtPeriodEnd && subCurrentPeriodEnd ? (
              <>
                <p className="mt-2 text-xs text-yellow-400">
                  Premium until{" "}
                  {new Date(subCurrentPeriodEnd).toLocaleDateString("en-US", {
                    month: "long",
                    day: "numeric",
                    year: "numeric",
                  })}
                </p>
                <button
                  onClick={async () => {
                    setReactivating(true);
                    try {
                      const res = await fetch("/api/stripe/reactivate-subscription", {
                        method: "POST",
                      });
                      if (res.ok) {
                        setSubCancelAtPeriodEnd(false);
                      }
                    } catch {
                      // Non-critical
                    } finally {
                      setReactivating(false);
                    }
                  }}
                  disabled={reactivating}
                  className="mt-3 rounded-lg bg-[var(--color-accent)] px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
                >
                  {reactivating ? "Reactivating..." : "Reactivate Subscription"}
                </button>
              </>
            ) : (
              <>
                {showCancelConfirm ? (
                  <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 p-3">
                    <p className="mb-2 text-xs text-red-400">
                      Are you sure you want to cancel? You&apos;ll keep Premium
                      access until{" "}
                      {subCurrentPeriodEnd
                        ? new Date(subCurrentPeriodEnd).toLocaleDateString(
                            "en-US",
                            { month: "long", day: "numeric", year: "numeric" }
                          )
                        : "the end of your billing period"}
                      .
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={async () => {
                          setCancellingSubscription(true);
                          try {
                            const res = await fetch(
                              "/api/stripe/cancel-subscription",
                              { method: "POST" }
                            );
                            if (res.ok) {
                              const data = (await res.json()) as {
                                cancelAtPeriodEnd: boolean;
                                currentPeriodEnd: string | null;
                              };
                              setSubCancelAtPeriodEnd(data.cancelAtPeriodEnd);
                              if (data.currentPeriodEnd) {
                                setSubCurrentPeriodEnd(data.currentPeriodEnd);
                              }
                              setShowCancelConfirm(false);
                            }
                          } catch {
                            // Non-critical
                          } finally {
                            setCancellingSubscription(false);
                          }
                        }}
                        disabled={cancellingSubscription}
                        className="flex-1 rounded-lg bg-red-500 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                      >
                        {cancellingSubscription
                          ? "Cancelling..."
                          : "Confirm Cancel"}
                      </button>
                      <button
                        onClick={() => setShowCancelConfirm(false)}
                        className="rounded-lg px-3 py-1.5 text-xs text-[var(--color-muted)]"
                      >
                        Keep Subscription
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowCancelConfirm(true)}
                    className="mt-3 text-xs font-medium text-red-400"
                  >
                    Cancel Subscription
                  </button>
                )}
              </>
            )}
          </div>
        ) : (
          <div>
            <span className="rounded-full bg-[var(--color-surface-light)] px-3 py-1 text-xs font-semibold text-[var(--color-muted)]">
              Free
            </span>
            <a
              href="/subscribe"
              className="mt-3 block text-xs font-medium text-[var(--color-accent)]"
            >
              Upgrade to Premium →
            </a>
          </div>
        )}
      </div>

      {/* Snapshots Section */}
      <div className="mb-4 rounded-xl bg-[var(--color-surface)] p-4">
        <h3 className="mb-3 text-sm font-bold text-[var(--color-foreground)]">
          Progress Snapshots
        </h3>
        <p className="mb-3 text-xs text-[var(--color-muted)]">
          A snapshot of your roster and resources is saved each time you log in,
          so you can track your progress over time.
        </p>

        <div className="mb-3 flex gap-4">
          <div className="flex flex-col items-center rounded-lg bg-[var(--color-background)] px-4 py-2">
            <span className="text-lg font-bold text-[var(--color-foreground)]">
              {snapshotCounts.roster}
            </span>
            <span className="text-[10px] text-[var(--color-muted)]">
              Roster
            </span>
          </div>
          <div className="flex flex-col items-center rounded-lg bg-[var(--color-background)] px-4 py-2">
            <span className="text-lg font-bold text-[var(--color-foreground)]">
              {snapshotCounts.inventory}
            </span>
            <span className="text-[10px] text-[var(--color-muted)]">
              Resources
            </span>
          </div>
        </div>
      </div>

      {/* FAQ Link */}
      <a
        href="/faq"
        className="mb-4 block w-full rounded-xl bg-[var(--color-surface)] px-4 py-4 text-center text-sm font-medium text-[var(--color-accent)]"
      >
        FAQ — Security, Data &amp; More
      </a>

      {/* Logout */}
      <button
        onClick={async () => {
          setLoggingOut(true);
          try {
            await fetch("/api/auth/logout", { method: "POST" });
          } catch {
            // Ignore
          }
          router.push("/");
        }}
        disabled={loggingOut}
        className="w-full rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm font-semibold text-red-400 transition-colors hover:bg-red-500/20 disabled:opacity-50"
      >
        {loggingOut ? "Logging out..." : "Log Out"}
      </button>
    </div>
  );
}
