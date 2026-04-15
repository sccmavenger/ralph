import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";

export type SubscriptionTier = "FREE" | "PREMIUM";

/**
 * Get the subscription tier for the current user.
 * Respects OVERRIDE_TIER env var for testing.
 */
export async function getSubscriptionTier(): Promise<SubscriptionTier> {
  // Allow override for E2E testing
  const override = process.env.OVERRIDE_TIER;
  if (override === "PREMIUM") return "PREMIUM";

  const session = await getSession();
  if (!session.scopelyId) return "FREE";

  const commander = await prisma.commander.findUnique({
    where: { scopelyId: session.scopelyId },
    select: { subscriptionTier: true },
  });

  return (commander?.subscriptionTier as SubscriptionTier) ?? "FREE";
}

export function isPremium(tier: SubscriptionTier): boolean {
  return tier === "PREMIUM";
}
