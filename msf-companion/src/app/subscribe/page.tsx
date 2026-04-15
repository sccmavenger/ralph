import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { getSubscriptionTier, isPremium } from "@/lib/subscription";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";
import DesktopGate from "../components/DesktopGate";
import PricingComparison from "../components/PricingComparison";
import SubscribeForm from "./SubscribeForm";

export const metadata: Metadata = {
  title: "Premium Subscription — MSF Companion",
  description:
    "Unlock the full MSF Companion experience. AI Advisor, Team Builder, Dark Dimension Planner, and more for just $1.99/month.",
};

export default async function SubscribePage() {
  const session = await getSession();

  if (!session.accessToken) {
    redirect("/");
  }

  const tier = await getSubscriptionTier();
  const premium = isPremium(tier);

  // Get subscription details for premium users
  let currentPeriodEnd: string | null = null;
  let cancelAtPeriodEnd = false;
  if (premium && session.scopelyId) {
    const commander = await prisma.commander.findUnique({
      where: { scopelyId: session.scopelyId },
      select: { stripeSubscriptionId: true, stripeCurrentPeriodEnd: true },
    });
    if (commander?.stripeSubscriptionId) {
      try {
        const sub = await stripe.subscriptions.retrieve(
          commander.stripeSubscriptionId
        );
        cancelAtPeriodEnd = sub.cancel_at_period_end;
      } catch {
        // Non-critical — Stripe key may not be set in dev
      }
    }
    if (commander?.stripeCurrentPeriodEnd) {
      currentPeriodEnd = commander.stripeCurrentPeriodEnd.toISOString();
    }
  }

  return (
    <DesktopGate>
      <div className="flex min-h-screen flex-col px-6 py-8">
        <h1 className="mb-6 text-center text-2xl font-bold text-[var(--color-foreground)]">
          Upgrade to Premium
        </h1>

        {/* Comparison */}
        <div className="mb-8">
          <PricingComparison />
        </div>

        {/* Payment Form */}
        <SubscribeForm
          isPremium={premium}
          currentPeriodEnd={currentPeriodEnd}
          cancelAtPeriodEnd={cancelAtPeriodEnd}
        />

        {/* Back */}
        <a
          href="/dashboard"
          className="mt-6 text-center text-xs text-[var(--color-accent)] hover:underline"
        >
          ← Back to app
        </a>
      </div>
    </DesktopGate>
  );
}
