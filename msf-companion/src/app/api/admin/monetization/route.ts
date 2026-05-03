import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-session";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const PRICE_PER_MONTH = 1.99;

export async function GET() {
  const session = await getAdminSession();
  if (!session.isAdmin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setUTCHours(0, 0, 0, 0);
  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setUTCDate(thirtyDaysAgo.getUTCDate() - 30);
  const sixtyDaysAgo = new Date(now);
  sixtyDaysAgo.setUTCDate(sixtyDaysAgo.getUTCDate() - 60);

  // ─── Core Counts ──────────────────────────────────────────────
  const [totalCommanders, premiumCommanders, freeCommanders] = await Promise.all([
    prisma.commander.count(),
    prisma.commander.count({ where: { subscriptionTier: "PREMIUM" } }),
    prisma.commander.count({ where: { subscriptionTier: "FREE" } }),
  ]);

  // ─── MRR / ARR ───────────────────────────────────────────────
  const mrr = Math.round(premiumCommanders * PRICE_PER_MONTH * 100) / 100;
  const arr = Math.round(mrr * 12 * 100) / 100;

  // ─── Conversion Rate ──────────────────────────────────────────
  const conversionRate = totalCommanders > 0
    ? Math.round((premiumCommanders / totalCommanders) * 1000) / 10
    : 0;

  // ─── Churn This Month ─────────────────────────────────────────
  // Commanders who were PREMIUM at month start but are now FREE
  // Approximation: commanders with stripeCurrentPeriodEnd in the past 30 days who are now FREE
  const churnedThisMonth = await prisma.commander.count({
    where: {
      subscriptionTier: "FREE",
      stripeCurrentPeriodEnd: { gte: thirtyDaysAgo, lt: now },
    },
  });

  // Premium at start of period (current premium + churned)
  const premiumAtStart = premiumCommanders + churnedThisMonth;
  const churnRate = premiumAtStart > 0
    ? Math.round((churnedThisMonth / premiumAtStart) * 1000) / 10
    : 0;

  // ─── Revenue At Risk ──────────────────────────────────────────
  // Subscribers scheduled to cancel (have stripeSubscriptionId and period end approaching)
  const scheduledCancellations = await prisma.commander.findMany({
    where: {
      subscriptionTier: "PREMIUM",
      stripeCurrentPeriodEnd: { lte: new Date(now.getTime() + 30 * 86400000) },
    },
    select: {
      displayName: true,
      stripeCurrentPeriodEnd: true,
      email: true,
    },
    orderBy: { stripeCurrentPeriodEnd: "asc" },
    take: 10,
  });

  const revenueAtRisk = scheduledCancellations.length * PRICE_PER_MONTH;
  const atRiskSubscribers = scheduledCancellations.map((c) => ({
    displayName: c.displayName || "Unknown",
    expiresAt: c.stripeCurrentPeriodEnd?.toISOString().slice(0, 10) || "unknown",
    email: c.email ? `${c.email.slice(0, 3)}...` : null,
  }));

  // ─── ARPU & LTV ──────────────────────────────────────────────
  // ARPU = MRR / total active users (those with any activity in 30 days)
  const activeUsers = await prisma.usageEvent.groupBy({
    by: ["commanderId"],
    where: { createdAt: { gte: thirtyDaysAgo } },
  });
  const activeCount = activeUsers.length || 1;
  const arpu = Math.round((mrr / activeCount) * 100) / 100;

  // LTV = ARPU / monthly churn rate
  const monthlyChurnDecimal = churnRate / 100;
  const ltv = monthlyChurnDecimal > 0
    ? Math.round((PRICE_PER_MONTH / monthlyChurnDecimal) * 100) / 100
    : 0;

  // ─── New Conversions This Month ───────────────────────────────
  // Premium commanders with first payment event in last 30 days
  // Approximate via UsageEvent tier change: first PREMIUM event in last 30 days
  const newConversionsRaw = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
    `SELECT COUNT(DISTINCT c.id) as count
     FROM "Commander" c
     WHERE c."subscriptionTier" = 'PREMIUM'
       AND NOT EXISTS (
         SELECT 1 FROM "UsageEvent" e
         WHERE e."commanderId" = c.id
           AND e."tier" = 'PREMIUM'
           AND e."createdAt" < $1
       )
       AND EXISTS (
         SELECT 1 FROM "UsageEvent" e2
         WHERE e2."commanderId" = c.id
           AND e2."tier" = 'PREMIUM'
           AND e2."createdAt" >= $1
       )`,
    thirtyDaysAgo,
  );
  const newConversions = Number(newConversionsRaw[0]?.count ?? 0);

  // ─── Revenue Waterfall ────────────────────────────────────────
  const newMRR = Math.round(newConversions * PRICE_PER_MONTH * 100) / 100;
  const churnedMRR = Math.round(churnedThisMonth * PRICE_PER_MONTH * 100) / 100;
  const netNewMRR = Math.round((newMRR - churnedMRR) * 100) / 100;

  // ─── Premium Growth Trend (last 30 days) ──────────────────────
  const premiumTrendRaw = await prisma.$queryRawUnsafe<
    Array<{ day: string; gained: bigint; lost: bigint }>
  >(
    `WITH gained AS (
       SELECT DATE(e."createdAt") as day, COUNT(DISTINCT e."commanderId") as gained
       FROM "UsageEvent" e
       WHERE e."tier" = 'PREMIUM'
         AND e."createdAt" >= $1
         AND NOT EXISTS (
           SELECT 1 FROM "UsageEvent" e2
           WHERE e2."commanderId" = e."commanderId"
             AND e2."tier" = 'PREMIUM'
             AND e2."createdAt" < e."createdAt"
             AND e2."createdAt" >= $2
         )
       GROUP BY DATE(e."createdAt")
     ),
     lost AS (
       SELECT DATE(c."stripeCurrentPeriodEnd") as day, COUNT(*) as lost
       FROM "Commander" c
       WHERE c."subscriptionTier" = 'FREE'
         AND c."stripeCurrentPeriodEnd" >= $1
         AND c."stripeCurrentPeriodEnd" < $3
       GROUP BY DATE(c."stripeCurrentPeriodEnd")
     )
     SELECT COALESCE(g.day, l.day) as day,
            COALESCE(g.gained, 0) as gained,
            COALESCE(l.lost, 0) as lost
     FROM gained g
     FULL OUTER JOIN lost l ON g.day = l.day
     ORDER BY day ASC`,
    thirtyDaysAgo,
    sixtyDaysAgo,
    now,
  );

  const premiumTrend = premiumTrendRaw.map((r) => ({
    day: String(r.day).slice(0, 10),
    gained: Number(r.gained),
    lost: Number(r.lost),
  }));

  // ─── Cohort Analysis ──────────────────────────────────────────
  // For each month commanders signed up, what % converted to premium?
  const cohortRaw = await prisma.$queryRawUnsafe<
    Array<{ month: string; total: bigint; premium: bigint }>
  >(
    `SELECT TO_CHAR(DATE_TRUNC('month', "createdAt"), 'YYYY-MM') as month,
            COUNT(*) as total,
            COUNT(*) FILTER (WHERE "subscriptionTier" = 'PREMIUM') as premium
     FROM "Commander"
     WHERE "createdAt" >= $1
     GROUP BY DATE_TRUNC('month', "createdAt")
     ORDER BY month ASC`,
    new Date(now.getFullYear(), now.getMonth() - 5, 1), // Last 6 months
  );

  const cohorts = cohortRaw.map((r) => ({
    month: r.month,
    total: Number(r.total),
    premium: Number(r.premium),
    conversionRate: Number(r.total) > 0
      ? Math.round((Number(r.premium) / Number(r.total)) * 1000) / 10
      : 0,
  }));

  // ─── Subscription Health ──────────────────────────────────────
  // Active: premium with period end in future
  // Expiring soon: premium with period end within 7 days
  // Past due: premium with period end in the past (but tier not yet changed)
  const sevenDaysFromNow = new Date(now.getTime() + 7 * 86400000);
  const [healthyCount, expiringSoonCount] = await Promise.all([
    prisma.commander.count({
      where: {
        subscriptionTier: "PREMIUM",
        stripeCurrentPeriodEnd: { gt: sevenDaysFromNow },
      },
    }),
    prisma.commander.count({
      where: {
        subscriptionTier: "PREMIUM",
        stripeCurrentPeriodEnd: { gt: now, lte: sevenDaysFromNow },
      },
    }),
  ]);

  const subscriptionHealth = {
    healthy: healthyCount,
    expiringSoon: expiringSoonCount,
    total: premiumCommanders,
  };

  // ─── Top Premium Features (what do paying users use?) ─────────
  const premiumFeatureUsage = await prisma.usageEvent.groupBy({
    by: ["eventName"],
    where: {
      tier: "PREMIUM",
      eventType: "page_view",
      createdAt: { gte: thirtyDaysAgo },
    },
    _count: { commanderId: true },
    orderBy: { _count: { commanderId: "desc" } },
    take: 8,
  });

  const featurePages: Record<string, string> = {
    "/advisor": "AI Advisor",
    "/dashboard/daily-briefing": "Daily Briefing",
    "/roster": "Roster",
    "/planner": "Planner",
    "/analyze/dd-planner": "DD Planner",
    "/teams": "Team Builder",
    "/analyze/farming": "Farming Guide",
    "/analyze/upgrade-tokens": "Upgrade Calculator",
    "/dashboard/offers": "Offers",
    "/heroes": "Heroes",
  };

  const premiumTopFeatures = premiumFeatureUsage.map((f) => ({
    feature: featurePages[f.eventName] || f.eventName,
    views: f._count.commanderId,
  }));

  return NextResponse.json({
    overview: {
      totalCommanders,
      premiumCommanders,
      freeCommanders,
      mrr,
      arr,
      conversionRate,
      churnRate,
      arpu,
      ltv,
      pricePerMonth: PRICE_PER_MONTH,
    },
    waterfall: {
      newConversions,
      newMRR,
      churnedThisMonth,
      churnedMRR,
      netNewMRR,
    },
    premiumTrend,
    cohorts,
    subscriptionHealth,
    atRiskSubscribers,
    revenueAtRisk,
    premiumTopFeatures,
  });
}
