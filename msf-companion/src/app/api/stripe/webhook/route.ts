import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";
import { buildWelcomeEmailHtml } from "@/lib/welcome-email";
import Stripe from "stripe";

function getCustomerId(obj: { customer: string | Stripe.Customer | Stripe.DeletedCustomer }): string {
  return typeof obj.customer === "string" ? obj.customer : obj.customer.id;
}

function getPeriodEnd(sub: Stripe.Subscription): Date {
  // In Stripe v22, current_period_end is on subscription items
  const item = sub.items.data[0];
  return new Date((item?.current_period_end ?? sub.start_date) * 1000);
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return NextResponse.json(
      { error: "Webhook secret not configured" },
      { status: 500 }
    );
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  switch (event.type) {
    case "invoice.payment_succeeded": {
      const invoice = event.data.object as Stripe.Invoice;
      const customerId = invoice.customer
        ? typeof invoice.customer === "string"
          ? invoice.customer
          : invoice.customer.id
        : null;
      const subscriptionId =
        invoice.parent?.subscription_details?.subscription;
      if (customerId && subscriptionId) {
        const subId =
          typeof subscriptionId === "string"
            ? subscriptionId
            : subscriptionId.id;
        const sub = await stripe.subscriptions.retrieve(subId);

        // Check if this is a new subscription (commander was FREE) to send welcome email
        const commander = await prisma.commander.findFirst({
          where: { stripeCustomerId: customerId },
          select: { subscriptionTier: true, email: true, displayName: true },
        });
        const isNewSubscription = commander?.subscriptionTier !== "PREMIUM";

        await prisma.commander.updateMany({
          where: { stripeCustomerId: customerId },
          data: {
            subscriptionTier: "PREMIUM",
            stripeCurrentPeriodEnd: getPeriodEnd(sub),
          },
        });

        // Send welcome email for new subscribers
        if (isNewSubscription && commander?.email) {
          try {
            const html = buildWelcomeEmailHtml(commander.displayName ?? "");
            await sendEmail(
              commander.email,
              "Welcome to MSF Companion Premium! 🎉",
              html
            );
          } catch (err) {
            console.warn(`[Stripe] Welcome email failed: ${err}`);
          }
        }
      }
      break;
    }

    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;
      const customerId = getCustomerId(subscription);
      await prisma.commander.updateMany({
        where: { stripeCustomerId: customerId },
        data: {
          subscriptionTier: "FREE",
          stripeSubscriptionId: null,
        },
      });
      break;
    }

    case "customer.subscription.updated": {
      const subscription = event.data.object as Stripe.Subscription;
      const customerId = getCustomerId(subscription);
      if (subscription.status === "active") {
        await prisma.commander.updateMany({
          where: { stripeCustomerId: customerId },
          data: {
            subscriptionTier: "PREMIUM",
            stripeCurrentPeriodEnd: getPeriodEnd(subscription),
          },
        });
      } else if (
        subscription.status === "past_due" ||
        subscription.status === "canceled"
      ) {
        await prisma.commander.updateMany({
          where: { stripeCustomerId: customerId },
          data: {
            subscriptionTier: "FREE",
          },
        });
      }
      break;
    }

    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      const customerId = invoice.customer
        ? typeof invoice.customer === "string"
          ? invoice.customer
          : invoice.customer.id
        : "unknown";
      console.warn(`[Stripe] Payment failed for customer ${customerId}`);
      break;
    }

    default:
      // Acknowledge but ignore unhandled event types
      break;
  }

  return NextResponse.json({ received: true });
}
