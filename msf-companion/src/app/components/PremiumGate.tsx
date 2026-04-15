"use client";

import Link from "next/link";

export default function PremiumGate({
  children,
  isPremium,
  featureName,
}: {
  children: React.ReactNode;
  isPremium: boolean;
  featureName: string;
}) {
  if (isPremium) {
    return <>{children}</>;
  }

  return (
    <div className="relative">
      <div className="pointer-events-none opacity-30 blur-[2px]">
        {children}
      </div>
      <div className="absolute inset-0 flex flex-col items-center justify-center bg-[var(--color-background)]/80 px-6">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-surface)] text-2xl">
          🔒
        </div>
        <p className="mt-3 text-center text-sm font-semibold text-[var(--color-foreground)]">
          {featureName} is a Premium feature
        </p>
        <Link
          href="/subscribe"
          className="mt-3 rounded-lg bg-[var(--color-accent)] px-6 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-600"
        >
          Upgrade to Premium
        </Link>
      </div>
    </div>
  );
}
