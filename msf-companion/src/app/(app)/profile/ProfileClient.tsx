"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function formatNumber(n: number): string {
  return n.toLocaleString();
}

export default function ProfileClient({
  displayName,
  level,
  tcp,
  allianceName,
  email: initialEmail,
}: {
  displayName: string;
  level: number | null;
  tcp: number | null;
  allianceName: string | null;
  email: string | null;
}) {
  const [email, setEmail] = useState(initialEmail ?? "");
  const [savedEmail, setSavedEmail] = useState(initialEmail);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
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
    <div className="px-4 py-6">
      <h2 className="mb-6 text-xl font-bold text-[var(--color-foreground)]">
        Profile
      </h2>

      {/* Commander Info */}
      <div className="mb-4 rounded-xl bg-[var(--color-surface)] p-5">
        <h3 className="mb-3 text-lg font-semibold text-[var(--color-foreground)]">
          {displayName}
        </h3>
        <div className="space-y-2 text-sm">
          {level !== null && (
            <div className="flex justify-between">
              <span className="text-[var(--color-muted)]">Level</span>
              <span className="font-medium text-[var(--color-foreground)]">
                {level}
              </span>
            </div>
          )}
          {tcp !== null && (
            <div className="flex justify-between">
              <span className="text-[var(--color-muted)]">
                Total Collection Power
              </span>
              <span className="font-medium text-[var(--color-foreground)]">
                {formatNumber(tcp)}
              </span>
            </div>
          )}
          {allianceName && (
            <div className="flex justify-between">
              <span className="text-[var(--color-muted)]">Alliance</span>
              <span className="font-medium text-[var(--color-foreground)]">
                {allianceName}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Email Section */}
      <div className="rounded-xl bg-[var(--color-surface)] p-5">
        <h3 className="mb-3 text-base font-semibold text-[var(--color-foreground)]">
          Email
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
                Add your email for community updates
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

      {/* FAQ Link */}
      <div className="mt-4">
        <a
          href="/faq"
          className="block w-full rounded-xl bg-[var(--color-surface)] px-5 py-4 text-center text-sm font-medium text-[var(--color-accent)]"
        >
          FAQ — Security, Data &amp; More
        </a>
      </div>

      {/* Logout */}
      <div className="mt-6">
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
    </div>
  );
}
