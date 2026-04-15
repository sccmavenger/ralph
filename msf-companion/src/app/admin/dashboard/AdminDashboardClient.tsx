"use client";

import { useState, useMemo, useCallback, useEffect, useRef, FormEvent } from "react";
import { useRouter } from "next/navigation";

interface Commander {
  id: string;
  displayName: string | null;
  scopelyId: string;
  email: string | null;
  subscriptionTier: string;
  lastLoginAt: string | null;
  disabled: boolean;
}

function formatRelativeTime(isoString: string | null): string {
  if (!isoString) return "Never";
  const date = new Date(isoString);
  const now = Date.now();
  const diffMs = now - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) return "Just now";
  if (diffMin < 60) return `${diffMin} minute${diffMin !== 1 ? "s" : ""} ago`;
  if (diffHour < 24) return `${diffHour} hour${diffHour !== 1 ? "s" : ""} ago`;
  if (diffDay < 30) return `${diffDay} day${diffDay !== 1 ? "s" : ""} ago`;
  const diffMonth = Math.floor(diffDay / 30);
  if (diffMonth < 12) return `${diffMonth} month${diffMonth !== 1 ? "s" : ""} ago`;
  const diffYear = Math.floor(diffDay / 365);
  return `${diffYear} year${diffYear !== 1 ? "s" : ""} ago`;
}

