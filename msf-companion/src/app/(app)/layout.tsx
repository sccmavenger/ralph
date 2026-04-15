import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { getValidAccessToken } from "@/lib/auth";
import { getScopelyId } from "@/lib/scopely-id";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = {
  title: "Dashboard — MSF Companion",
  description:
    "Your MSF Companion dashboard. View roster, track progress, and manage your Marvel Strike Force account.",
};
import { msfApiFetch } from "@/lib/msf-api";
import { getSubscriptionTier } from "@/lib/subscription";
import DesktopGate from "../components/DesktopGate";
import BottomTabBar from "../components/BottomTabBar";
import AppHeader from "../components/AppHeader";
import PostLoginGate from "../components/PostLoginGate";
import InstallAppModal from "../components/InstallAppModal";
import PaywallGate from "../components/PaywallGate";
import PushNotificationPrompt from "../components/PushNotificationPrompt";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Check if token is still valid (no refresh — that requires Route Handler)
  const token = await getValidAccessToken();

  if (!token) {
    // Token expired or missing — try refresh via Route Handler
    redirect("/api/auth/refresh?redirect=/dashboard");
  }

  const session = await getSession();

  // Determine current path for paywall enforcement
  const tier = await getSubscriptionTier();

  // Resolve scopelyId — falls back to Hydra userinfo for opaque tokens
  const scopelyId = await getScopelyId(false); // Server Component: can't save session

  // Fetch commander data in one query
  let displayName = "Commander";
  let portrait: string | null = null;
  let showEmailModal = false;
  let showOnboarding = false;

  if (scopelyId) {
    const commander = await prisma.commander.findUnique({
      where: { scopelyId },
      select: {
        displayName: true,
        email: true,
        emailPromptSkippedAt: true,
        hasCompletedOnboarding: true,
        onboardingLastShownAt: true,
        disabled: true,
      },
    });
    if (commander) {
      // Check if account is disabled
      if (commander.disabled) {
        return (
          <DesktopGate>
            <div className="flex min-h-screen flex-col items-center justify-center bg-[var(--color-background)] px-6 text-center">
              <div className="text-4xl mb-4">🚫</div>
              <h1 className="text-xl font-bold text-[var(--color-foreground)] mb-2">
                Account Disabled
              </h1>
              <p className="text-[var(--color-muted)]">
                Your account has been disabled. Contact support.
              </p>
            </div>
          </DesktopGate>
        );
      }

      if (commander.displayName) displayName = commander.displayName;
      if (!commander.email) {
        const ONE_DAY_MS = 24 * 60 * 60 * 1000;
        if (
          !commander.emailPromptSkippedAt ||
          Date.now() - commander.emailPromptSkippedAt.getTime() > ONE_DAY_MS
        ) {
          showEmailModal = true;
        }
      }
      // Show tour if never completed OR if last shown more than 7 days ago
      const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
      if (
        !commander.hasCompletedOnboarding ||
        !commander.onboardingLastShownAt ||
        Date.now() - commander.onboardingLastShownAt.getTime() > SEVEN_DAYS_MS
      ) {
        showOnboarding = true;
      }
    } else {
      // Commander record is null — was deleted by admin
      // Clear session and redirect to landing page
      redirect("/api/auth/logout");
    }

    // Try to get name and portrait from MSF API and persist it
    try {
      const card = await msfApiFetch<{ data?: { name?: string; icon?: string } }>({
        path: "/player/v1/card",
        accessToken: token,
      });
      if (card.data?.icon) portrait = card.data.icon;
      if (card.data?.name) {
        displayName = card.data.name;
        // Persist to DB so it's cached for future loads
        await prisma.commander.upsert({
          where: { scopelyId },
          create: { scopelyId, displayName: card.data.name },
          update: { displayName: card.data.name },
        }).catch(() => {});
      }
    } catch {
      // Non-critical
    }
  }

  return (
    <DesktopGate>
      <div className="flex min-h-screen flex-col">
        <AppHeader displayName={displayName} portrait={portrait} />
        <main className="flex-1 overflow-y-auto pb-20">
          <PaywallGate tier={tier}>{children}</PaywallGate>
        </main>
        <BottomTabBar />
        <InstallAppModal />
        <PushNotificationPrompt />
        {(showEmailModal || showOnboarding) && (
          <PostLoginGate
            showEmailModal={showEmailModal}
            showOnboarding={showOnboarding}
          />
        )}
      </div>
    </DesktopGate>
  );
}
