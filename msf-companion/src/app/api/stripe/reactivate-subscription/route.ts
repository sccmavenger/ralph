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
    select: { stripeSubscriptionId: true },
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

  return NextResponse.json({ reactivated: true });
}
