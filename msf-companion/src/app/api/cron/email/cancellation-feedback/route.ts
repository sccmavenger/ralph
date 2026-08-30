import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";
import { isAuthorizedCronRequest } from "@/lib/cron-auth";
import {
  cancellationFeedbackEmailMode,
  emailTestRecipient,
} from "@/lib/email-automation";
import { hashEmailAddress, sendTrackedEmail } from "@/lib/email";
import {
  CANCELLATION_FEEDBACK_REASONS,
  cancellationFeedbackUrl,
  type CancellationFeedbackReason,
} from "@/lib/cancellation-feedback";
import {
  buildCancellationFeedbackEmailHtml,
  CANCELLATION_FEEDBACK_EMAIL_SUBJECT,
} from "@/lib/cancellation-feedback-email";
import { isVoluntaryCancellation } from "@/lib/cancellation-feedback-cases";

export const dynamic = "force-dynamic";

const DAY_MS = 24 * 60 * 60 * 1000;
const COOLDOWN_MS = 180 * DAY_MS;
const EMAIL_WAIT_MS = 30 * DAY_MS;
const LIVE_SEND_INTERVAL_MS = 550;
const COMPLETED_DELIVERY_STATUSES = ["sent", "delivered", "opened", "clicked"];

async function suppressCase(id: string, reason: string) {
  await prisma.cancellationFeedbackCase.update({
    where: { id },
    data: { outreachStatus: "suppressed", suppressionReason: reason },
  });
}

function sameMailbox(left: string, right: string): boolean {
  return left.trim().toLowerCase() === right.trim().toLowerCase();
}

