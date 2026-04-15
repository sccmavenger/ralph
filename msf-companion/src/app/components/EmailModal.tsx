"use client";

import { useState } from "react";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function EmailModal({
  onDismiss,
}: {
  onDismiss: () => void;
}) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
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
        setError(data.error || "Failed to save email");
        setSaving(false);
        return;
      }

      onDismiss();
    } catch {
      setError("Something went wrong. Please try again.");
      setSaving(false);
    }
  }

  async function handleSkip() {
    try {
      await fetch("/api/commander/email/skip", { method: "POST" });
    } catch {
      // Ignore — skip should always work
    }
    onDismiss();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-6">
      <div className="w-full max-w-sm rounded-2xl bg-[var(--color-surface)] p-6">
        <h2 className="mb-2 text-lg font-bold text-[var(--color-foreground)]">
          Stay in the loop
        </h2>
        <p className="mb-4 text-sm text-[var(--color-muted)]">
          Enter your email for community updates and important announcements.
        </p>

        <input
          type="email"
          placeholder="commander@example.com"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            if (error) setError("");
          }}
          className="mb-2 w-full rounded-lg border border-[var(--color-surface-light)] bg-[var(--color-background)] px-4 py-3 text-sm text-[var(--color-foreground)] placeholder-[var(--color-muted)] outline-none focus:border-[var(--color-accent)]"
          autoFocus
        />

        {error && <p className="mb-2 text-xs text-red-400">{error}</p>}

        <button
          onClick={handleSave}
          disabled={saving}
          className="mt-2 w-full rounded-lg bg-[var(--color-accent)] px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-blue-600 active:bg-blue-700 disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save"}
        </button>

        <button
          onClick={handleSkip}
          className="mt-3 w-full text-center text-sm text-[var(--color-muted)] transition-colors hover:text-[var(--color-foreground)]"
        >
          Skip for now
        </button>
      </div>
    </div>
  );
}
