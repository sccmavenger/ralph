import { prisma } from "@/lib/prisma";
import { emailAutomationMode } from "@/lib/email-automation";

export async function getEmailHealth() {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const [byStatus, byType, recent, audience, weekly, characters, announcements, reengagement] = await Promise.all([
    prisma.emailDelivery.groupBy({
      by: ["status"],
      where: { createdAt: { gte: since } },
      _count: { _all: true },
    }),
    prisma.emailDelivery.groupBy({
      by: ["messageType"],
      where: { createdAt: { gte: since } },
      _count: { _all: true },
    }),
    prisma.emailDelivery.findMany({
      orderBy: { createdAt: "desc" },
      take: 25,
      select: {
        id: true,
        messageType: true,
        subject: true,
        status: true,
        attemptCount: true,
        lastError: true,
        createdAt: true,
        sentAt: true,
        deliveredAt: true,
      },
    }),
    prisma.commander.count({ where: { disabled: false, email: { not: null } } }),
    prisma.commander.count({ where: { disabled: false, email: { not: null }, emailWeeklyDigest: true } }),
    prisma.commander.count({ where: { disabled: false, email: { not: null }, emailNewCharacters: true } }),
    prisma.commander.count({ where: { disabled: false, email: { not: null }, emailAnnouncements: true } }),
    prisma.commander.count({ where: { disabled: false, email: { not: null }, emailReengagement: true } }),
  ]);

  const statuses = Object.fromEntries(byStatus.map((item) => [item.status, item._count._all]));
  const total = Object.values(statuses).reduce((sum, count) => sum + count, 0);
  const failures = (statuses.failed ?? 0) + (statuses.bounced ?? 0) + (statuses.complained ?? 0);
  return {
    generatedAt: new Date().toISOString(),
    periodDays: 7,
    automationMode: emailAutomationMode(),
    providerConfigured: Boolean(process.env.RESEND_API_KEY),
    webhookConfigured: Boolean(process.env.RESEND_WEBHOOK_SECRET),
    totals: { total, failures, failureRate: total ? Math.round((failures / total) * 1000) / 10 : 0 },
    byStatus: statuses,
    byType: Object.fromEntries(byType.map((item) => [item.messageType, item._count._all])),
    audience: { total: audience, weeklyDigest: weekly, newCharacters: characters, announcements, reengagement },
    recent: recent.map((item) => ({
      ...item,
      createdAt: item.createdAt.toISOString(),
      sentAt: item.sentAt?.toISOString() ?? null,
      deliveredAt: item.deliveredAt?.toISOString() ?? null,
    })),
  };
}
