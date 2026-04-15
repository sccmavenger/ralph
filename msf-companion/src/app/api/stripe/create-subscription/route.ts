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
      id: true,
      stripeCustomerId: true,
      stripeSubscriptionId: true,
      subscriptionTier: true,
    },
  });

  if (!commander) {
    return NextResponse.json({ error: "Commander not found" }, { status: 404 });
  }

  // Check if already has an active subscription
  if (commander.stripeSubscriptionId) {
    try {
      const existingSub = await stripe.subscriptions.retrieve(
        commander.stripeSubscriptionId
      );
      if (existingSub.status === "active" || existingSub.status === "trialing") {
        if (existingSub.cancel_at_period_end) {
          return NextResponse.json(
            { error: "Subscription is scheduled to cancel. Use reactivation instead." },
            { status: 409 }
          );
        }
        return NextResponse.json(
          { error: "Already subscribed" },
          { status: 400 }
        );
      }
    } catch {
      // Subscription not found in Stripe — allow creating a new one
    }
  }

  // Create or reuse Stripe Customer
  let stripeCustomerId = commander.stripeCustomerId;
  if (!stripeCustomerId) {
    const customer = await stripe.customers.create({
      metadata: { scopelyId: session.scopelyId },
    });
    stripeCustomerId = customer.id;
    await prisma.commander.update({
      where: { id: commander.id },
      data: { stripeCustomerId },
    });
  }

  // Create subscription with incomplete payment
  const priceId = process.env.STRIPE_PRICE_ID;
  if (!priceId) {
    return NextResponse.json(
      { error: "Stripe price not configured" },
      { status: 500 }
    );
  }

  const subscription = await stripe.subscriptions.create({
    customer: stripeCustomerId,
    items: [{ price: priceId }],
    payment_behavior: "default_incomplete",
    payment_settings: {
      save_default_payment_method: "on_subscription",
    },
  });

  // Store subscription ID
  await prisma.commander.update({
    where: { id: commander.id },
    data: { stripeSubscriptionId: subscription.id },
  });

  // In Stripe API v2025+/SDK v22, payment_intent is no longer on the Invoice object.
  // The PI is still auto-created — retrieve it from the customer's recent PaymentIntents.
  const paymentIntents = await stripe.paymentIntents.list({
    customer: stripeCustomerId,
    limit: 1,
  });

  const clientSecret = paymentIntents.data[0]?.client_secret;

  if (!clientSecret) {
    return NextResponse.json(
      { error: "Failed to initialize payment" },
      { status: 500 }
    );
  }

  return NextResponse.json({
    clientSecret,
    subscriptionId: subscription.id,
  });
}
