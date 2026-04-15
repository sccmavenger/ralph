import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { stripe } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";

export async function POST() {
  const session = await getSession();
  if (!session.scopelyId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const commander = await prisma.commander.findUnique({
    where: { scopelyId: session.scopelyId },
    select: {
      stripeSubscriptionId: true,
    },
  });

  if (!commander?.stripeSubscriptionId) {
    return NextResponse.json(
      { error: "No active subscription" },
      { status: 400 }
    );
  }

  const subscription = await stripe.subscriptions.update(
    commander.stripeSubscriptionId,
    { cancel_at_period_end: true }
  );

  // Get period end from the first subscription item
  const item = subscription.items.data[0];
  const periodEnd = item?.current_period_end
    ? new Date(item.current_period_end * 1000)
    : null;

  return NextResponse.json({
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
    currentPeriodEnd: periodEnd?.toISOString() ?? null,
  });
}
