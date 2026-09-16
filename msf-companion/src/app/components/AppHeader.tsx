"use client";

import Link from "next/link";
import NotificationBell from "./NotificationBell";

export default function AppHeader({
  displayName,
  portrait,
}: {
  displayName?: string;
  portrait?: string | null;
}) {
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-[var(--color-surface-light)] bg-[var(--color-background)] px-4 overflow-hidden">
      <div className="flex items-center gap-2 min-w-0 shrink-0">
        <Link href="/dashboard" className="flex min-h-11 items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-red-600 text-[10px] font-bold text-white">
            MSF
          </div>
          <span className="text-base font-bold tracking-tight text-[var(--color-foreground)]">
            Companion
          </span>
        </Link>
      </div>

      <div className="flex items-center gap-2 min-w-0">
        <NotificationBell />
        <Link href="/profile" aria-label="Commander profile" className="flex min-h-11 min-w-11 items-center justify-center gap-2">
          {portrait ? (
            <img
              src={portrait}
              alt={displayName ?? "Commander"}
              className="h-8 w-8 rounded-full object-cover shrink-0"
            />
          ) : (
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-yellow-500 to-red-500 text-xs font-bold text-white shrink-0">
              {(displayName ?? "C")[0].toUpperCase()}
            </div>
          )}
        </Link>
      </div>
    </header>
  );
}