export default function AdminDashboardClient({
  commanders: initialCommanders,
}: {
  commanders: Commander[];
}) {
  const [search, setSearch] = useState("");
  const [commanders, setCommanders] = useState(initialCommanders);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<string>("all");
  const [showNotifyForm, setShowNotifyForm] = useState(false);
  const [notifyTitle, setNotifyTitle] = useState("");
  const [notifyMessage, setNotifyMessage] = useState("");
  const [notifyLink, setNotifyLink] = useState("");
  const [notifyTarget, setNotifyTarget] = useState("all");
  const [notifySending, setNotifySending] = useState(false);
  const [notifyResult, setNotifyResult] = useState<string | null>(null);
  const [featureFlags, setFeatureFlags] = useState<{ key: string; enabled: boolean }[]>([]);
  const [flagLoading, setFlagLoading] = useState<string | null>(null);
  const flagsFetched = useRef(false);
  const router = useRouter();

  useEffect(() => {
    if (flagsFetched.current) return;
    flagsFetched.current = true;
    async function loadFlags() {
      try {
        const res = await fetch("/api/admin/feature-flags");
        if (res.ok) {
          const data = (await res.json()) as { flags: { key: string; enabled: boolean }[] };
          setFeatureFlags(data.flags);
        }
      } catch { /* ignore */ }
    }
    loadFlags();
  }, []);

  const filtered = useMemo(() => {
    let result = commanders;

    // Apply filter chip
    if (activeFilter === "premium") {
      result = result.filter((c) => c.subscriptionTier === "PREMIUM");
    } else if (activeFilter === "free") {
      result = result.filter((c) => c.subscriptionTier === "FREE");
    } else if (activeFilter === "disabled") {
      result = result.filter((c) => c.disabled);
    } else if (activeFilter === "today") {
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      result = result.filter(
        (c) => c.lastLoginAt && new Date(c.lastLoginAt) >= startOfDay
      );
    } else if (activeFilter === "week") {
      const startOfWeek = new Date();
      startOfWeek.setDate(startOfWeek.getDate() - 7);
      startOfWeek.setHours(0, 0, 0, 0);
      result = result.filter(
        (c) => c.lastLoginAt && new Date(c.lastLoginAt) >= startOfWeek
      );
    }

    // Apply search
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      result = result.filter(
        (c) =>
          (c.displayName && c.displayName.toLowerCase().includes(q)) ||
          c.scopelyId.toLowerCase().includes(q) ||
          (c.email && c.email.toLowerCase().includes(q))
      );
    }

    return result;
  }, [commanders, search, activeFilter]);

  const handleLogout = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      await fetch("/api/admin/logout", { method: "POST" });
      router.push("/admin");
    },
    [router]
  );

  const handleToggleDisable = useCallback(
    async (commander: Commander) => {
      const action = commander.disabled ? "enable" : "disable";
      if (action === "disable") {
        const confirmed = window.confirm(
          "Are you sure? This will disable the account and cancel any active Stripe subscription."
        );
        if (!confirmed) return;
      }

      setActionLoading(commander.id);
      try {
        const res = await fetch(`/api/admin/commanders/${commander.id}/${action}`, {
          method: "POST",
        });
        if (res.ok) {
          const data = await res.json();
          setCommanders((prev) =>
            prev.map((c) =>
              c.id === commander.id
                ? {
                    ...c,
                    disabled: data.disabled,
                    ...(data.subscriptionTier !== undefined
                      ? { subscriptionTier: data.subscriptionTier }
                      : {}),
                  }
                : c
            )
          );
        }
      } finally {
        setActionLoading(null);
      }
    },
    []
  );

  const handleDelete = useCallback(
    async (commander: Commander) => {
      const confirmed = window.confirm(
        `This will permanently delete ${commander.displayName || commander.scopelyId} and all their data. This cannot be undone.`
      );
      if (!confirmed) return;

      setActionLoading(`delete-${commander.id}`);
      try {
        const res = await fetch(`/api/admin/commanders/${commander.id}`, {
          method: "DELETE",
        });
        if (res.ok) {
          setCommanders((prev) => prev.filter((c) => c.id !== commander.id));
        }
      } finally {
        setActionLoading(null);
      }
    },
    []
  );

  const handleToggleTier = useCallback(
    async (commander: Commander) => {
      const newTier = commander.subscriptionTier === "PREMIUM" ? "FREE" : "PREMIUM";
      if (newTier === "FREE") {
        const confirmed = window.confirm(
          "This will immediately remove premium access. Continue?"
        );
        if (!confirmed) return;
      }

      setActionLoading(`tier-${commander.id}`);
      try {
        const res = await fetch(`/api/admin/commanders/${commander.id}/set-tier`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tier: newTier }),
        });
        if (res.ok) {
          const data = await res.json();
          setCommanders((prev) =>
            prev.map((c) =>
              c.id === commander.id
                ? { ...c, subscriptionTier: data.subscriptionTier }
                : c
            )
          );
        }
      } finally {
        setActionLoading(null);
      }
    },
    []
  );

  const handleSendNotification = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      if (!notifyTitle.trim() || !notifyMessage.trim()) return;
      setNotifySending(true);
      setNotifyResult(null);
      try {
        const res = await fetch("/api/admin/notifications", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "announcement",
            title: notifyTitle.trim(),
            message: notifyMessage.trim(),
            linkUrl: notifyLink.trim() || undefined,
            target: notifyTarget,
          }),
        });
        if (res.ok) {
          const data = await res.json();
          setNotifyResult(`Sent to ${data.sent} commander${data.sent !== 1 ? "s" : ""}`);
          setNotifyTitle("");
          setNotifyMessage("");
          setNotifyLink("");
        } else {
          setNotifyResult("Failed to send");
        }
      } catch {
        setNotifyResult("Error sending notification");
      } finally {
        setNotifySending(false);
      }
    },
    [notifyTitle, notifyMessage, notifyLink, notifyTarget]
  );

  const handleToggleFlag = useCallback(async (key: string, enabled: boolean) => {
    setFlagLoading(key);
    try {
      const res = await fetch("/api/admin/feature-flags", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, enabled }),
      });
      if (res.ok) {
        setFeatureFlags((prev) =>
          prev.map((f) => (f.key === key ? { ...f, enabled } : f))
        );
      }
    } catch { /* ignore */ } finally {
      setFlagLoading(null);
    }
  }, []);

  return (
    <div className="min-h-screen bg-[var(--color-background)] text-[var(--color-foreground)]">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-[var(--color-surface-light)] bg-[var(--color-surface)]">
        <div className="flex items-center justify-between px-4 py-3">
          <h1 className="text-lg font-bold">Admin Panel</h1>
          <form onSubmit={handleLogout}>
            <button
              type="submit"
              className="rounded-lg border border-[var(--color-surface-light)] px-3 py-1.5 text-sm text-[var(--color-muted)] transition-colors hover:border-red-500 hover:text-red-400"
            >
              Log Out
            </button>
          </form>
        </div>
        <nav className="flex px-4 gap-1">
          <span
            className="px-3 py-2 text-sm font-medium border-b-2 border-[var(--color-accent)] text-[var(--color-accent)]"
          >
            Commanders
          </span>
          <a
            href="/admin/ai-dashboard"
            className="px-3 py-2 text-sm font-medium border-b-2 border-transparent text-[var(--color-muted)] hover:text-[var(--color-foreground)] transition-colors"
          >
            AI Dashboard
          </a>
        </nav>
      </header>

      <div className="mx-auto max-w-2xl px-4 py-4">
        {/* Send Notification */}
        <button
          type="button"
          onClick={() => { setShowNotifyForm(!showNotifyForm); setNotifyResult(null); }}
          className="mb-4 flex w-full items-center justify-between rounded-xl border border-[var(--color-surface-light)] bg-[var(--color-surface)] px-4 py-3 text-sm font-medium text-[var(--color-foreground)] transition-colors hover:border-[var(--color-accent)]"
        >
          <span>📢 Send Notification</span>
          <svg
            className={`h-4 w-4 text-[var(--color-muted)] transition-transform ${showNotifyForm ? "rotate-180" : ""}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {showNotifyForm && (
          <form
            onSubmit={handleSendNotification}
            className="mb-4 space-y-3 rounded-xl border border-[var(--color-surface-light)] bg-[var(--color-surface)] p-4"
          >
            <div>
              <label className="mb-1 block text-xs text-[var(--color-muted)]">Target</label>
              <select
                value={notifyTarget}
                onChange={(e) => setNotifyTarget(e.target.value)}
                className="w-full rounded-lg border border-[var(--color-surface-light)] bg-[var(--color-background)] px-3 py-2 text-sm text-[var(--color-foreground)]"
              >
                <option value="all">All Commanders</option>
                {commanders.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.displayName || c.scopelyId}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-[var(--color-muted)]">Title</label>
              <input
                type="text"
                value={notifyTitle}
                onChange={(e) => setNotifyTitle(e.target.value)}
                placeholder="Notification title"
                className="w-full rounded-lg border border-[var(--color-surface-light)] bg-[var(--color-background)] px-3 py-2 text-sm text-[var(--color-foreground)] placeholder-[var(--color-muted)]"
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-[var(--color-muted)]">Message</label>
              <textarea
                value={notifyMessage}
                onChange={(e) => setNotifyMessage(e.target.value)}
                placeholder="Notification message"
                rows={3}
                className="w-full rounded-lg border border-[var(--color-surface-light)] bg-[var(--color-background)] px-3 py-2 text-sm text-[var(--color-foreground)] placeholder-[var(--color-muted)] resize-none"
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-[var(--color-muted)]">Link URL (optional)</label>
              <input
                type="url"
                value={notifyLink}
                onChange={(e) => setNotifyLink(e.target.value)}
                placeholder="https://..."
                className="w-full rounded-lg border border-[var(--color-surface-light)] bg-[var(--color-background)] px-3 py-2 text-sm text-[var(--color-foreground)] placeholder-[var(--color-muted)]"
              />
            </div>
            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={notifySending || !notifyTitle.trim() || !notifyMessage.trim()}
                className="rounded-lg bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--color-accent-hover)] disabled:opacity-50"
              >
                {notifySending ? "Sending…" : "Send"}
              </button>
              {notifyResult && (
                <span className="text-xs text-green-400">{notifyResult}</span>
              )}
            </div>
          </form>
        )}

        {/* Feature Flags */}
        <div className="mb-4 rounded-xl border border-[var(--color-surface-light)] bg-[var(--color-surface)] p-4">
          <h3 className="mb-3 text-sm font-bold text-[var(--color-foreground)]">Feature Flags</h3>
          {featureFlags.length === 0 ? (
            <p className="text-xs text-[var(--color-muted)]">No feature flags configured</p>
          ) : (
            <div className="space-y-2">
              {featureFlags.map((flag) => (
                <div key={flag.key} className="flex items-center justify-between">
                  <span className="text-sm text-[var(--color-foreground)]">
                    {flag.key === "meta_hash_caching" ? "Meta Hash Caching" : flag.key === "active_offers" ? "Active Offers" : flag.key}
                  </span>
                  <button
                    type="button"
                    disabled={flagLoading === flag.key}
                    onClick={() => handleToggleFlag(flag.key, !flag.enabled)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      flag.enabled ? "bg-green-500" : "bg-[var(--color-surface-light)]"
                    } ${flagLoading === flag.key ? "opacity-50" : ""}`}
                    data-testid={`flag-toggle-${flag.key}`}
                  >
                    <span
                      className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${
                        flag.enabled ? "translate-x-6" : "translate-x-1"
                      }`}
                    />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Commander count */}
        <p className="mb-3 text-sm text-[var(--color-muted)]">
          {filtered.length === commanders.length
            ? `${commanders.length} Commander${commanders.length !== 1 ? "s" : ""}`
            : `${filtered.length} of ${commanders.length} Commander${commanders.length !== 1 ? "s" : ""}`}
        </p>

        {/* Search */}
        <input
          type="text"
          placeholder="Search by name, email, or Scopely ID…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="mb-3 w-full rounded-lg border border-[var(--color-surface-light)] bg-[var(--color-surface)] px-4 py-2.5 text-sm text-[var(--color-foreground)] placeholder-[var(--color-muted)] outline-none focus:border-[var(--color-accent)] focus:ring-1 focus:ring-[var(--color-accent)]"
          data-testid="admin-search"
        />

        {/* Filter Chips */}
        <div className="mb-4 flex flex-wrap gap-2">
          {[
            { key: "all", label: "All" },
            { key: "premium", label: "Premium" },
            { key: "free", label: "Free" },
            { key: "disabled", label: "Disabled" },
            { key: "today", label: "Today" },
            { key: "week", label: "This Week" },
          ].map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setActiveFilter(f.key)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                activeFilter === f.key
                  ? "bg-[var(--color-accent)] text-white"
                  : "border border-[var(--color-surface-light)] text-[var(--color-muted)] hover:border-[var(--color-accent)] hover:text-[var(--color-foreground)]"
              }`}
              data-testid={`admin-filter-${f.key}`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Commander Cards */}
        <div className="space-y-2" data-testid="admin-commander-table">
          {filtered.length === 0 ? (
            <div className="rounded-xl bg-[var(--color-surface)] px-4 py-8 text-center text-sm text-[var(--color-muted)]">
              No commanders found
            </div>
          ) : (
            filtered.map((c) => {
              const isExpanded = expandedId === c.id;
              return (
                <div
                  key={c.id}
                  className="rounded-xl border border-[var(--color-surface-light)] bg-[var(--color-surface)] transition-colors"
                  data-testid={`admin-commander-row-${c.id}`}
                >
                  {/* Card header — always visible */}
                  <button
                    type="button"
                    onClick={() => setExpandedId(isExpanded ? null : c.id)}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left"
                  >
                    {/* Name + badges */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-semibold">
                          {c.displayName || "Unknown"}
                        </span>
                        <span
                          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                            c.subscriptionTier === "PREMIUM"
                              ? "bg-amber-500/20 text-amber-400"
                              : "bg-slate-500/20 text-slate-400"
                          }`}
                          data-testid={`admin-tier-badge-${c.id}`}
                        >
                          {c.subscriptionTier}
                        </span>
                        <span
                          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                            c.disabled
                              ? "bg-red-500/20 text-red-400"
                              : "bg-green-500/20 text-green-400"
                          }`}
                          data-testid={`admin-status-badge-${c.id}`}
                        >
                          {c.disabled ? "Disabled" : "Active"}
                        </span>
                      </div>
                      <p className="mt-0.5 truncate text-xs text-[var(--color-muted)]">
                        {formatRelativeTime(c.lastLoginAt)}
                        {c.email ? ` · ${c.email}` : ""}
                      </p>
                    </div>
                    {/* Chevron */}
                    <svg
                      className={`h-4 w-4 shrink-0 text-[var(--color-muted)] transition-transform ${isExpanded ? "rotate-180" : ""}`}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>

                  {/* Expanded detail */}
                  {isExpanded && (
                    <div className="border-t border-[var(--color-surface-light)] px-4 pb-4 pt-3">
                      {/* Detail rows */}
                      <dl className="mb-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-xs">
                        <dt className="text-[var(--color-muted)]">Scopely ID</dt>
                        <dd className="truncate font-mono">{c.scopelyId}</dd>
                        <dt className="text-[var(--color-muted)]">Email</dt>
                        <dd className="truncate">{c.email || "—"}</dd>
                        <dt className="text-[var(--color-muted)]">Tier</dt>
                        <dd>{c.subscriptionTier}</dd>
                        <dt className="text-[var(--color-muted)]">Status</dt>
                        <dd>{c.disabled ? "Disabled" : "Active"}</dd>
                        <dt className="text-[var(--color-muted)]">Last Login</dt>
                        <dd
                          title={c.lastLoginAt ? new Date(c.lastLoginAt).toLocaleString() : undefined}
                        >
                          {formatRelativeTime(c.lastLoginAt)}
                        </dd>
                      </dl>

                      {/* Actions */}
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => handleToggleTier(c)}
                          disabled={actionLoading === `tier-${c.id}`}
                          className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                            c.subscriptionTier === "PREMIUM"
                              ? "border border-amber-500/40 text-amber-400 hover:bg-amber-500/10"
                              : "border border-blue-500/40 text-blue-400 hover:bg-blue-500/10"
                          } disabled:opacity-50`}
                          data-testid={`admin-toggle-tier-${c.id}`}
                        >
                          {actionLoading === `tier-${c.id}`
                            ? "…"
                            : c.subscriptionTier === "PREMIUM"
                              ? "Revoke Premium"
                              : "Grant Premium"}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleToggleDisable(c)}
                          disabled={actionLoading === c.id}
                          className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                            c.disabled
                              ? "border border-green-500/40 text-green-400 hover:bg-green-500/10"
                              : "border border-red-500/40 text-red-400 hover:bg-red-500/10"
                          } disabled:opacity-50`}
                          data-testid={`admin-toggle-disable-${c.id}`}
                        >
                          {actionLoading === c.id
                            ? "…"
                            : c.disabled
                              ? "Enable"
                              : "Disable"}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(c)}
                          disabled={actionLoading === `delete-${c.id}`}
                          className="rounded-lg border border-red-600/40 px-3 py-1.5 text-xs font-medium text-red-500 transition-colors hover:bg-red-600/10 disabled:opacity-50"
                          data-testid={`admin-delete-${c.id}`}
                        >
                          {actionLoading === `delete-${c.id}` ? "…" : "Delete"}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
