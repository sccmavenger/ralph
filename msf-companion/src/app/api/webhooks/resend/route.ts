import { NextResponse } from "next/server";
import { Resend } from "resend";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const progressRank: Record<string, number> = {
  pending: 0,
  sending: 1,
  scheduled: 2,
  delayed: 2,
  sent: 3,
  delivered: 4,
  opened: 5,
  clicked: 6,
};
const terminalStatuses = new Set(["failed", "bounced", "complained", "suppressed"]);

function statusForEvent(type: string): string | null {
  const statuses: Record<string, string> = {
    "email.sent": "sent",
    "email.scheduled": "scheduled",
    "email.delivered": "delivered",
    "email.delivery_delayed": "delayed",
    "email.complained": "complained",
    "email.bounced": "bounced",
    "email.opened": "opened",
    "email.clicked": "clicked",
    "email.failed": "failed",
    "email.suppressed": "suppressed",
  };
  return statuses[type] ?? null;
}

export async function POST(request: Request) {
  const webhookSecret = process.env.RESEND_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return NextResponse.json({ error: "Webhook secret not configured" }, { status: 500 });
  }

  const rawBody = await request.text();
  const headers = {
    id: request.headers.get("svix-id") ?? "",
    timestamp: request.headers.get("svix-timestamp") ?? "",
    signature: request.headers.get("svix-signature") ?? "",
  };
  if (!headers.id || !headers.timestamp || !headers.signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  let event;
  try {
    event = new Resend(process.env.RESEND_API_KEY).webhooks.verify({
      payload: rawBody,
      headers,
      webhookSecret,
    });
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const status = statusForEvent(event.type);
  if (!status || !("email_id" in event.data)) {
    return NextResponse.json({ received: true, ignored: true });
  }

  const delivery = await prisma.emailDelivery.findUnique({
    where: { providerMessageId: event.data.email_id },
    select: { id: true, status: true },
  });
  if (!delivery) {
    return NextResponse.json({ received: true, matched: false });
  }

  const currentRank = progressRank[delivery.status] ?? -1;
  const nextRank = progressRank[status] ?? -1;
  const shouldUpdate =
    terminalStatuses.has(status) ||
    (!terminalStatuses.has(delivery.status) && nextRank >= currentRank);

  if (shouldUpdate) {
    await prisma.emailDelivery.update({
      where: { id: delivery.id },
      data: {
        status,
        ...(["delivered", "opened", "clicked"].includes(status)
          ? { deliveredAt: new Date(event.created_at) }
          : {}),
      },
    });
  }

  return NextResponse.json({ received: true, matched: true });
}
