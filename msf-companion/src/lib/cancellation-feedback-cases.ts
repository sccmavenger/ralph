import type Stripe from "stripe";
import { prisma } from "@/lib/prisma";

const DAY_MS = 24 * 60 * 60 * 1000;

type SubscriptionWithLegacyPeriodEnd = Stripe.Subscription & {
  current_period_end?: number;
};

function epochDate(value: number | null | undefined): Date | null {
  return typeof value === "number" && Number.isFinite(value)
    ? new Date(value * 1000)
    : null;
}
function periodEndEpoch(subscription: Stripe.Subscription): number | null {
  const itemEnd = subscription.items.data[0]?.current_period_end;
  return itemEnd ?? (subscription as SubscriptionWithLegacyPeriodEnd).current_period_end ?? null;
}

/** A stable identifier for one cancellation cycle on a Stripe subscription. */
export function cancellationKeyForSubscription(
  subscription: Stripe.Subscription
): string {
  const cycleTimestamp =
    subscription.canceled_at ??
    subscription.cancel_at ??
    periodEndEpoch(subscription) ??
    subscription.start_date;
  return `${subscription.id}:${cycleTimestamp}`;
}

export function isVoluntaryCancellation(
  subscription: Stripe.Subscription
): boolean {
  return subscription.cancellation_details?.reason === "cancellation_requested";
}

export async function queueCancellationFeedbackCase({
  commanderId,
  subscription,
  now = new Date(),
}: {
  commanderId: string;
  subscription: Stripe.Subscription;
  now?: Date;
}) {
  const requestedAt = epochDate(subscription.canceled_at) ?? now;
  const scheduledAt = new Date(requestedAt.getTime() + DAY_MS);
  const effectiveAt = subscription.status === "canceled"
    ? epochDate(subscription.ended_at) ?? now
    : null;

  return prisma.cancellationFeedbackCase.upsert({
    where: { cancellationKey: cancellationKeyForSubscription(subscription) },
    create: {
      commanderId,
      cancellationKey: cancellationKeyForSubscription(subscription),
      stripeSubscriptionId: subscription.id,
      cancellationRequestedAt: requestedAt,
      cancellationEffectiveAt: effectiveAt,
      scheduledAt,
    },
    update: {
      commanderId,
      cancellationRequestedAt: requestedAt,
      ...(effectiveAt ? { cancellationEffectiveAt: effectiveAt } : {}),
    },
  });
}

/**
 * Records that a cancellation was reversed. Queued/failed outreach is canceled;
 * already-sent history remains intact and simply records the reversal time.
 */
export async function markCancellationFeedbackReactivated({
  commanderId,
  stripeSubscriptionId,
  at = new Date(),
}: {
  commanderId: string;
  stripeSubscriptionId: string;
  at?: Date;
}): Promise<number> {
  const [pending, completed] = await prisma.$transaction([
    prisma.cancellationFeedbackCase.updateMany({
      where: {
        commanderId,
        stripeSubscriptionId,
        cancellationReversedAt: null,
        outreachStatus: { in: ["queued", "failed"] },
      },
      data: {
        cancellationReversedAt: at,
        outreachStatus: "canceled",
        suppressionReason: "cancellation_reversed",
      },
    }),
    prisma.cancellationFeedbackCase.updateMany({
      where: {
        commanderId,
        stripeSubscriptionId,
        cancellationReversedAt: null,
        outreachStatus: { notIn: ["queued", "failed"] },
      },
      data: { cancellationReversedAt: at },
    }),
  ]);
  return pending.count + completed.count;
}
