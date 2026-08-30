"use client";

import { useState } from "react";

interface FeedbackReason {
  id: string;
  number: number;
  label: string;
}
export default function CancellationFeedbackForm({
  token,
  reasons,
  initialReason,
  previouslySubmitted,
}: {
  token: string;
  reasons: FeedbackReason[];
  initialReason?: string;
  previouslySubmitted: boolean;
}) {
  const [reason, setReason] = useState(initialReason ?? "");
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [complete, setComplete] = useState(false);

  async function submitFeedback(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!reason && !comment.trim()) {
      setError("Choose a reason or add a short comment.");
      return;
    }

    setSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/feedback/cancellation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          reason: reason || undefined,
          comment: comment.trim() || undefined,
        }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(payload.error ?? "We couldn't save your feedback. Please try again.");
        return;
      }
      setComplete(true);
    } catch {
      setError("We couldn't save your feedback. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (complete) {
    return (
      <div className="rounded-2xl border border-emerald-500/30 bg-[var(--color-surface)] p-6 text-center">
        <h2 className="text-xl font-bold text-emerald-400">Thank you</h2>
        <p className="mt-2 text-sm leading-6 text-[var(--color-muted)]">
          Your feedback is in our review queue. We read every response and use it to decide what to fix, simplify, and improve.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submitFeedback} className="space-y-5 rounded-2xl bg-[var(--color-surface)] p-5 sm:p-7">
      {previouslySubmitted && (
        <p className="rounded-lg border border-blue-500/30 bg-blue-500/10 p-3 text-sm text-blue-200">
          We already received a response from this link. Submitting again will update it.
        </p>
      )}

      <fieldset>
        <legend className="mb-3 text-sm font-semibold">What was the biggest reason you canceled?</legend>
        <div className="space-y-2">
          {reasons.map((item) => (
            <label
              key={item.id}
              className={`flex cursor-pointer gap-3 rounded-xl border p-3 text-sm transition-colors ${
                reason === item.id
                  ? "border-[var(--color-accent)] bg-blue-500/10"
                  : "border-[var(--color-surface-light)] hover:border-blue-400/60"
              }`}
            >
              <input
                type="radio"
                name="reason"
                value={item.id}
                checked={reason === item.id}
                onChange={() => {
                  setReason(item.id);
                  setError("");
                }}
                className="mt-0.5"
              />
              <span><strong className="mr-2">{item.number}</strong>{item.label}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div>
        <label htmlFor="cancellation-comment" className="mb-2 block text-sm font-semibold">
          Anything else you&apos;d like us to know? <span className="font-normal text-[var(--color-muted)]">(optional)</span>
        </label>
        <textarea
          id="cancellation-comment"
          value={comment}
          maxLength={4000}
          rows={6}
          onChange={(event) => {
            setComment(event.target.value);
            setError("");
          }}
          placeholder="One sentence is plenty."
          className="w-full resize-y rounded-xl border border-[var(--color-surface-light)] bg-[var(--color-background)] px-4 py-3 text-sm outline-none focus:border-[var(--color-accent)]"
        />
        <p className="mt-1 text-right text-xs text-[var(--color-muted)]">{comment.length}/4000</p>
      </div>

      {error && <p role="alert" className="text-sm text-red-400">{error}</p>}

      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-xl bg-[var(--color-accent)] px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
      >
        {submitting ? "Saving…" : "Send feedback"}
      </button>
      <p className="text-center text-xs text-[var(--color-muted)]">No sales follow-up—this is here so we can learn.</p>
    </form>
  );
}
