"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  activeNavigationHref,
  isNavigationRoute,
  MORE_NAVIGATION,
  PRIMARY_NAVIGATION,
} from "@/lib/app-navigation";
import DashboardIcon from "../(app)/dashboard/DashboardIcon";

const tabClass = "flex min-h-16 min-w-0 flex-col items-center justify-center gap-1 border-t-2 text-[11px] font-medium focus-visible:outline-2 focus-visible:outline-blue-300";
const activeClass = "border-blue-400 text-blue-400";
const inactiveClass = "border-transparent text-slate-400 hover:text-slate-200";
const subscribeToHydration = () => () => {};

export default function AppNavigation() {
  const pathname = usePathname();
  const menu = useRef<HTMLDialogElement>(null);
  const previousPathname = useRef(pathname);
  const [menuOpen, setMenuOpen] = useState(false);
  // Unlike links, More has no native navigation fallback before its JS loads.
  // Keep the SSR button disabled until React can handle the first tap.
  const hydrated = useSyncExternalStore(subscribeToHydration, () => true, () => false);
  const activeHref = activeNavigationHref(pathname);
  const moreActive = activeHref === null;

  // The shared layout persists across navigation, including browser Back/Forward.
  useEffect(() => {
    // An initial hydration effect is not navigation: it may run after React
    // replays a click on More, and must not immediately close that new dialog.
    if (previousPathname.current !== pathname) {
      menu.current?.close();
      previousPathname.current = pathname;
    }
  }, [pathname]);

  function openMenu() {
    // Also protect a deliberate click after a route commit but before its effect.
    previousPathname.current = pathname;
    menu.current?.showModal();
    setMenuOpen(true);
  }

  return (
    <>
      <nav
        aria-label="Main navigation"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-700 bg-[#111c2d]/95 backdrop-blur-lg"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="mx-auto grid max-w-3xl grid-cols-5">
          {PRIMARY_NAVIGATION.map((entry) => {
            const active = activeHref === entry.href;
            return (
              <Link
                key={entry.href}
                href={entry.href}
                aria-current={active ? "page" : undefined}
                className={`${tabClass} ${active ? activeClass : inactiveClass}`}
              >
                <DashboardIcon name={entry.icon} />
                {entry.label}
              </Link>
            );
          })}
          <button
            type="button"
            disabled={!hydrated}
            onClick={openMenu}
            aria-haspopup="dialog"
            aria-controls="app-more-menu"
            aria-expanded={menuOpen}
            aria-current={moreActive ? "true" : undefined}
            className={`${tabClass} ${moreActive ? activeClass : inactiveClass}`}
          >
            <DashboardIcon name="more" />
            More
          </button>
        </div>
      </nav>

      <dialog
        ref={menu}
        id="app-more-menu"
        aria-labelledby="app-more-title"
        onClose={() => setMenuOpen(false)}
        className="fixed inset-0 m-auto max-h-[85dvh] w-[calc(100%_-_2rem)] max-w-sm overflow-y-auto rounded-2xl border border-slate-600 bg-slate-900 p-5 text-slate-100 backdrop:bg-black/60"
      >
        <div className="flex items-center justify-between">
          <h2 id="app-more-title" className="text-lg font-bold">Your toolkit</h2>
          <button
            type="button"
            autoFocus
            onClick={() => menu.current?.close()}
            className="min-h-11 min-w-11 rounded-lg text-sm text-blue-300 focus-visible:outline-2 focus-visible:outline-blue-300"
          >
            Close
          </button>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {MORE_NAVIGATION.map((entry) => {
            const active = isNavigationRoute(pathname, entry.href);
            return (
              <Link
                key={entry.href}
                href={entry.href}
                aria-current={active ? "page" : undefined}
                onClick={() => menu.current?.close()}
                className={`flex min-h-12 items-center rounded-xl border p-3 text-sm focus-visible:outline-2 focus-visible:outline-blue-300 ${active ? "border-blue-400 bg-blue-400/10 text-blue-300" : "border-slate-700 hover:bg-slate-800"}`}
              >
                {entry.label}
              </Link>
            );
          })}
        </div>
        <button
          type="button"
          onClick={async () => {
            await fetch("/api/auth/logout", { method: "POST" });
            window.location.href = "/";
          }}
          className="mt-4 min-h-11 rounded-lg text-sm text-slate-300 focus-visible:outline-2 focus-visible:outline-blue-300"
        >
          Sign out
        </button>
      </dialog>
    </>
  );
}
