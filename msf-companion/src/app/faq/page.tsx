"use client";

import { useState } from "react";
import Link from "next/link";
import DesktopGate from "@/app/components/DesktopGate";

// Note: metadata must be exported from a separate layout or page.tsx
// For client components, metadata is set via the parent layout or a separate layout.tsx

interface FaqItem {
  question: string;
  answer: string;
}

interface FaqSection {
  title: string;
  items: FaqItem[];
}

const FAQ_SECTIONS: FaqSection[] = [
  {
    title: "Security & Data",
    items: [
      {
        question: "Is my account safe? Will I get banned?",
        answer:
          "No need to worry! MSF Companion uses the official Scopely OAuth system — the same secure authentication that powers Scopely's own services. We never see or store your password. Since we only use the official public API with read-only access, there's no risk to your account. This isn't a bot, hack, or exploit — it's a legitimate companion tool built on the same API that Scopely provides to developers.",
      },
      {
        question: "What data does this app access?",
        answer:
          "We only access what's needed to power the features you see: your commander profile, roster (characters with their levels, gear, and stars), and inventory (gear pieces, ability materials, gold, and other resources) — all through the official MSF API. We can't see your purchase history, payment info, or any private account details. And since the API is read-only, we can never make changes to your account.",
      },
      {
        question: "Is my data secure?",
        answer:
          "Your data is well-protected. Your session uses encrypted HTTP-only cookies, so your tokens are never stored in the browser or exposed to JavaScript. All communication happens over HTTPS, and we use OAuth 2.0 with PKCE (Proof Key for Code Exchange) to keep the login flow secure from start to finish.",
      },
      {
        question: "Do you store my data?",
        answer:
          "Each time you log in, we save a snapshot of your roster and resources so you can track your progress over time and still view your data if the game servers happen to be down. Your commander name and optional email are also stored. We never sell, share, or use your data for anything other than the features in this app.",
      },
      {
        question: "What are progress snapshots?",
        answer:
          "Snapshots are automatic saves of your roster and resource inventory that happen each time you log in. Over time, they let you see how your account is growing — which characters you've upgraded, how your collection power has changed, and how your resources have shifted. You can view your snapshot count on the Profile page, and delete them anytime if you'd like.",
      },
      {
        question: "Why do you need my email?",
        answer:
          "Totally optional! If you share it, we'll only use it for important updates about MSF Companion — like new features or service changes. You can skip it entirely and still use everything in the app. Add or remove your email anytime from the Profile page.",
      },
      {
        question: "Why is this app mobile-only?",
        answer:
          "MSF Companion is designed as a mobile-first experience to match how most commanders play — on their phones. The mobile layout lets us deliver a fast, focused, app-like experience built for touch and one-handed use. You can add it to your home screen for instant access, just like a native app.",
      },
    ],
  },
  {
    title: "Subscription & Billing",
    items: [
      {
        question: "How much does Premium cost?",
        answer:
          "Great question! Premium is just $1.99/month. It unlocks the full suite of advanced tools — Heroes, Teams, Analyze, Planner, Inventory, Profile features, and advanced roster filters. Most core features like the Dashboard, basic Roster view, character details, Commander profile, and this FAQ page are completely free!",
      },
      {
        question: "What do I get with Premium?",
        answer:
          "Premium unlocks: Heroes (full hero database), Teams (team builder & meta analysis), Analyze (deep roster analytics), Planner (event & upgrade planning), Inventory (gear & resource tracking), Profile (detailed commander stats), and advanced roster filters. Free features include: Dashboard, basic Roster view, character details, Commander profile, and FAQ.",
      },
      {
        question: "How do I cancel my subscription?",
        answer:
          "No worries! You can cancel anytime from the Profile page — just tap the cancel button under your subscription details. Your premium access will continue until the end of your current billing period, so you won't lose anything right away. You can always resubscribe later if you change your mind.",
      },
      {
        question: "Will I lose my data if I cancel?",
        answer:
          "Not at all! All your data — roster snapshots, progress history, and profile info — stays safe and sound even if you cancel. You'll just lose access to premium features until you resubscribe. Your free features like the Dashboard and basic Roster view will still work as usual.",
      },
      {
        question: "Can I get a refund?",
        answer:
          "We handle refund requests on a case-by-case basis. If you'd like to request a refund, just drop us an email at info@themsftoolkit.com and we'll do our best to help you out!",
      },
      {
        question: "How do I reactivate my subscription?",
        answer:
          "Easy! Just head to the Profile page or the subscribe page and tap the subscribe button. You'll be back to Premium in no time. Your data and progress are all still there waiting for you.",
      },
      {
        question: "Why was I charged after cancelling?",
        answer:
          "No worries — this usually happens if the cancellation was processed after the billing cycle had already renewed. Your access will still run until the end of that paid period. If something looks off, reach out to us at info@themsftoolkit.com and we'll sort it out for you!",
      },
    ],
  },
  {
    title: "AI Advisor",
    items: [
      {
        question: "What is the AI Roster Advisor?",
        answer:
          "The AI Roster Advisor is your personal MSF strategy coach. It uses your actual roster data combined with a curated knowledge base of top MSF creator insights (from YouTubers like ValleyFlyin, Boilon, OhEmGee, and more) to give you personalized, actionable advice. Ask it anything — team comps, farming priorities, Dark Dimension planning, or Crucible strategy.",
      },
      {
        question: "How many questions can I ask?",
        answer:
          "Free users get 3 questions per day — more than enough to get quick advice on key decisions. Premium users get unlimited questions, conversation history, and source citations showing which MSF creators' insights informed the answer.",
      },
      {
        question: "Where does the AI get its information?",
        answer:
          "The advisor combines a powerful AI model with a curated knowledge base built from real MSF YouTube creator content. We transcribe and index videos from top creators so the advisor's answers reflect the community's best strategies — not just generic AI guesses. The knowledge base is refreshed regularly to stay current with the meta.",
      },
      {
        question: "How accurate is the advice?",
        answer:
          "Each response includes a confidence indicator (High, Medium, or Low) so you know how well-supported the answer is. High confidence means the answer is backed by multiple creator sources. The system also learns from feedback — if you thumbs-down a response, it automatically works to improve answers for similar questions in the future.",
      },
      {
        question: "Can I see conversation history?",
        answer:
          "Premium users can! Your conversations are saved and accessible from the sidebar. You can revisit past advice, continue a conversation, or start a new one. Free users start fresh each session.",
      },
      {
        question: "What if the AI gives wrong advice?",
        answer:
          "Use the thumbs-down button! Your feedback directly improves the system. When you flag a bad response, the system automatically identifies the knowledge gap and generates better content to handle similar questions next time. You can also leave a comment explaining what was wrong to help us improve even faster.",
      },
    ],
  },
  {
    title: "Features & Tools",
    items: [
      {
        question: "What can I do with the Roster Tracker?",
        answer:
          "The Roster Tracker shows all your characters with their power, stars, gear tier, and more. It syncs automatically from the MSF API each time you log in, so your data is always fresh. You can sort, filter, and search your roster to find exactly what you need.",
      },
      {
        question: "What is the Team Builder?",
        answer:
          "The Team Builder (Premium) lets you assemble teams and see synergy scores, total power, and how they compare to meta compositions. You can also get AI-powered character suggestions to fill empty slots based on team synergy and your available roster.",
      },
      {
        question: "How do Progress Snapshots work?",
        answer:
          "Every time you log in, we automatically save a snapshot of your roster and resources. Over time, these snapshots let you see exactly how your account has grown — upgraded characters, power increases, and resource changes. Think of it as your MSF growth timeline.",
      },
      {
        question: "What is the Planner?",
        answer:
          "The Planner (Premium) helps you plan for upcoming events, track farming goals, and prioritize your daily activities. It combines your roster data with event schedules to show you what to focus on right now for maximum progress.",
      },
      {
        question: "Can I use MSF Companion on desktop?",
        answer:
          "MSF Companion is designed as a mobile-first experience to match how most commanders play. For the best experience, visit us on your phone's browser and add it to your home screen — it works just like a native app with offline support!",
      },
    ],
  },
  {
    title: "Account & Troubleshooting",
    items: [
      {
        question: "How do I add MSF Companion to my home screen?",
        answer:
          "On iOS Safari: tap the Share button (square with arrow) → 'Add to Home Screen'. On Android Chrome: tap the three-dot menu → 'Add to Home Screen' or 'Install App'. You'll get an app icon and instant access without opening your browser!",
      },
      {
        question: "Why can't I see my roster after logging in?",
        answer:
          "This usually happens if the MSF API is temporarily slow or down. Try refreshing the page or logging out and back in. If the issue persists, the game servers might be under maintenance — check the official MSF channels for status updates.",
      },
      {
        question: "How do I delete my account and data?",
        answer:
          "Head to the Profile page and look for the data management options. You can delete your snapshots individually or contact us at info@themsftoolkit.com to request complete account deletion. We'll remove all your data within 48 hours.",
      },
      {
        question: "I found a bug — how do I report it?",
        answer:
          "We appreciate bug reports! The fastest way is through our Discord server — there's a dedicated channel for bug reports. You can also email us at info@themsftoolkit.com with a description of the issue and screenshots if possible.",
      },
    ],
  },
];

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      className={`h-5 w-5 shrink-0 text-[var(--color-muted)] transition-transform duration-200 ${open ? "rotate-180" : ""}`}
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={2}
      stroke="currentColor"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
  );
}

