import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAuthorizedCronRequest } from "@/lib/cron-auth";
import { emailAutomationMode, emailTestRecipient } from "@/lib/email-automation";
import { sendTrackedEmail } from "@/lib/email";
import { buildLifecycleEmailHtml } from "@/lib/email-templates";
import { calculateChurnRisk } from "@/lib/churn-risk";

export const dynamic = "force-dynamic";

const DAY = 86_400_000;
const FEATURE_MESSAGES: Record<string, { title: string; message: string; link: string }> = {
  "/analyze/dd-planner": { title: "Review your Dark Dimension plan", message: "Your saved Dark Dimension plan is ready for another look.", link: "/analyze/dd-planner" },
  "/advisor": { title: "Ask your Advisor a new question", message: "Refresh your roster, then get recommendations grounded in your current account.", link: "/advisor" },
  "/teams": { title: "Review your saved team options", message: "Compare your roster with the team-building tools available now.", link: "/teams" },
  "/roster": { title: "Refresh your roster", message: "Sign in to capture your latest roster progress and priorities.", link: "/roster" },
};

function distinctDays(dates: Date[]): number {
  return new Set(dates.map((date) => date.toISOString().slice(0, 10))).size;
}

function topFeature(events: Array<{ eventName: string }>): string | null {
  const counts = new Map<string, number>();
  for (const event of events) counts.set(event.eventName, (counts.get(event.eventName) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

function cooldownExpired(sentAt: Date | undefined, days: number): boolean {
  return !sentAt || Date.now() - sentAt.getTime() >= days * DAY;
}

function emailScope(mode: "test" | "live", testRecipient: string | null) {
  return mode === "test"
    ? testRecipient
      ? { equals: testRecipient, mode: "insensitive" as const }
      : { equals: "" }
    : undefined;
}

export async function POST(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const mode = emailAutomationMode();
  if (mode === "disabled") {
    return NextResponse.json({ mode, premiumScanned: 0, inactiveScanned: 0, sent: 0 });
  }

  const testRecipient = emailTestRecipient();
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * DAY);
  const fourteenDaysAgo = new Date(now.getTime() - 14 * DAY);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * DAY);
  const ninetyDaysAgo = new Date(now.getTime() - 90 * DAY);
  let sent = 0;
  let notified = 0;
  let skipped = 0;

  const churnFlag = await prisma.featureFlag.findUnique({ where: { key: "churn_prevention" } });
  const premiumCommanders = churnFlag?.enabled
    ? await prisma.commander.findMany({
        where: {
          disabled: false,
          subscriptionTier: "PREMIUM",
          ...(mode === "test" ? { email: emailScope(mode, testRecipient) } : {}),
        },
        select: {
          id: true,
          email: true,
          displayName: true,
          lastLoginAt: true,
          stripeCurrentPeriodEnd: true,
          usageEvents: {
            where: { createdAt: { gte: fourteenDaysAgo } },
            select: { eventName: true, createdAt: true },
          },
          churnInterventions: {
            where: { sentAt: { gte: ninetyDaysAgo } },
            orderBy: { sentAt: "desc" },
            select: { type: true, sentAt: true },
          },
        },
      })
    : [];

  for (const commander of premiumCommanders) {
    try {
      const recent = commander.usageEvents.filter((event) => event.createdAt >= sevenDaysAgo);
      const prior = commander.usageEvents.filter((event) => event.createdAt < sevenDaysAgo);
      const score = calculateChurnRisk({
        lastLoginAt: commander.lastLoginAt,
        stripeCurrentPeriodEnd: commander.stripeCurrentPeriodEnd,
        recentUsageCount: recent.length,
        priorUsageCount: prior.length,
        recentLoginDays: distinctDays(recent.map((event) => event.createdAt)),
        priorLoginDays: distinctDays(prior.map((event) => event.createdAt)),
        paymentFailures: commander.churnInterventions.filter((item) => item.type === "dunning" && item.sentAt >= fourteenDaysAgo).length,
      }, now);
      if (score < 30) continue;

      const kind = score >= 70 ? "retention" : score >= 50 ? "re-engage" : "nudge";
      const cooldown = kind === "retention" ? 30 : kind === "re-engage" ? 14 : 7;
      const last = commander.churnInterventions.find((item) => item.type === kind);
      if (!cooldownExpired(last?.sentAt, cooldown)) {
        skipped++;
        continue;
      }
      const sourceEventId = `lifecycle:${kind}:${now.toISOString().slice(0, 10)}:${commander.id}`;
      if (await prisma.churnIntervention.findUnique({ where: { sourceEventId } })) {
        skipped++;
        continue;
      }

      let channel = "notification";
      if (kind !== "nudge" && commander.email) {
        const result = await sendTrackedEmail({
          commanderId: commander.id,
          to: commander.email,
          subject: kind === "retention" ? "We've saved your MSF Companion progress" : "Your roster has updates waiting",
          html: buildLifecycleEmailHtml(kind, commander.displayName ?? "Commander"),
          messageType: kind === "retention" ? "churn_retention" : "churn_reengage",
          idempotencyKey: sourceEventId,
          preference: "reengagement",
          metadata: { automationMode: mode, riskScore: score },
        });
        if (result.status !== "suppressed") {
          channel = "both";
          if (result.status === "sent") sent++;
        }
      }

      const feature = topFeature(commander.usageEvents);
      const notification = feature && FEATURE_MESSAGES[feature]
        ? FEATURE_MESSAGES[feature]
        : { title: "New insights are ready", message: "Refresh your roster to review the latest available recommendations.", link: "/dashboard" };
      await prisma.$transaction([
        prisma.churnIntervention.create({
          data: { commanderId: commander.id, type: kind, channel, riskScore: score, delivered: true, sourceEventId },
        }),
        prisma.commanderNotification.create({
          data: {
            commanderId: commander.id,
            type: "churn_prevention",
            title: notification.title,
            message: notification.message,
            linkUrl: notification.link,
          },
        }),
      ]);
      notified++;
    } catch (error) {
      console.warn(`[Email lifecycle] Premium candidate failed: ${error instanceof Error ? error.message : String(error)}`);
      skipped++;
    }
  }

  const winBacks = await prisma.churnIntervention.findMany({
    where: {
      type: "win-back",
      delivered: false,
      scheduledAt: { lte: now },
      ...(mode === "test"
        ? { commander: { email: emailScope(mode, testRecipient) } }
        : {}),
    },
    include: { commander: { select: { id: true, email: true, displayName: true } } },
    take: 50,
  });
  for (const intervention of winBacks) {
    try {
      if (intervention.commander.email) {
        const result = await sendTrackedEmail({
          commanderId: intervention.commander.id,
          to: intervention.commander.email,
          subject: "Your MSF Companion intel is still here",
          html: buildLifecycleEmailHtml("win-back", intervention.commander.displayName ?? "Commander"),
          messageType: "subscription_winback",
          idempotencyKey: `scheduled-winback:${intervention.id}`,
          preference: "reengagement",
          metadata: { automationMode: mode },
        });
        if (result.status === "sent") sent++;
      }
      await prisma.churnIntervention.update({
        where: { id: intervention.id },
        data: { delivered: true, sentAt: new Date() },
      });
    } catch (error) {
      console.warn(`[Email lifecycle] Scheduled win-back failed: ${error instanceof Error ? error.message : String(error)}`);
      skipped++;
    }
  }

  const inactiveCommanders = await prisma.commander.findMany({
    where: {
      disabled: false,
      subscriptionTier: "FREE",
      email: mode === "test"
        ? emailScope(mode, testRecipient)
        : { not: null },
      emailReengagement: true,
      lastLoginAt: { lt: thirtyDaysAgo },
      churnInterventions: {
        none: { type: "inactive-free-winback", sentAt: { gt: ninetyDaysAgo } },
      },
    },
    select: { id: true, email: true, displayName: true },
    orderBy: { lastLoginAt: "asc" },
    take: 50,
  });
  for (const commander of inactiveCommanders) {
    if (!commander.email) continue;
    try {
      const sourceEventId = `inactive-free:${now.toISOString().slice(0, 10)}:${commander.id}`;
      const result = await sendTrackedEmail({
        commanderId: commander.id,
        to: commander.email,
        subject: "Your MSF roster is ready for a fresh look",
        html: buildLifecycleEmailHtml("inactive-free", commander.displayName ?? "Commander"),
        messageType: "inactive_winback",
        idempotencyKey: sourceEventId,
        preference: "reengagement",
        metadata: { automationMode: mode },
      });
      if (result.status === "sent") sent++;
      await prisma.churnIntervention.create({
        data: { commanderId: commander.id, type: "inactive-free-winback", channel: "email", riskScore: 0, delivered: true, sourceEventId },
      });
    } catch (error) {
      console.warn(`[Email lifecycle] Inactive candidate failed: ${error instanceof Error ? error.message : String(error)}`);
      skipped++;
    }
  }

  return NextResponse.json({
    mode,
    churnPreventionEnabled: churnFlag?.enabled ?? false,
    premiumScanned: premiumCommanders.length,
    inactiveScanned: inactiveCommanders.length,
    scheduledWinBacks: winBacks.length,
    sent,
    notified,
    skipped,
  });
}
