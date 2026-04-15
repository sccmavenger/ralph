import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getValidAccessToken } from "@/lib/auth";
import DesktopGate from "./components/DesktopGate";
import AuthError from "./components/AuthError";

export const metadata: Metadata = {
  title: "MSF Companion — Your Marvel Strike Force Command Center",
  description:
    "The ultimate mobile companion for Marvel Strike Force. Track your roster, plan upgrades, get AI-powered advice, and dominate with real-time war and event data. Free to start.",
};

const FEATURES = [
  {
    icon: "📋",
    title: "Daily Briefing",
    desc: "See free offers, milestone rewards, and action items at a glance.",
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
    desc: "Build optimized squads with synergy scoring and save favorites.",
  },
  {
    icon: "📅",
    title: "Event Planner",
    desc: "Upcoming events with readiness checks and team recommendations.",
  },
  {
    icon: "📊",
    title: "Roster Tracker",
    desc: "Browse your characters with power stats, stars, and gear details.",
  },
  {
    icon: "📈",
    title: "Progress Snapshots",
    desc: "Track TCP, roster growth, and resources over time.",
  },
];

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const token = await getValidAccessToken();

  if (token) {
    redirect("/dashboard");
  }

  const params = await searchParams;
  const errorMessage = params.error;

  return (
    <DesktopGate>
      <div className="flex flex-1 flex-col px-6 py-8">
        <div className="mx-auto flex w-full max-w-sm flex-col">
          {/* Hero: Logo + CTA */}
          <div className="flex flex-col items-center text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-red-600 to-red-800 shadow-lg shadow-red-900/30">
              <span className="text-2xl font-black text-white">MSF</span>
            </div>

            <h1 className="mb-1 text-2xl font-bold tracking-tight text-[var(--color-foreground)]">
              MSF Companion
            </h1>
            <p className="mb-5 text-sm text-[var(--color-muted)]">
              Your Marvel Strike Force command center
            </p>

            {errorMessage && <AuthError message={errorMessage} />}

            <a
              href="/api/auth/login"
              className="mb-2 block w-full rounded-lg bg-[var(--color-accent)] px-6 py-3.5 text-center text-base font-semibold text-white shadow-lg shadow-blue-600/20 transition-colors hover:bg-blue-600 active:bg-blue-700"
            >
              Login with Scopely
            </a>
            <p className="mb-6 text-[11px] text-[var(--color-muted)]">
              Secure OAuth — we never see your password
            </p>
          </div>

          {/* Feature grid */}
          <div className="mb-6">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">
              What you get
            </h2>
            <div className="grid grid-cols-2 gap-2">
              {FEATURES.map((f) => (
                <div
                  key={f.title}
                  className="rounded-xl bg-[var(--color-surface)] px-3 py-3"
                >
                  <span className="text-lg">{f.icon}</span>
                  <p className="mt-1 text-xs font-semibold text-[var(--color-foreground)]">
                    {f.title}
                  </p>
                  <p className="mt-0.5 text-[10px] leading-snug text-[var(--color-muted)]">
                    {f.desc}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Footer links */}
          <div className="flex items-center justify-center gap-4 pb-4">
            <a
              href="/faq"
              className="text-xs text-[var(--color-accent)] hover:underline"
            >
              FAQ
            </a>
            <span className="text-xs text-[var(--color-surface-light)]">•</span>
            <a
              href="/privacy"
              className="text-xs text-[var(--color-accent)] hover:underline"
            >
              Privacy
            </a>
            <span className="text-xs text-[var(--color-surface-light)]">•</span>
            <a
              href="/terms"
              className="text-xs text-[var(--color-accent)] hover:underline"
            >
              Terms
            </a>
          </div>
        </div>
      </div>
    </DesktopGate>
  );
}
