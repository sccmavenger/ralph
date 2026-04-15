"use client";

import { useState } from "react";

interface TourCard {
  title: string;
  description: string;
  icon: string;
  badge?: string;
}

const TOUR_CARDS: TourCard[] = [
  {
    title: "Welcome, Commander!",
    description:
      "MSF Companion is your personal toolkit for Marvel Strike Force. View your roster, plan upgrades, and track your inventory — all from your phone.",
    icon: "🎖️",
  },
  {
    title: "Your Roster",
    description:
      "See all your characters at a glance with power, gear tier, and star levels. Tap any character for a detailed breakdown of their abilities and stats.",
    icon: "👥",
  },
  {
    title: "Smart Filters",
    description:
      "Filter your roster by team, trait, star level, gear tier, and more. Find exactly who you need for Dark Dimension, Cosmic nodes, or any game mode.",
    icon: "🔍",
    badge: "Premium",
  },
  {
    title: "Inventory & Upgrades",
    description:
      "Browse your full inventory and see exactly which materials you need for each character's next upgrade — with what you own vs. what you're missing.",
    icon: "📦",
    badge: "Premium",
  },
  {
    title: "Game Roster",
    description:
      "Explore every character in the game, not just the ones you own. Filter by team, find missing characters, and plan your next unlock.",
    icon: "🌐",
  },
  {
    title: "Safe & Secure",
    description:
      "We use official Scopely OAuth with read-only access. Your password is never shared, and your account cannot be banned for using this app. Check out our FAQ for more details.",
    icon: "🔒",
  },
];

export default function OnboardingTour({
  onComplete,
}: {
  onComplete: () => void;
}) {
  const [currentStep, setCurrentStep] = useState(0);

  const card = TOUR_CARDS[currentStep];
  const isLast = currentStep === TOUR_CARDS.length - 1;

  async function handleComplete() {
    try {
      await fetch("/api/commander/onboarding", { method: "POST" });
    } catch {
      // Non-blocking — tour still closes
    }
    onComplete();
  }

  function handleNext() {
    if (isLast) {
      handleComplete();
    } else {
      setCurrentStep((s) => s + 1);
    }
  }

  function handleSkip() {
    handleComplete();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-6">
      <div className="w-full max-w-sm rounded-2xl bg-[var(--color-surface)] p-6">
        {/* Card content */}
        <div className="mb-6 flex flex-col items-center text-center">
          <span className="mb-4 text-5xl">{card.icon}</span>
          <h2 className="mb-1 text-lg font-bold text-[var(--color-foreground)]">
            {card.title}
          </h2>
          {card.badge && (
            <span className="mb-2 inline-block rounded-full bg-[var(--color-accent)]/20 px-2.5 py-0.5 text-xs font-semibold text-[var(--color-accent)]">
              {card.badge}
            </span>
          )}
          <p className="text-sm leading-relaxed text-[var(--color-muted)]">
            {card.description}
          </p>
        </div>

        {/* Progress dots */}
        <div className="mb-5 flex items-center justify-center gap-2">
          {TOUR_CARDS.map((_, i) => (
            <div
              key={i}
              className={`h-2 w-2 rounded-full transition-colors ${
                i === currentStep
                  ? "bg-[var(--color-accent)]"
                  : "bg-[var(--color-surface-light)]"
              }`}
            />
          ))}
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-2">
          <button
            onClick={handleNext}
            className="w-full rounded-lg bg-[var(--color-accent)] px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-blue-600 active:bg-blue-700"
          >
            {isLast ? "Get Started" : "Next"}
          </button>
          {!isLast && (
            <button
              onClick={handleSkip}
              className="w-full py-2 text-sm text-[var(--color-muted)] transition-colors hover:text-[var(--color-foreground)]"
            >
              Skip Tour
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
