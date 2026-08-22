import { createHash } from "node:crypto";
import { Resend } from "resend";
import { prisma } from "@/lib/prisma";
import { appendMarketingFooter, emailHtmlToText } from "@/lib/email-content";
import {
  preferenceEnabled,
  type EmailPreferenceKey,
} from "@/lib/email-preferences";
import { unsubscribeUrl } from "@/lib/email-token";

const FROM_ADDRESS =
  process.env.EMAIL_FROM ?? "MSF Companion <info@themsftoolkit.com>";
const REPLY_TO = process.env.EMAIL_REPLY_TO ?? "info@themsftoolkit.com";

export type EmailMessageType =
  | "signup_welcome"
  | "premium_welcome"
  | "payment_failed"
  | "new_character"
  | "weekly_digest"
  | "inactive_winback"
  | "churn_reengage"
  | "churn_retention"
  | "subscription_winback"
  | "announcement";

type EmailMetadata = Record<string, string | number | boolean | null>;

export interface SendTrackedEmailOptions {
  commanderId?: string;
  to: string;
  subject: string;
  html: string;
  text?: string;
  messageType: EmailMessageType;
  idempotencyKey: string;
  preference?: EmailPreferenceKey;
  metadata?: EmailMetadata;
}

export interface SendTrackedEmailResult {
  status: "sent" | "suppressed" | "duplicate";
  providerMessageId?: string;
}

export function hashEmailAddress(email: string): string {
  return createHash("sha256").update(email.trim().toLowerCase()).digest("hex");
}

function safeError(error: unknown, recipient: string): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replaceAll(recipient, "[recipient]").slice(0, 1000);
}

/**
 * The sole web-app email delivery path. It enforces per-category consent,
 * records every attempt, and uses both database and provider idempotency.
 */
export async function sendTrackedEmail(
  options: SendTrackedEmailOptions
): Promise<SendTrackedEmailResult> {
  const recipientHash = hashEmailAddress(options.to);

  if (options.preference) {
    if (!options.commanderId) {
      throw new Error("Marketing email requires a commanderId");
    }

    const commander = await prisma.commander.findUnique({
      where: { id: options.commanderId },
      select: {
        emailWeeklyDigest: true,
        emailNewCharacters: true,
        emailAnnouncements: true,
        emailReengagement: true,
      },
    });

    if (!commander || !preferenceEnabled(commander, options.preference)) {
      await prisma.emailDelivery.upsert({
        where: { idempotencyKey: options.idempotencyKey },
        create: {
          commanderId: options.commanderId,
          recipientHash,
          messageType: options.messageType,
          subject: options.subject,
          idempotencyKey: options.idempotencyKey,
          status: "suppressed",
          ...(options.metadata ? { metadata: options.metadata } : {}),
        },
        update: { status: "suppressed", lastError: null },
      });
      return { status: "suppressed" };
    }
  }

  const delivery = await prisma.emailDelivery.upsert({
    where: { idempotencyKey: options.idempotencyKey },
    create: {
      commanderId: options.commanderId,
      recipientHash,
      messageType: options.messageType,
      subject: options.subject,
      idempotencyKey: options.idempotencyKey,
      ...(options.metadata ? { metadata: options.metadata } : {}),
    },
    update: {
      subject: options.subject,
      ...(options.metadata ? { metadata: options.metadata } : {}),
    },
  });

  if (["sent", "delivered", "opened", "clicked", "suppressed"].includes(delivery.status)) {
    return {
      status: delivery.status === "suppressed" ? "suppressed" : "duplicate",
      providerMessageId: delivery.providerMessageId ?? undefined,
    };
  }

  await prisma.emailDelivery.update({
    where: { id: delivery.id },
    data: {
      status: "sending",
      attemptCount: { increment: 1 },
      lastError: null,
    },
  });

  try {
    if (!process.env.RESEND_API_KEY) {
      throw new Error("RESEND_API_KEY is not configured");
    }

    const resend = new Resend(process.env.RESEND_API_KEY);
    const manageUrl = options.preference
      ? unsubscribeUrl(options.commanderId!, options.preference)
      : null;
    const html = manageUrl
      ? appendMarketingFooter(options.html, manageUrl, options.preference!)
      : options.html;
    const providerIdempotencyKey = createHash("sha256")
      .update(`msf-companion:${options.idempotencyKey}`)
      .digest("hex");

    const { data, error } = await resend.emails.send(
      {
        from: FROM_ADDRESS,
        replyTo: REPLY_TO,
        to: options.to,
        subject: options.subject,
        html,
        text: options.text ?? emailHtmlToText(html),
        ...(manageUrl
          ? {
              headers: {
                "List-Unsubscribe": `<${manageUrl}>`,
                "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
              },
            }
          : {}),
        tags: [
          { name: "application", value: "msf-companion" },
          { name: "message_type", value: options.messageType },
        ],
      },
      { idempotencyKey: providerIdempotencyKey }
    );

    if (error || !data?.id) {
      throw new Error(error?.message ?? "Provider returned no email id");
    }

    await prisma.emailDelivery.update({
      where: { id: delivery.id },
      data: {
        status: "sent",
        providerMessageId: data.id,
        sentAt: new Date(),
      },
    });

    return { status: "sent", providerMessageId: data.id };
  } catch (error) {
    await prisma.emailDelivery.update({
      where: { id: delivery.id },
      data: { status: "failed", lastError: safeError(error, options.to) },
    });
    throw error;
  }
}
