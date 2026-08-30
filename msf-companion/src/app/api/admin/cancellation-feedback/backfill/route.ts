import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";
import {
  cancellationKeyForSubscription,
  isVoluntaryCancellation,
  queueCancellationFeedbackCase,
} from "@/lib/cancellation-feedback-cases";
import type Stripe from "stripe";

const LOOKBACK_DAYS = 180;
const MAX_SUBSCRIPTIONS_SCANNED = 2_000;

function customerId(subscription: Stripe.Subscription): string {
  return typeof subscription.customer === "string"
    ? subscription.customer
    : subscription.customer.id;
}
/** One-time, idempotent reconciliation for cancellations predating this queue. */
export async function POST() {
  const authError = await requireAdminSession();
  if (authError) return authError;

  const cutoffEpoch = Math.floor(
    (Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000) / 1000
  );
  const candidates: Stripe.Subscription[] = [];
  let scanned = 0;
  for await (const subscription of stripe.subscriptions.list({
    status: "canceled",
    limit: 100,
  })) {
    scanned++;
    if (
      subscription.canceled_at &&
      subscription.canceled_at >= cutoffEpoch &&
      isVoluntaryCancellation(subscription)
    ) {
      candidates.push(subscription);
    }
    if (scanned >= MAX_SUBSCRIPTIONS_SCANNED) break;
  }

  const customerIds = [...new Set(candidates.map(customerId))];
  const commanders = customerIds.length
    ? await prisma.commander.findMany({
        where: { stripeCustomerId: { in: customerIds } },
        select: { id: true, stripeCustomerId: true },
      })
    : [];
  const commanderByCustomer = new Map(
    commanders
      .filter((commander) => commander.stripeCustomerId)
      .map((commander) => [commander.stripeCustomerId!, commander.id])
  );

  const keys = candidates.map(cancellationKeyForSubscription);
  const existing = keys.length
    ? await prisma.cancellationFeedbackCase.findMany({
        where: { cancellationKey: { in: keys } },
        select: { cancellationKey: true },
      })
    : [];
  const existingKeys = new Set(existing.map((item) => item.cancellationKey));

  let queued = 0;
  let matched = 0;
  for (const subscription of candidates) {
    const commanderId = commanderByCustomer.get(customerId(subscription));
    if (!commanderId) continue;
    matched++;
    await queueCancellationFeedbackCase({ commanderId, subscription });
    if (!existingKeys.has(cancellationKeyForSubscription(subscription))) queued++;
  }

  return NextResponse.json({
    lookbackDays: LOOKBACK_DAYS,
    scanned,
    voluntaryCancellations: candidates.length,
    matchedCommanders: matched,
    queued,
    alreadyQueued: matched - queued,
    scanLimitReached: scanned >= MAX_SUBSCRIPTIONS_SCANNED,
  });
}
