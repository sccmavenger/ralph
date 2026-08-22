import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";
import { sendTrackedEmail } from "@/lib/email";
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

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2002"
  );
}

async function acquireEvent(event: Stripe.Event): Promise<boolean> {
  const existing = await prisma.stripeWebhookEvent.findUnique({
    where: { id: event.id },
  });
  if (existing?.status === "processed" || existing?.status === "processing") {
    return false;
  }
  if (existing) {
    await prisma.stripeWebhookEvent.update({
      where: { id: event.id },
      data: { status: "processing", attempts: { increment: 1 }, lastError: null },
    });
    return true;
  }

  try {
    await prisma.stripeWebhookEvent.create({
      data: { id: event.id, type: event.type },
    });
    return true;
  } catch (error) {
    if (isUniqueConstraintError(error)) return false;
    throw error;
  }
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

  if (!(await acquireEvent(event))) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  try {
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

        const commander = await prisma.commander.findFirst({
          where: { stripeCustomerId: customerId },
          select: { id: true, email: true, displayName: true },
        });
        const isNewSubscription = invoice.billing_reason === "subscription_create";

        await prisma.commander.updateMany({
          where: { stripeCustomerId: customerId },
          data: {
            subscriptionTier: "PREMIUM",
            stripeCurrentPeriodEnd: getPeriodEnd(sub),
          },
        });

        // Send welcome email for new subscribers
        if (isNewSubscription && commander?.email) {
          await sendTrackedEmail({
            commanderId: commander.id,
            to: commander.email,
            subject: "Welcome to MSF Companion Premium! 🎉",
            html: buildWelcomeEmailHtml(commander.displayName ?? ""),
            messageType: "premium_welcome",
            idempotencyKey: `stripe:${event.id}:premium-welcome`,
          });
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

      // Schedule win-back intervention (3 days later)
      const cancelledCommander = await prisma.commander.findFirst({
        where: { stripeCustomerId: customerId },
        select: { id: true, displayName: true },
      });
      if (cancelledCommander) {
        const winBackDate = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
        await prisma.churnIntervention.upsert({
          where: { sourceEventId: event.id },
          update: {},
          create: {
            commanderId: cancelledCommander.id,
            type: "win-back",
            channel: "email",
            riskScore: null,
            scheduledAt: winBackDate,
            delivered: false,
            sourceEventId: event.id,
          },
        });

        // Immediate farewell notification
        await prisma.commanderNotification.create({
          data: {
            commanderId: cancelledCommander.id,
            type: "churn_prevention",
            title: "We're sorry to see you go",
            message: "Your premium features are now paused. You can resubscribe anytime to pick up where you left off.",
            linkUrl: "/subscribe",
          },
        });
      }
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
        : null;

      if (customerId) {
        const failedCommander = await prisma.commander.findFirst({
          where: { stripeCustomerId: customerId },
          select: { id: true, email: true, displayName: true },
        });

        if (failedCommander) {
          // Check cooldown — only one dunning per 7 days
          const lastDunning = await prisma.churnIntervention.findFirst({
            where: { commanderId: failedCommander.id, type: "dunning" },
            orderBy: { sentAt: "desc" },
          });
          const cooldownExpired = !lastDunning || (Date.now() - lastDunning.sentAt.getTime() >= 7 * 24 * 60 * 60 * 1000);

          if (cooldownExpired) {
            // Send dunning email
            if (failedCommander.email) {
              const { buildDunningEmailHtml } = await import("@/lib/churn-emails");
              await sendTrackedEmail({
                commanderId: failedCommander.id,
                to: failedCommander.email,
                subject: "Action needed: update your payment method",
                html: buildDunningEmailHtml(failedCommander.displayName ?? ""),
                messageType: "payment_failed",
                idempotencyKey: `stripe:${event.id}:payment-failed`,
              });
            }

            // Create notification
            await prisma.commanderNotification.create({
              data: {
                commanderId: failedCommander.id,
                type: "churn_prevention",
                title: "Payment issue detected",
                message: "Please update your payment method to continue your premium subscription.",
                linkUrl: "/subscribe",
              },
            });

            // Log intervention
            await prisma.churnIntervention.upsert({
              where: { sourceEventId: event.id },
              update: {},
              create: {
                commanderId: failedCommander.id,
                type: "dunning",
                channel: failedCommander.email ? "both" : "notification",
                riskScore: null,
                delivered: true,
                sourceEventId: event.id,
              },
            });
          }
        }
      }
      break;
    }

    default:
      // Acknowledge but ignore unhandled event types
      break;
    }

    await prisma.stripeWebhookEvent.update({
      where: { id: event.id },
      data: { status: "processed", processedAt: new Date(), lastError: null },
    });
    return NextResponse.json({ received: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await prisma.stripeWebhookEvent.update({
      where: { id: event.id },
      data: { status: "failed", lastError: message.slice(0, 1000) },
    });
    console.error(`[Stripe] Webhook ${event.type} failed: ${message}`);
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
  }
}
