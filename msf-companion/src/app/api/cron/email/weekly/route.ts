import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAuthorizedCronRequest } from "@/lib/cron-auth";
import { emailAutomationMode, emailTestRecipient } from "@/lib/email-automation";
import { sendTrackedEmail } from "@/lib/email";
import { buildWeeklyDigestHtml } from "@/lib/email-templates";
import {
  getFreshOfficialUpdates,
  hasUsefulWeeklyDigestContent,
  isUsefulDigestNotification,
  summarizeDigestRoster,
} from "@/lib/weekly-digest";

export const dynamic = "force-dynamic";
const DIGEST_CONTENT_VERSION = "v2";

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
  const officialUpdates = await getFreshOfficialUpdates().catch(() => []);
  let sent = 0;
  let skipped = 0;
  for (const commander of commanders) {
    if (!commander.email) continue;
    const [snapshots, notificationCandidates, advisorQuestions] = await Promise.all([
      prisma.rosterSnapshot.findMany({
        where: { commanderId: commander.id },
        orderBy: { createdAt: "desc" },
        take: 2,
        select: { snapshotData: true, createdAt: true },
      }),
      prisma.commanderNotification.findMany({
        where: { commanderId: commander.id, read: false, createdAt: { gte: since } },
        orderBy: { createdAt: "desc" },
        take: 20,
        select: { type: true, title: true, message: true },
      }),
      prisma.advisorMessage.count({
        where: {
          conversation: { commanderId: commander.id },
          role: "user",
          createdAt: { gte: since },
        },
      }),
    ]);
    const roster = summarizeDigestRoster(snapshots);
    const notifications = notificationCandidates.filter(isUsefulDigestNotification).slice(0, 5);
    const digestContent = { roster, officialUpdates, notifications, advisorQuestions };
    if (!hasUsefulWeeklyDigestContent(digestContent)) {
      skipped++;
      continue;
    }

    const result = await sendTrackedEmail({
      commanderId: commander.id,
      to: commander.email,
      subject: "Your Weekly MSF Progress Report",
      html: buildWeeklyDigestHtml({
        displayName: commander.displayName ?? "Commander",
        ...digestContent,
      }),
      messageType: "weekly_digest",
      idempotencyKey: `weekly-digest:${DIGEST_CONTENT_VERSION}:${utcWeekKey()}:${commander.id}`,
      preference: "weeklyDigest",
      metadata: { automationMode: mode, week: utcWeekKey(), contentVersion: DIGEST_CONTENT_VERSION },
    });
    if (result.status === "sent") sent++;
    else skipped++;
  }

  return NextResponse.json({ mode, candidates: commanders.length, sent, skipped });
}
