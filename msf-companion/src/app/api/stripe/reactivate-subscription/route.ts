import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { stripe } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";
import { markCancellationFeedbackReactivated } from "@/lib/cancellation-feedback-cases";

export async function POST() {
  const session = await getSession();
  if (!session.scopelyId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const commander = await prisma.commander.findUnique({
    where: { scopelyId: session.scopelyId },
    select: { id: true, stripeSubscriptionId: true },
  });

  if (!commander?.stripeSubscriptionId) {
    return NextResponse.json(
      { error: "No subscription to reactivate" },
      { status: 400 }
    );
  }

  // Verify subscription is still active and pending cancellation
  const sub = await stripe.subscriptions.retrieve(
    commander.stripeSubscriptionId
  );

  if (sub.status !== "active" && sub.status !== "trialing") {
    return NextResponse.json(
      { error: "Subscription has already expired" },
      { status: 400 }
    );
  }

  if (!sub.cancel_at_period_end) {
    return NextResponse.json(
      { error: "Subscription is not pending cancellation" },
      { status: 400 }
    );
  }

  // Reactivate by removing the cancellation
  await stripe.subscriptions.update(commander.stripeSubscriptionId, {
    cancel_at_period_end: false,
  });

  try {
    await markCancellationFeedbackReactivated({
      commanderId: commander.id,
      stripeSubscriptionId: commander.stripeSubscriptionId,
    });
  } catch (error) {
    // The Stripe webhook repeats this bookkeeping and can recover the queue.
    console.warn(
      `[Cancellation feedback] Could not cancel queued outreach: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }

  return NextResponse.json({ reactivated: true });
}
