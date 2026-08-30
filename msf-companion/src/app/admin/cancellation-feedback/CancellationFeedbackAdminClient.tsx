"use client";

import { useMemo, useState } from "react";
import type { CancellationFeedbackAdminData } from "@/lib/cancellation-feedback-admin";

type FeedbackCase = CancellationFeedbackAdminData["cases"][number];

const REVIEW_STATUSES = [
  ["awaiting_response", "Awaiting response"],
  ["new", "New"],
  ["reviewing", "Reviewing"],
  ["planned", "Planned"],
  ["actioned", "Actioned"],
  ["closed", "Closed"],
] as const;

const REASONS = [
  ["not_using_enough", "Not using it enough"],
  ["price_did_not_match_value", "Price did not match value"],
  ["missing_something", "Missing something needed"],
  ["confusing_or_broken", "Confusing or broken"],
  ["needs_changed", "Needs changed"],
  ["something_else", "Something else"],
  ["uncategorized", "Uncategorized"],
] as const;

function formatDate(value: string | null): string {
  return value ? new Date(value).toLocaleString() : "—";
}

function statusClass(status: string): string {
  if (["new", "failed"].includes(status)) return "bg-red-500/15 text-red-300";
  if (["sent", "delivered", "actioned"].includes(status)) return "bg-emerald-500/15 text-emerald-300";
  if (["queued", "planned", "reviewing"].includes(status)) return "bg-blue-500/15 text-blue-300";
  return "bg-slate-500/20 text-slate-300";
}

