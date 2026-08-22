import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAuthorizedCronRequest } from "@/lib/cron-auth";
import { emailAutomationMode, emailTestRecipient } from "@/lib/email-automation";
import { sendTrackedEmail } from "@/lib/email";
import { buildWeeklyDigestHtml } from "@/lib/email-templates";

export const dynamic = "force-dynamic";

function utcWeekKey(date = new Date()): string {
  const copy = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = copy.getUTCDay() || 7;
  copy.setUTCDate(copy.getUTCDate() - day + 1);
  return copy.toISOString().slice(0, 10);
}

export async function POST(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const mode = emailAutomationMode();
  if (mode === "disabled") {
    return NextResponse.json({ mode, sent: 0, skipped: 0 });
  }

  const testRecipient = emailTestRecipient();
  const commanders = await prisma.commander.findMany({
    where: {
      disabled: false,
      email: mode === "test"
        ? testRecipient
          ? { equals: testRecipient, mode: "insensitive" }
          : { equals: "" }
        : { not: null },
      emailWeeklyDigest: true,
    },
    select: { id: true, email: true, displayName: true },
  });

  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  let sent = 0;
  let skipped = 0;
  for (const commander of commanders) {
    if (!commander.email) continue;
    const [tips, notifications] = await Promise.all([
      prisma.dailyTip.findMany({
        where: { commanderId: commander.id, generatedAt: { gte: since } },
        orderBy: { generatedAt: "desc" },
        take: 3,
        select: { content: true, sourceCreatorName: true },
      }),
      prisma.commanderNotification.findMany({
        where: { commanderId: commander.id, read: false },
        orderBy: { createdAt: "desc" },
        take: 10,
        select: { type: true, title: true, message: true },
      }),
    ]);
    if (!tips.length && !notifications.length) {
      skipped++;
      continue;
    }

    const result = await sendTrackedEmail({
      commanderId: commander.id,
      to: commander.email,
      subject: "Your Weekly MSF Companion Digest",
      html: buildWeeklyDigestHtml({
        displayName: commander.displayName ?? "Commander",
        tips,
        notifications,
      }),
      messageType: "weekly_digest",
      idempotencyKey: `weekly-digest:${utcWeekKey()}:${commander.id}`,
      preference: "weeklyDigest",
      metadata: { automationMode: mode, week: utcWeekKey() },
    });
    if (result.status === "sent") sent++;
    else skipped++;
  }

  return NextResponse.json({ mode, candidates: commanders.length, sent, skipped });
}
