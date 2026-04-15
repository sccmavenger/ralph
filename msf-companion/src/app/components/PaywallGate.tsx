"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import type { ReactNode } from "react";

/** Routes that free users can always access (exact match only) */
const FREE_EXACT_ROUTES = ["/dashboard"];

/** Routes where free users can access sub-routes too */
const FREE_PREFIX_ROUTES = ["/subscribe", "/faq"];

/**
 * Client-side paywall wrapper. Shows lock screen on protected routes
 * for non-premium users; renders children otherwise.
 * Must be a client component so usePathname() re-evaluates on every navigation.
 */
export default function PaywallGate({
  tier,
  children,
}: {
  tier: string;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const isPremium = tier === "PREMIUM";
  const isFreeRoute =
    FREE_EXACT_ROUTES.includes(pathname) ||
    FREE_PREFIX_ROUTES.some(
      (route) => pathname === route || pathname.startsWith(route + "/")
    );

  if (isPremium || isFreeRoute) {
    return <>{children}</>;
  }

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-8">
      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-[var(--color-surface)] text-4xl">
        🔒
      </div>
      <h2 className="mt-5 text-center text-lg font-bold text-[var(--color-foreground)]">
        Premium Feature
      </h2>
      <p className="mt-2 max-w-xs text-center text-sm leading-relaxed text-[var(--color-muted)]">
        Upgrade to unlock full access to this feature and everything else MSF Companion has to offer.
      </p>
      <Link
        href="/subscribe"
        className="mt-6 rounded-lg bg-[var(--color-accent)] px-10 py-3 text-sm font-semibold text-white transition-colors hover:bg-blue-600"
      >
        Upgrade Now
      </Link>
      <Link
        href="/dashboard"
        className="mt-3 text-xs text-[var(--color-muted)] hover:text-[var(--color-foreground)] transition-colors"
      >
        ← Back to Dashboard
      </Link>
    </div>
  );
}
