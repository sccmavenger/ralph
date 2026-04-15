"use client";

import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Suspense, useEffect, useState } from "react";

function SuccessContent() {
  const searchParams = useSearchParams();
  const redirectStatus = searchParams.get("redirect_status");
  const [syncing, setSyncing] = useState(redirectStatus === "succeeded");
  const [syncError, setSyncError] = useState(false);

  useEffect(() => {
    if (redirectStatus !== "succeeded") return;

    fetch("/api/stripe/confirm-subscription", { method: "POST" })
      .then((res) => {
        if (!res.ok) setSyncError(true);
      })
      .catch(() => setSyncError(true))
      .finally(() => setSyncing(false));
  }, [redirectStatus]);

  if (redirectStatus === "succeeded") {
    if (syncing) {
      return (
        <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--color-accent)] border-t-transparent" />
          <p className="mt-4 text-sm text-[var(--color-muted)]">
            Activating your Premium account...
          </p>
        </div>
      );
    }

    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">
        <span className="text-5xl">🎉</span>
        <h1 className="mt-4 text-2xl font-bold text-[var(--color-foreground)]">
          Welcome to Premium!
        </h1>
        <p className="mt-2 text-sm text-[var(--color-muted)]">
          {syncError
            ? "Payment received! Your account will be activated shortly."
            : "You now have full access to MSF Companion."}
        </p>
        <Link
          href="/dashboard"
          className="mt-6 rounded-lg bg-[var(--color-accent)] px-8 py-3 text-sm font-semibold text-white transition-colors hover:bg-blue-600"
        >
          Go to Dashboard
        </Link>
      </div>
    );
  }

  // Failed or requires_action
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">
      <span className="text-5xl">⚠️</span>
      <h1 className="mt-4 text-2xl font-bold text-[var(--color-foreground)]">
        Payment Not Completed
      </h1>
      <p className="mt-2 text-sm text-[var(--color-muted)]">
        {redirectStatus === "requires_action"
          ? "Additional action is needed to complete your payment."
          : "Something went wrong with your payment. Please try again."}
      </p>
      <Link
        href="/subscribe"
        className="mt-6 rounded-lg bg-[var(--color-accent)] px-8 py-3 text-sm font-semibold text-white transition-colors hover:bg-blue-600"
      >
        Try Again
      </Link>
    </div>
  );
}

export default function PaymentSuccessPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[60vh] items-center justify-center">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--color-accent)] border-t-transparent" />
        </div>
      }
    >
      <SuccessContent />
    </Suspense>
  );
}
