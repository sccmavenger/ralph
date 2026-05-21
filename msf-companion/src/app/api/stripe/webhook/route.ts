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

      // Schedule win-back intervention (3 days later)
      const cancelledCommander = await prisma.commander.findFirst({
        where: { stripeCustomerId: customerId },
        select: { id: true, displayName: true },
      });
      if (cancelledCommander) {
        const winBackDate = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
        await prisma.churnIntervention.create({
          data: {
            commanderId: cancelledCommander.id,
            type: "win-back",
            channel: "email",
            riskScore: null,
            scheduledAt: winBackDate,
            delivered: false,
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
              try {
                const { buildDunningEmailHtml } = await import("@/lib/churn-emails");
                await sendEmail(
                  failedCommander.email,
                  "Action needed: update your payment method",
                  buildDunningEmailHtml(failedCommander.displayName ?? "")
                );
              } catch (err) {
                console.warn(`[Stripe] Dunning email failed: ${err}`);
              }
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
            await prisma.churnIntervention.create({
              data: {
                commanderId: failedCommander.id,
                type: "dunning",
                channel: failedCommander.email ? "both" : "notification",
                riskScore: null,
                delivered: true,
              },
            });
          }
        }
      }

      console.warn(`[Stripe] Payment failed for customer ${customerId ?? "unknown"}`);
      break;
    }

    default:
      // Acknowledge but ignore unhandled event types
      break;
  }

  return NextResponse.json({ received: true });
}
