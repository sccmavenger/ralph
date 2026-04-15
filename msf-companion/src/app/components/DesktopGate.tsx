"use client";

import { useCallback, useSyncExternalStore } from "react";

const FEATURES = [
  {
    icon: "📋",
    title: "Daily Briefing",
    desc: "Free offers, milestone rewards, and action items at a glance.",
  },
  {
    icon: "🌾",
    title: "Farming Guide",
    desc: "Prioritized daily farming targets based on your roster gaps.",
  },
  {
    icon: "⚔️",
    title: "War & Crucible Meta",
    desc: "Top offense and defense teams with live win-rate data.",
  },
  {
    icon: "🤖",
    title: "AI Advisor",
    desc: "Ask questions about your roster and get personalized answers.",
  },
  {
    icon: "🦸",
    title: "Team Builder",
    desc: "Build optimized squads with synergy scoring.",
  },
  {
    icon: "📅",
    title: "Event Planner",
    desc: "Upcoming events with readiness checks and recommendations.",
  },
];

function useIsDesktop() {
  const subscribe = useCallback((callback: () => void) => {
    window.addEventListener("resize", callback);
    return () => window.removeEventListener("resize", callback);
  }, []);

  const getSnapshot = useCallback(() => window.innerWidth > 768, []);
  const getServerSnapshot = useCallback(() => false, []);

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

function DesktopLanding() {
  const siteUrl = "https://themsftoolkit.com";

  return (
    <div className="desktop-gate fixed inset-0 z-50 overflow-y-auto bg-[var(--color-background)]">
      <div className="mx-auto max-w-4xl px-8 py-12">
        {/* Hero */}
        <div className="mb-12 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-red-600 to-red-800 shadow-lg shadow-red-900/30">
            <span className="text-2xl font-black text-white">MSF</span>
          </div>
          <h1 className="mb-2 text-3xl font-bold text-[var(--color-foreground)]">
            MSF Companion
          </h1>
          <p className="mb-4 text-lg text-[var(--color-muted)]">
            Your Marvel Strike Force command center — built for mobile
          </p>
          <p className="mx-auto max-w-xl text-sm leading-relaxed text-[var(--color-muted)]">
            MSF Companion is a mobile-first web app designed for how commanders
            actually play — on their phones. Scan the QR code below to get
            started on your mobile device.
          </p>
        </div>

        {/* QR Code */}
        <div className="mb-12 flex flex-col items-center">
          <div className="rounded-2xl bg-white p-4 shadow-lg">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(siteUrl)}&bgcolor=ffffff&color=000000&format=svg`}
              alt="Scan to visit MSF Companion on mobile"
              width={200}
              height={200}
            />
          </div>
          <p className="mt-3 text-sm font-medium text-[var(--color-muted)]">
            Scan with your phone&apos;s camera
          </p>
        </div>

        {/* Features */}
        <div className="mb-12">
          <h2 className="mb-6 text-center text-xl font-bold text-[var(--color-foreground)]">
            What you get
          </h2>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
            {FEATURES.map((f) => (
              <div
                key={f.title}
                className="rounded-xl bg-[var(--color-surface)] p-4"
              >
                <span className="text-2xl">{f.icon}</span>
                <p className="mt-2 text-sm font-semibold text-[var(--color-foreground)]">
                  {f.title}
                </p>
                <p className="mt-1 text-xs leading-snug text-[var(--color-muted)]">
                  {f.desc}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Pricing teaser */}
        <div className="mb-12 rounded-xl border border-[var(--color-accent)]/30 bg-[var(--color-surface)] p-6 text-center">
          <h2 className="mb-2 text-lg font-bold text-[var(--color-foreground)]">
            Free to start. Premium from $1.99/mo.
          </h2>
          <p className="mx-auto max-w-md text-sm text-[var(--color-muted)]">
            Core features like the Dashboard, Roster overview, and Daily
            Briefing are completely free. Unlock AI Advisor, Team Builder, Dark
            Dimension Planner, and more with Premium.
          </p>
        </div>

        {/* Footer links */}
        <div className="flex items-center justify-center gap-4 border-t border-[var(--color-surface-light)] pt-6 text-xs text-[var(--color-muted)]">
          <a
            href="/faq"
            className="text-[var(--color-accent)] hover:underline"
          >
            FAQ
          </a>
          <span>•</span>
          <a
            href="/privacy"
            className="text-[var(--color-accent)] hover:underline"
          >
            Privacy Policy
          </a>
          <span>•</span>
          <a
            href="/terms"
            className="text-[var(--color-accent)] hover:underline"
          >
            Terms of Service
          </a>
          <span>•</span>
          <a
            href="https://discord.gg/yyTq7KfX"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[var(--color-accent)] hover:underline"
          >
            Discord
          </a>
          <span>•</span>
          <a
            href="mailto:info@themsftoolkit.com"
            className="text-[var(--color-accent)] hover:underline"
          >
            Contact
          </a>
        </div>
      </div>
    </div>
  );
}

export default function DesktopGate({
  children,
}: {
  children: React.ReactNode;
}) {
  const isDesktop = useIsDesktop();

  return (
    <>
      <DesktopLanding />

      {/* Client-side JS check as backup — hides content when JS detects desktop */}
      {isDesktop ? null : (
        <div className="mobile-app flex flex-1 flex-col">{children}</div>
      )}
    </>
  );
}