export default function CancellationFeedbackAdminClient({
  initialData,
}: {
  initialData: CancellationFeedbackAdminData;
}) {
  const [cases, setCases] = useState(initialData.cases);
  const [filter, setFilter] = useState("all");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const filtered = useMemo(() => {
    if (filter === "all") return cases;
    if (filter === "responded") return cases.filter((item) => item.responses.length > 0);
    if (filter === "needs-review") return cases.filter((item) => item.reviewStatus === "new");
    return cases.filter((item) => item.outreachStatus === filter || item.reviewStatus === filter);
  }, [cases, filter]);

  function patchLocal(id: string, changes: Partial<FeedbackCase>) {
    setCases((current) => current.map((item) => item.id === id ? { ...item, ...changes } : item));
  }

  async function saveCase(item: FeedbackCase) {
    setSaving(item.id);
    setMessage(null);
    try {
      const response = await fetch(`/api/admin/cancellation-feedback/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reviewStatus: item.reviewStatus,
          primaryReason: item.primaryReason,
          theme: item.theme,
          assignedTo: item.assignedTo,
          adminNotes: item.adminNotes,
          actionSummary: item.actionSummary,
          actionUrl: item.actionUrl,
        }),
      });
      const payload = (await response.json()) as { error?: string; case?: Partial<FeedbackCase> };
      if (!response.ok) throw new Error(payload.error ?? "Save failed");
      if (payload.case) patchLocal(item.id, payload.case);
      setMessage("Case saved");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Save failed");
    } finally {
      setSaving(null);
    }
  }

  async function addManualReply(item: FeedbackCase, form: HTMLFormElement) {
    const formData = new FormData(form);
    const responseBody = String(formData.get("response") ?? "").trim();
    const responseReason = String(formData.get("responseReason") ?? "").trim();
    if (!responseBody) return;
    setSaving(`response:${item.id}`);
    setMessage(null);
    try {
      const response = await fetch(`/api/admin/cancellation-feedback/${item.id}/responses`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: responseBody, reason: responseReason || undefined }),
      });
      const payload = (await response.json()) as { error?: string; response?: FeedbackCase["responses"][number] };
      if (!response.ok || !payload.response) throw new Error(payload.error ?? "Could not add response");
      patchLocal(item.id, {
        responses: [payload.response, ...item.responses],
        firstRespondedAt: item.firstRespondedAt ?? payload.response.receivedAt,
        reviewStatus: "new",
        primaryReason: responseReason || item.primaryReason,
      });
      form.reset();
      setMessage("Reply added to the review queue");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not add response");
    } finally {
      setSaving(null);
    }
  }

  async function backfillRecentCancellations() {
    if (!window.confirm("Queue eligible voluntary cancellations from the last 180 days? This does not send immediately; the configured cancellation email job controls delivery.")) return;
    setSaving("backfill");
    setMessage(null);
    try {
      const response = await fetch("/api/admin/cancellation-feedback/backfill", { method: "POST" });
      const payload = (await response.json()) as {
        error?: string;
        queued?: number;
        alreadyQueued?: number;
      };
      if (!response.ok) throw new Error(payload.error ?? "Backfill failed");
      window.alert(`Queued ${payload.queued ?? 0} new cases; ${payload.alreadyQueued ?? 0} were already present.`);
      window.location.reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Backfill failed");
      setSaving(null);
    }
  }

  return (
    <main className="min-h-screen bg-[var(--color-background)] px-4 py-6 text-[var(--color-foreground)]">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Cancellation feedback</h1>
            <p className="mt-1 text-xs text-[var(--color-muted)]">
              Outreach mode: <strong>{initialData.automationMode}</strong> · updated {formatDate(initialData.generatedAt)}
            </p>
          </div>
          <div className="flex gap-3 text-sm">
            <a href="/admin/email-health" className="text-[var(--color-accent)]">Email health</a>
            <a href="/admin/dashboard" className="text-[var(--color-accent)]">Back to admin</a>
          </div>
        </div>

        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
          {[
            ["Queued", initialData.metrics.queued],
            ["Sent", initialData.metrics.invitationsSent],
            ["Delivered", initialData.metrics.invitationsDelivered],
            ["Responses", initialData.metrics.responses],
            ["Response rate", `${initialData.metrics.responseRate}%`],
            ["Unreviewed", initialData.metrics.unreviewed],
            ["Planned", initialData.metrics.planned],
            ["Actioned", initialData.metrics.actioned],
          ].map(([label, value]) => (
            <div key={label} className="rounded-xl bg-[var(--color-surface)] p-3">
              <p className="text-[11px] text-[var(--color-muted)]">{label}</p>
              <p className="mt-1 text-lg font-bold">{value}</p>
            </div>
          ))}
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-2">
          <label htmlFor="feedback-filter" className="text-xs text-[var(--color-muted)]">Show</label>
          <select
            id="feedback-filter"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            className="rounded-lg border border-[var(--color-surface-light)] bg-[var(--color-surface)] px-3 py-2 text-sm"
          >
            <option value="all">All cases</option>
            <option value="needs-review">Needs review</option>
            <option value="responded">All responses</option>
            <option value="queued">Queued outreach</option>
            <option value="failed">Failed outreach</option>
            <option value="planned">Planned improvements</option>
            <option value="actioned">Actioned</option>
          </select>
          <button
            type="button"
            onClick={() => void backfillRecentCancellations()}
            disabled={saving === "backfill"}
            className="rounded-lg border border-[var(--color-surface-light)] px-3 py-2 text-xs text-[var(--color-muted)] hover:border-[var(--color-accent)] hover:text-[var(--color-foreground)] disabled:opacity-50"
          >
            {saving === "backfill" ? "Reconciling…" : "Queue recent cancellations"}
          </button>
          {message && <span className="text-xs text-[var(--color-muted)]">{message}</span>}
        </div>

        <div className="space-y-3">
          {filtered.map((item) => {
            const response = item.responses[0];
            const isExpanded = expanded === item.id;
            return (
              <article key={item.id} className="overflow-hidden rounded-xl border border-[var(--color-surface-light)] bg-[var(--color-surface)]">
                <button
                  type="button"
                  onClick={() => setExpanded(isExpanded ? null : item.id)}
                  className="w-full p-4 text-left"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h2 className="font-semibold">{item.commanderName}</h2>
                      <p className="mt-0.5 text-xs text-[var(--color-muted)]">{item.commanderEmail ?? "No current email"} · canceled {formatDate(item.cancellationRequestedAt)}</p>
                    </div>
                    <div className="flex flex-wrap gap-2 text-[11px]">
                      <span className={`rounded-full px-2 py-1 ${statusClass(item.outreachStatus)}`}>{item.deliveryStatus ?? item.outreachStatus}</span>
                      <span className={`rounded-full px-2 py-1 ${statusClass(item.reviewStatus)}`}>{item.reviewStatus.replaceAll("_", " ")}</span>
                    </div>
                  </div>
                  <p className="mt-3 line-clamp-2 text-sm text-[var(--color-muted)]">
                    {response?.body || (response?.reason ? REASONS.find(([id]) => id === response.reason)?.[1] : null) || item.suppressionReason?.replaceAll("_", " ") || "No response yet"}
                  </p>
                </button>

                {isExpanded && (
                  <div className="border-t border-[var(--color-surface-light)] p-4">
                    <dl className="mb-5 grid gap-x-6 gap-y-2 text-xs sm:grid-cols-2">
                      <div><dt className="text-[var(--color-muted)]">Invitation scheduled</dt><dd>{formatDate(item.scheduledAt)}</dd></div>
                      <div><dt className="text-[var(--color-muted)]">Sent / delivered</dt><dd>{formatDate(item.sentAt)} / {formatDate(item.deliveredAt)}</dd></div>
                      <div><dt className="text-[var(--color-muted)]">Subscription</dt><dd className="break-all font-mono">{item.stripeSubscriptionId}</dd></div>
                      <div><dt className="text-[var(--color-muted)]">Suppression / error</dt><dd>{item.suppressionReason ?? item.deliveryLastError ?? "—"}</dd></div>
                    </dl>

                    <section className="mb-5">
                      <h3 className="mb-2 text-sm font-semibold">Responses</h3>
                      <div className="space-y-2">
                        {item.responses.map((entry) => (
                          <div key={entry.id} className="rounded-lg bg-[var(--color-background)] p-3 text-sm">
                            <p className="mb-1 text-[11px] text-[var(--color-muted)]">{entry.source} · {formatDate(entry.receivedAt)}{entry.reason ? ` · ${entry.reason.replaceAll("_", " ")}` : ""}</p>
                            <p className="whitespace-pre-wrap">{entry.body || "Reason selection only"}</p>
                          </div>
                        ))}
                        {!item.responses.length && <p className="text-xs text-[var(--color-muted)]">No response recorded yet.</p>}
                      </div>
                    </section>

                    <form
                      className="mb-6 rounded-lg border border-dashed border-[var(--color-surface-light)] p-3"
                      onSubmit={(event) => {
                        event.preventDefault();
                        void addManualReply(item, event.currentTarget);
                      }}
                    >
                      <h3 className="text-sm font-semibold">Add a reply from the inbox</h3>
                      <p className="mb-3 text-xs text-[var(--color-muted)]">Paste replies received at info@themsftoolkit.com so they can be tracked and actioned here.</p>
                      <div className="grid gap-2 sm:grid-cols-[200px_1fr]">
                        <select name="responseReason" className="rounded-lg border border-[var(--color-surface-light)] bg-[var(--color-background)] px-3 py-2 text-sm">
                          <option value="">Reason not categorized</option>
                          {REASONS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
                        </select>
                        <textarea name="response" required maxLength={4000} rows={3} placeholder="Paste the commander's reply" className="rounded-lg border border-[var(--color-surface-light)] bg-[var(--color-background)] px-3 py-2 text-sm" />
                      </div>
                      <button disabled={saving === `response:${item.id}`} className="mt-2 rounded-lg border border-[var(--color-accent)] px-3 py-2 text-xs text-[var(--color-accent)] disabled:opacity-50">Add response</button>
                    </form>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="text-xs">Review status
                        <select value={item.reviewStatus} onChange={(event) => patchLocal(item.id, { reviewStatus: event.target.value })} className="mt-1 w-full rounded-lg border border-[var(--color-surface-light)] bg-[var(--color-background)] px-3 py-2 text-sm">
                          {REVIEW_STATUSES.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
                        </select>
                      </label>
                      <label className="text-xs">Primary reason
                        <select value={item.primaryReason ?? ""} onChange={(event) => patchLocal(item.id, { primaryReason: event.target.value || null })} className="mt-1 w-full rounded-lg border border-[var(--color-surface-light)] bg-[var(--color-background)] px-3 py-2 text-sm">
                          <option value="">Not categorized</option>
                          {REASONS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
                        </select>
                      </label>
                      <label className="text-xs">Theme
                        <input value={item.theme ?? ""} onChange={(event) => patchLocal(item.id, { theme: event.target.value })} placeholder="e.g. roster refresh reliability" className="mt-1 w-full rounded-lg border border-[var(--color-surface-light)] bg-[var(--color-background)] px-3 py-2 text-sm" />
                      </label>
                      <label className="text-xs">Owner
                        <input value={item.assignedTo ?? ""} onChange={(event) => patchLocal(item.id, { assignedTo: event.target.value })} placeholder="Name or team" className="mt-1 w-full rounded-lg border border-[var(--color-surface-light)] bg-[var(--color-background)] px-3 py-2 text-sm" />
                      </label>
                      <label className="text-xs sm:col-span-2">Admin notes
                        <textarea value={item.adminNotes ?? ""} onChange={(event) => patchLocal(item.id, { adminNotes: event.target.value })} rows={3} className="mt-1 w-full rounded-lg border border-[var(--color-surface-light)] bg-[var(--color-background)] px-3 py-2 text-sm" />
                      </label>
                      <label className="text-xs sm:col-span-2">Planned or completed action
                        <textarea value={item.actionSummary ?? ""} onChange={(event) => patchLocal(item.id, { actionSummary: event.target.value })} rows={2} placeholder="What will change because of this feedback?" className="mt-1 w-full rounded-lg border border-[var(--color-surface-light)] bg-[var(--color-background)] px-3 py-2 text-sm" />
                      </label>
                      <label className="text-xs sm:col-span-2">Action link
                        <input value={item.actionUrl ?? ""} onChange={(event) => patchLocal(item.id, { actionUrl: event.target.value })} placeholder="https://github.com/... or /admin/..." className="mt-1 w-full rounded-lg border border-[var(--color-surface-light)] bg-[var(--color-background)] px-3 py-2 text-sm" />
                      </label>
                    </div>
                    <button type="button" onClick={() => void saveCase(item)} disabled={saving === item.id} className="mt-4 rounded-lg bg-[var(--color-accent)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{saving === item.id ? "Saving…" : "Save review"}</button>
                  </div>
                )}
              </article>
            );
          })}
          {!filtered.length && <p className="rounded-xl bg-[var(--color-surface)] p-8 text-center text-sm text-[var(--color-muted)]">No cancellation cases match this view.</p>}
        </div>
      </div>
    </main>
  );
}
