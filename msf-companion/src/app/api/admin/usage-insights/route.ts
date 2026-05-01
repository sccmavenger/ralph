import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-session";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getAdminSession();
  if (!session.isAdmin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setUTCHours(0, 0, 0, 0);
  const weekStart = new Date(now);
  weekStart.setUTCDate(weekStart.getUTCDate() - 7);
  const monthStart = new Date(now);
  monthStart.setUTCDate(monthStart.getUTCDate() - 30);
  const priorWeekStart = new Date(now);
  priorWeekStart.setUTCDate(priorWeekStart.getUTCDate() - 14);

  // ─── Summary Cards ────────────────────────────────────────────
  const [activeToday, activeWeek, activeYesterday, activePriorWeek] = await Promise.all([
    prisma.usageEvent.groupBy({
      by: ["commanderId"],
      where: { createdAt: { gte: todayStart } },
    }),
    prisma.usageEvent.groupBy({
      by: ["commanderId"],
      where: { createdAt: { gte: weekStart } },
    }),
    prisma.usageEvent.groupBy({
      by: ["commanderId"],
      where: {
        createdAt: {
          gte: new Date(todayStart.getTime() - 86400000),
          lt: todayStart,
        },
      },
    }),
    prisma.usageEvent.groupBy({
      by: ["commanderId"],
      where: {
        createdAt: { gte: priorWeekStart, lt: weekStart },
      },
    }),
  ]);

  const todayCount = activeToday.length;
  const weekCount = activeWeek.length;
  const yesterdayCount = activeYesterday.length;
  const priorWeekCount = activePriorWeek.length;

  // ─── 7-day Retention ──────────────────────────────────────────
  // Commanders active 8-14 days ago who also came back in the last 7 days
  const priorWeekIds = activePriorWeek.map((r) => r.commanderId);
  let retentionRate = 0;
  if (priorWeekIds.length > 0) {
    const returned = await prisma.usageEvent.groupBy({
      by: ["commanderId"],
      where: {
        commanderId: { in: priorWeekIds },
        createdAt: { gte: weekStart },
      },
    });
    retentionRate = Math.round((returned.length / priorWeekIds.length) * 100);
  }

  // ─── Session Depth (avg pages per unique session-day) ─────────
  const pageViewsThisWeek = await prisma.usageEvent.count({
    where: { eventType: "page_view", createdAt: { gte: weekStart } },
  });
  const avgSessionDepth = weekCount > 0 ? Math.round((pageViewsThisWeek / weekCount) * 10) / 10 : 0;

  // ─── DAU Trend (last 30 days) ────────────────────────────────
  const dauRaw = await prisma.$queryRawUnsafe<Array<{ day: string; count: bigint }>>(
    `SELECT DATE("createdAt") as day, COUNT(DISTINCT "commanderId") as count
     FROM "UsageEvent"
     WHERE "createdAt" >= $1
     GROUP BY DATE("createdAt")
     ORDER BY day ASC`,
    monthStart,
  );
  const dauTrend = dauRaw.map((r) => ({
    day: String(r.day).slice(0, 10),
    count: Number(r.count),
  }));

  // ─── Feature Stickiness ───────────────────────────────────────
  // For each feature, find users this week and check how many used it again in prior week
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

  const featureStickiness = await Promise.all(
    Object.entries(featurePages).map(async ([path, label]) => {
      // Users who visited this feature in the prior week (8-14 days ago)
      const priorUsers = await prisma.usageEvent.groupBy({
        by: ["commanderId"],
        where: {
          eventName: path,
          eventType: "page_view",
          createdAt: { gte: priorWeekStart, lt: weekStart },
        },
      });

      // Of those, who came back this week to the same feature?
      let returnRate = 0;
      if (priorUsers.length > 0) {
        const returnedUsers = await prisma.usageEvent.groupBy({
          by: ["commanderId"],
          where: {
            commanderId: { in: priorUsers.map((u) => u.commanderId) },
            eventName: path,
            eventType: "page_view",
            createdAt: { gte: weekStart },
          },
        });
        returnRate = Math.round((returnedUsers.length / priorUsers.length) * 100);
      }

      // Total unique users this week
      const usersThisWeek = await prisma.usageEvent.groupBy({
        by: ["commanderId"],
        where: {
          eventName: path,
          eventType: "page_view",
          createdAt: { gte: weekStart },
        },
      });

      return {
        feature: label,
        path,
        usersThisWeek: usersThisWeek.length,
        returnRate,
      };
    }),
  );

  // Sort by users desc, filter out features with 0 users
  const stickinessSorted = featureStickiness
    .filter((f) => f.usersThisWeek > 0)
    .sort((a, b) => b.usersThisWeek - a.usersThisWeek);

  // ─── Path to Premium ──────────────────────────────────────────
  // Find commanders who upgraded this month and their last feature before upgrade
  // We approximate by looking at commanders whose tier changed to PREMIUM in events
  const premiumConversions = await prisma.$queryRawUnsafe<
    Array<{ eventName: string; count: bigint }>
  >(
    `SELECT e2."eventName", COUNT(DISTINCT e2."commanderId") as count
     FROM "UsageEvent" e1
     JOIN "UsageEvent" e2 ON e2."commanderId" = e1."commanderId"
       AND e2."createdAt" < e1."createdAt"
       AND e2."eventType" = 'page_view'
     WHERE e1."tier" = 'PREMIUM'
       AND e1."createdAt" >= $1
       AND EXISTS (
         SELECT 1 FROM "UsageEvent" e3
         WHERE e3."commanderId" = e1."commanderId"
           AND e3."tier" = 'FREE'
           AND e3."createdAt" < e1."createdAt"
       )
     GROUP BY e2."eventName"
     ORDER BY count DESC
     LIMIT 5`,
    monthStart,
  );

  const pathToPremium = premiumConversions.map((r) => ({
    feature: featurePages[r.eventName] || r.eventName,
    count: Number(r.count),
  }));

  // Total premium conversions this month for percentages
  const totalConversions = pathToPremium.reduce((s, p) => s + p.count, 0);
  const pathToPremiumWithPct = pathToPremium.map((p) => ({
    ...p,
    percentage: totalConversions > 0 ? Math.round((p.count / totalConversions) * 100) : 0,
  }));

  // ─── Peak Hours ───────────────────────────────────────────────
  const peakHoursRaw = await prisma.$queryRawUnsafe<Array<{ hour: number; count: bigint }>>(
    `SELECT EXTRACT(HOUR FROM "createdAt") as hour, COUNT(*) as count
     FROM "UsageEvent"
     WHERE "createdAt" >= $1
     GROUP BY EXTRACT(HOUR FROM "createdAt")
     ORDER BY hour ASC`,
    weekStart,
  );
  const peakHours = Array.from({ length: 24 }, (_, i) => {
    const found = peakHoursRaw.find((r) => Number(r.hour) === i);
    return { hour: i, count: found ? Number(found.count) : 0 };
  });

  // ─── At-Risk Commanders ───────────────────────────────────────
  // Active in prior week but NOT in last 7 days
  const currentWeekIds = new Set(activeWeek.map((r) => r.commanderId));
  const atRiskIds = priorWeekIds.filter((id) => !currentWeekIds.has(id));

  let atRiskCommanders: Array<{ displayName: string; lastSeen: string }> = [];
  if (atRiskIds.length > 0) {
    const atRiskDetails = await prisma.commander.findMany({
      where: { id: { in: atRiskIds.slice(0, 10) } },
      select: { id: true, displayName: true },
    });

    // Get last activity date for each
    const lastActivity = await Promise.all(
      atRiskDetails.map(async (c) => {
        const last = await prisma.usageEvent.findFirst({
          where: { commanderId: c.id },
          orderBy: { createdAt: "desc" },
          select: { createdAt: true },
        });
        return {
          displayName: c.displayName || "Unknown Commander",
          lastSeen: last?.createdAt?.toISOString().slice(0, 10) || "unknown",
        };
      }),
    );
    atRiskCommanders = lastActivity;
  }

  // ─── New Commander Journey (first-week adoption) ──────────────
  // Commanders created in last 30 days and what features they adopted
  const newCommanders = await prisma.commander.findMany({
    where: {
      usageEvents: { some: { createdAt: { gte: monthStart } } },
    },
    select: { id: true },
    take: 100,
  });

  // Simplified: check new commanders' feature adoption
  const newCommanderIds = newCommanders.map((c) => c.id);
  let newUserJourney: Array<{ feature: string; adoption: number }> = [];
  if (newCommanderIds.length > 0) {
    const journeyData = await Promise.all(
      Object.entries(featurePages).map(async ([path, label]) => {
        const usedFeature = await prisma.usageEvent.groupBy({
          by: ["commanderId"],
          where: {
            commanderId: { in: newCommanderIds },
            eventName: path,
            eventType: "page_view",
          },
        });
        return {
          feature: label,
          adoption: Math.round((usedFeature.length / newCommanderIds.length) * 100),
        };
      }),
    );
    newUserJourney = journeyData.filter((j) => j.adoption > 0).sort((a, b) => b.adoption - a.adoption);
  }

  // ─── Tier Distribution ────────────────────────────────────────
  const tierGroups = await prisma.usageEvent.groupBy({
    by: ["tier"],
    where: { createdAt: { gte: weekStart } },
    _count: { commanderId: true },
  });
  const totalTierCount = tierGroups.reduce((sum, g) => sum + g._count.commanderId, 0);
  const freeCount = tierGroups.find((g) => g.tier === "FREE")?._count.commanderId ?? 0;
  let tierSplit: { FREE: number; PREMIUM: number };
  if (totalTierCount === 0) {
    tierSplit = { FREE: 0, PREMIUM: 0 };
  } else {
    const freePercent = Math.round((freeCount / totalTierCount) * 100);
    tierSplit = { FREE: freePercent, PREMIUM: 100 - freePercent };
  }

  // ─── Free vs Premium Behavior ─────────────────────────────────
  // Per-feature usage broken down by tier
  const tierBehavior = await Promise.all(
    Object.entries(featurePages).map(async ([path, label]) => {
      const [freeUsers, premiumUsers] = await Promise.all([
        prisma.usageEvent.groupBy({
          by: ["commanderId"],
          where: {
            eventName: path,
            eventType: "page_view",
            tier: "FREE",
            createdAt: { gte: weekStart },
          },
        }),
        prisma.usageEvent.groupBy({
          by: ["commanderId"],
          where: {
            eventName: path,
            eventType: "page_view",
            tier: "PREMIUM",
            createdAt: { gte: weekStart },
          },
        }),
      ]);
      return {
        feature: label,
        freeUsers: freeUsers.length,
        premiumUsers: premiumUsers.length,
      };
    }),
  );

  // Tier-level engagement stats
  const [freePageViews, premiumPageViews, freeUniqueUsers, premiumUniqueUsers] = await Promise.all([
    prisma.usageEvent.count({
      where: { eventType: "page_view", tier: "FREE", createdAt: { gte: weekStart } },
    }),
    prisma.usageEvent.count({
      where: { eventType: "page_view", tier: "PREMIUM", createdAt: { gte: weekStart } },
    }),
    prisma.usageEvent.groupBy({
      by: ["commanderId"],
      where: { tier: "FREE", createdAt: { gte: weekStart } },
    }),
    prisma.usageEvent.groupBy({
      by: ["commanderId"],
      where: { tier: "PREMIUM", createdAt: { gte: weekStart } },
    }),
  ]);

  const freeVsPremium = {
    featureBreakdown: tierBehavior.filter((f) => f.freeUsers > 0 || f.premiumUsers > 0),
    engagement: {
      free: {
        uniqueUsers: freeUniqueUsers.length,
        avgSessionDepth: freeUniqueUsers.length > 0
          ? Math.round((freePageViews / freeUniqueUsers.length) * 10) / 10
          : 0,
      },
      premium: {
        uniqueUsers: premiumUniqueUsers.length,
        avgSessionDepth: premiumUniqueUsers.length > 0
          ? Math.round((premiumPageViews / premiumUniqueUsers.length) * 10) / 10
          : 0,
      },
    },
  };

  // ─── Top Users (Power Users) ──────────────────────────────────
  const topUsersRaw = await prisma.$queryRawUnsafe<
    Array<{ commanderId: string; eventCount: bigint; lastActive: Date; tier: string }>
  >(
    `SELECT "commanderId", COUNT(*) as "eventCount",
            MAX("createdAt") as "lastActive", MAX("tier") as tier
     FROM "UsageEvent"
     WHERE "createdAt" >= $1
     GROUP BY "commanderId"
     ORDER BY "eventCount" DESC
     LIMIT 15`,
    weekStart,
  );

  // Enrich with display names and top feature
  const topUserIds = topUsersRaw.map((u) => u.commanderId);
  const topUserDetails = topUserIds.length > 0
    ? await prisma.commander.findMany({
        where: { id: { in: topUserIds } },
        select: { id: true, displayName: true },
      })
    : [];

  const topUserFeatures = topUserIds.length > 0
    ? await prisma.$queryRawUnsafe<Array<{ commanderId: string; eventName: string; cnt: bigint }>>(
        `SELECT "commanderId", "eventName", COUNT(*) as cnt
         FROM "UsageEvent"
         WHERE "commanderId" = ANY($1)
           AND "eventType" = 'page_view'
           AND "createdAt" >= $2
         GROUP BY "commanderId", "eventName"
         ORDER BY "commanderId", cnt DESC`,
        topUserIds,
        weekStart,
      )
    : [];

  // Build a map of commanderId -> top feature
  const topFeatureMap = new Map<string, string>();
  for (const row of topUserFeatures) {
    if (!topFeatureMap.has(row.commanderId)) {
      topFeatureMap.set(row.commanderId, featurePages[row.eventName] || row.eventName);
    }
  }

  const nameMap = new Map(topUserDetails.map((u) => [u.id, u.displayName || "Unknown"]));

  const topUsers = topUsersRaw.map((u) => ({
    displayName: nameMap.get(u.commanderId) || "Unknown",
    tier: u.tier,
    eventCount: Number(u.eventCount),
    lastActive: u.lastActive instanceof Date ? u.lastActive.toISOString().slice(0, 10) : String(u.lastActive).slice(0, 10),
    topFeature: topFeatureMap.get(u.commanderId) || "—",
  }));

  // ─── Premium Value Signals ────────────────────────────────────
  // Features where premium usage is disproportionately higher
  const premiumValueSignals = tierBehavior
    .filter((f) => f.premiumUsers > 0)
    .map((f) => {
      const totalUsers = f.freeUsers + f.premiumUsers;
      const premiumShare = Math.round((f.premiumUsers / totalUsers) * 100);
      // Compare premium share of feature vs overall premium share
      const overallPremiumShare = tierSplit.PREMIUM;
      const lift = overallPremiumShare > 0
        ? Math.round(((premiumShare - overallPremiumShare) / overallPremiumShare) * 100)
        : 0;
      return {
        feature: f.feature,
        premiumShare,
        lift,
        premiumUsers: f.premiumUsers,
        freeUsers: f.freeUsers,
      };
    })
    .sort((a, b) => b.lift - a.lift);

  return NextResponse.json({
    summary: {
      activeToday: todayCount,
      activeThisWeek: weekCount,
      todayVsYesterday: yesterdayCount > 0 ? Math.round(((todayCount - yesterdayCount) / yesterdayCount) * 100) : 0,
      weekVsPriorWeek: priorWeekCount > 0 ? Math.round(((weekCount - priorWeekCount) / priorWeekCount) * 100) : 0,
      retentionRate,
      avgSessionDepth,
    },
    dauTrend,
    featureStickiness: stickinessSorted,
    pathToPremium: pathToPremiumWithPct,
    peakHours,
    atRiskCommanders,
    atRiskCount: atRiskIds.length,
    weeklyActiveCount: weekCount,
    newUserJourney,
    tierSplit,
    freeVsPremium,
    topUsers,
    premiumValueSignals,
  });
}
