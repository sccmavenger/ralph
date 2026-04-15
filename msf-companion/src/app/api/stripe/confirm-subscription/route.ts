import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { stripe } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";

/**
 * POST /api/stripe/confirm-subscription
 * Called after successful payment redirect to sync subscription status from Stripe.
 * This ensures the DB is updated even if the webhook is delayed.
 */
export async function POST() {
  const session = await getSession();
  if (!session.scopelyId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const commander = await prisma.commander.findUnique({
    where: { scopelyId: session.scopelyId },
    select: { id: true, stripeSubscriptionId: true, stripeCustomerId: true },
  });

  if (!commander?.stripeSubscriptionId) {
    return NextResponse.json({ error: "No subscription found" }, { status: 404 });
  }

  const subscription = await stripe.subscriptions.retrieve(
    commander.stripeSubscriptionId
  );

  if (subscription.status === "active") {
    const item = subscription.items.data[0];
    const periodEnd = new Date(
      (item?.current_period_end ?? subscription.start_date) * 1000
    );

    await prisma.commander.update({
      where: { id: commander.id },
      data: {
        subscriptionTier: "PREMIUM",
        stripeCurrentPeriodEnd: periodEnd,
      },
    });

    return NextResponse.json({ status: "active", tier: "PREMIUM" });
  }

  return NextResponse.json({
    status: subscription.status,
    tier: "FREE",
  });
}