function AccordionItem({ item }: { item: FaqItem }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-xl bg-[var(--color-surface)]">
      <button
        onClick={() => setOpen((prev) => !prev)}
        className="flex w-full items-center justify-between px-5 py-4 text-left"
      >
        <span className="pr-4 text-sm font-semibold text-[var(--color-foreground)]">
          {item.question}
        </span>
        <ChevronIcon open={open} />
      </button>
      {open && (
        <div className="border-t border-[var(--color-surface-light)] px-5 pb-4 pt-3">
          <p className="text-sm leading-relaxed text-[var(--color-muted)]">
            {item.answer}
          </p>
        </div>
      )}
    </div>
  );
}

export default function FaqPage() {
  return (
    <DesktopGate>
      <div className="min-h-dvh bg-[var(--color-background)]">
        <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-[var(--color-surface-light)] bg-[var(--color-background)]/95 px-4 py-3 backdrop-blur-sm">
          <Link
            href="/"
            className="text-xs text-[var(--color-accent)] hover:underline"
          >
            ← Back
          </Link>
          <h1 className="text-lg font-bold text-[var(--color-foreground)]">
            FAQ
          </h1>
        </div>

        <div className="flex flex-col gap-3 px-4 py-6">
          <p className="mb-2 text-sm text-[var(--color-muted)]">
            Common questions about MSF Companion, security, and your data.
          </p>
          {FAQ_SECTIONS.map((section) => (
            <div key={section.title} className="flex flex-col gap-3">
              <h2 className="mt-2 text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">
                {section.title}
              </h2>
              {section.items.map((item) => (
                <AccordionItem key={item.question} item={item} />
              ))}
            </div>
          ))}
        </div>

        {/* Contact Section */}
        <div className="mx-4 mb-6 rounded-xl bg-[var(--color-surface-light)] p-5 text-center">
          <h2 className="text-base font-bold text-[var(--color-foreground)]">
            Need more help?
          </h2>
          <p className="mt-1 text-sm text-[var(--color-muted)]">
            We&apos;re here to help! Reach out through any of these channels.
          </p>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:justify-center">
            {/* Email */}
            <a
              href="mailto:info@themsftoolkit.com"
              className="flex items-center justify-center gap-2 rounded-lg bg-[var(--color-surface)] px-4 py-3 text-sm font-medium text-[var(--color-foreground)] transition-colors hover:bg-[var(--color-background)]"
            >
              <svg className="h-5 w-5 shrink-0 text-[var(--color-accent)]" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
              </svg>
              Email
            </a>
            {/* Discord */}
            <a
              href="https://discord.gg/yyTq7KfX"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 rounded-lg bg-[var(--color-surface)] px-4 py-3 text-sm font-medium text-[var(--color-foreground)] transition-colors hover:bg-[var(--color-background)]"
            >
              <svg className="h-5 w-5 shrink-0 text-[var(--color-accent)]" viewBox="0 0 24 24" fill="currentColor">
                <path d="M20.317 4.37a19.791 19.791 0 00-4.885-1.515.074.074 0 00-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 00-5.487 0 12.64 12.64 0 00-.617-1.25.077.077 0 00-.079-.037A19.736 19.736 0 003.677 4.37a.07.07 0 00-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 00.031.057 19.9 19.9 0 005.993 3.03.078.078 0 00.084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 00-.041-.106 13.107 13.107 0 01-1.872-.892.077.077 0 01-.008-.128 10.2 10.2 0 00.372-.292.074.074 0 01.077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 01.078.01c.12.098.246.198.373.292a.077.077 0 01-.006.127 12.299 12.299 0 01-1.873.892.077.077 0 00-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 00.084.028 19.839 19.839 0 006.002-3.03.077.077 0 00.032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 00-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
              </svg>
              Discord
            </a>
            {/* Instagram */}
            <a
              href="https://www.instagram.com/msf_toolkit/"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 rounded-lg bg-[var(--color-surface)] px-4 py-3 text-sm font-medium text-[var(--color-foreground)] transition-colors hover:bg-[var(--color-background)]"
            >
              <svg className="h-5 w-5 shrink-0 text-[var(--color-accent)]" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" />
              </svg>
              Instagram
            </a>
          </div>
          <div className="mt-4 flex items-center justify-center gap-3 text-xs text-[var(--color-muted)]">
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
          </div>
        </div>
      </div>
    </DesktopGate>
  );
}