export async function POST(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const mode = cancellationFeedbackEmailMode();
  if (mode === "disabled") {
    return NextResponse.json({ mode, scanned: 0, sent: 0, suppressed: 0, skipped: 0, failed: 0 });
  }

  const now = new Date();
  const testRecipient = emailTestRecipient();
  const cases = await prisma.cancellationFeedbackCase.findMany({
    where: {
      outreachStatus: { in: ["queued", "failed"] },
      cancellationReversedAt: null,
      scheduledAt: { lte: now },
    },
    include: {
      commander: {
        select: {
          id: true,
          email: true,
          displayName: true,
          disabled: true,
          emailAnnouncements: true,
          emailConsentSource: true,
        },
      },
    },
    orderBy: { scheduledAt: "asc" },
    take: 50,
  });

  let sent = 0;
  let suppressed = 0;
  let skipped = 0;
  let failed = 0;
  let attempted = 0;

  for (const feedbackCase of cases) {
    const commander = feedbackCase.commander;
    const email = commander?.email?.trim() ?? "";

    if (mode === "test" && (!testRecipient || !email || !sameMailbox(email, testRecipient))) {
      skipped++;
      continue;
    }

    if (!commander || commander.disabled) {
      await suppressCase(feedbackCase.id, commander ? "commander_disabled" : "commander_deleted");
      suppressed++;
      continue;
    }

    if (!email) {
      if (now.getTime() - feedbackCase.cancellationRequestedAt.getTime() < EMAIL_WAIT_MS) {
        await prisma.cancellationFeedbackCase.update({
          where: { id: feedbackCase.id },
          data: {
            scheduledAt: new Date(now.getTime() + DAY_MS),
            suppressionReason: "awaiting_email",
          },
        });
        skipped++;
      } else {
        await suppressCase(feedbackCase.id, "missing_email");
        suppressed++;
      }
      continue;
    }
    if (!commander.emailConsentSource) {
      await suppressCase(feedbackCase.id, "missing_consent");
      suppressed++;
      continue;
    }
    if (!commander.emailAnnouncements) {
      await suppressCase(feedbackCase.id, "announcement_preference_disabled");
      suppressed++;
      continue;
    }

    try {
      const subscription = await stripe.subscriptions.retrieve(
        feedbackCase.stripeSubscriptionId
      );
      const stillCanceled =
        subscription.cancel_at_period_end ||
        (subscription.status === "canceled" &&
          (isVoluntaryCancellation(subscription) || Boolean(feedbackCase.cancellationEffectiveAt)));
      if (!stillCanceled) {
        await prisma.cancellationFeedbackCase.update({
          where: { id: feedbackCase.id },
          data: {
            outreachStatus: "canceled",
            suppressionReason: "cancellation_reversed",
            cancellationReversedAt: now,
          },
        });
        skipped++;
        continue;
      }
    } catch (error) {
      // A deleted Stripe subscription is still valid if its webhook already
      // recorded the effective cancellation. Other lookup failures retry.
      if (!feedbackCase.cancellationEffectiveAt) {
        await prisma.cancellationFeedbackCase.update({
          where: { id: feedbackCase.id },
          data: { outreachStatus: "failed", suppressionReason: "stripe_verification_failed" },
        });
        console.warn(
          `[Cancellation feedback] Stripe verification failed for case ${feedbackCase.id}: ${
            error instanceof Error ? error.message.slice(0, 300) : String(error).slice(0, 300)
          }`
        );
        failed++;
        continue;
      }
    }

    const recipientHash = hashEmailAddress(email);
    const idempotencyKey = `cancellation-feedback:v1:${feedbackCase.cancellationKey}`;
    const [hardSuppression, recentInvitation] = await Promise.all([
      prisma.emailDelivery.findFirst({
        where: {
          recipientHash,
          OR: [
            { status: { in: ["bounced", "complained"] } },
            { status: "suppressed", attemptCount: { gt: 0 } },
          ],
        },
        select: { id: true },
      }),
      prisma.emailDelivery.findFirst({
        where: {
          recipientHash,
          messageType: "cancellation_feedback",
          idempotencyKey: { not: idempotencyKey },
          status: { in: COMPLETED_DELIVERY_STATUSES },
          sentAt: { gte: new Date(now.getTime() - COOLDOWN_MS) },
        },
        select: { id: true },
      }),
    ]);
    if (hardSuppression || recentInvitation) {
      await suppressCase(
        feedbackCase.id,
        hardSuppression ? "delivery_suppression" : "feedback_cooldown"
      );
      suppressed++;
      continue;
    }

    const reasonUrls = Object.fromEntries(
      CANCELLATION_FEEDBACK_REASONS.map(({ id }) => [
        id,
        cancellationFeedbackUrl({
          commanderId: commander.id,
          caseId: feedbackCase.id,
          reason: id,
        }),
      ])
    ) as Record<CancellationFeedbackReason, string>;

    if (mode === "live" && attempted > 0) {
      await new Promise((resolve) => setTimeout(resolve, LIVE_SEND_INTERVAL_MS));
    }
    attempted++;

    try {
      const result = await sendTrackedEmail({
        commanderId: commander.id,
        to: email,
        subject: CANCELLATION_FEEDBACK_EMAIL_SUBJECT,
        html: buildCancellationFeedbackEmailHtml({
          displayName: commander.displayName ?? "Commander",
          reasonUrls,
        }),
        messageType: "cancellation_feedback",
        idempotencyKey,
        preference: "announcements",
        metadata: {
          automationMode: mode,
          cancellationCaseId: feedbackCase.id,
          cancellationKey: feedbackCase.cancellationKey,
          stripeSubscriptionId: feedbackCase.stripeSubscriptionId,
        },
      });

      if (result.status === "suppressed") {
        await suppressCase(feedbackCase.id, "preference_changed");
        suppressed++;
      } else {
        await prisma.cancellationFeedbackCase.update({
          where: { id: feedbackCase.id },
          data: {
            outreachStatus: "sent",
            suppressionReason: null,
          },
        });
        if (result.status === "sent") sent++;
      }
    } catch (error) {
      await prisma.cancellationFeedbackCase.update({
        where: { id: feedbackCase.id },
        data: { outreachStatus: "failed", suppressionReason: "provider_error" },
      });
      console.warn(
        `[Cancellation feedback] Delivery failed for case ${feedbackCase.id}: ${
          error instanceof Error
            ? error.message.replaceAll(email, "[recipient]").slice(0, 300)
            : String(error).slice(0, 300)
        }`
      );
      failed++;
    }
  }

  return NextResponse.json({
    mode,
    scanned: cases.length,
    sent,
    suppressed,
    skipped,
    failed,
  });
}
