import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-session";
import { prisma } from "@/lib/prisma";

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

  // Active users: distinct commanders today and this week
  const [activeToday, activeWeek] = await Promise.all([
    prisma.usageEvent.groupBy({
      by: ["commanderId"],
      where: { createdAt: { gte: todayStart } },
    }),
    prisma.usageEvent.groupBy({
      by: ["commanderId"],
      where: { createdAt: { gte: weekStart } },
    }),
  ]);

  // Top 5 pages by view count this week
  const topPages = await prisma.usageEvent.groupBy({
    by: ["eventName"],
    where: {
      eventType: "page_view",
      createdAt: { gte: weekStart },
    },
    _count: { eventName: true },
    orderBy: { _count: { eventName: "desc" } },
    take: 5,
  });

  // Top 5 features by interaction count this week
  const topFeatures = await prisma.usageEvent.groupBy({
    by: ["eventName"],
    where: {
      eventType: "feature_use",
      createdAt: { gte: weekStart },
    },
    _count: { eventName: true },
    orderBy: { _count: { eventName: "desc" } },
    take: 5,
  });

  // Tier split: count distinct commanders per tier this week
  const tierGroups = await prisma.usageEvent.groupBy({
    by: ["tier"],
    where: { createdAt: { gte: weekStart } },
    _count: { commanderId: true },
  });

  const totalTierCount = tierGroups.reduce(
    (sum, g) => sum + g._count.commanderId,
    0,
  );
  const freeCount =
    tierGroups.find((g) => g.tier === "FREE")?._count.commanderId ?? 0;
  const premiumCount =
    tierGroups.find((g) => g.tier === "PREMIUM")?._count.commanderId ?? 0;

  let tierSplit: { FREE: number; PREMIUM: number };
  if (totalTierCount === 0) {
    tierSplit = { FREE: 0, PREMIUM: 0 };
  } else {
    const freePercent = Math.round((freeCount / totalTierCount) * 100);
    tierSplit = { FREE: freePercent, PREMIUM: 100 - freePercent };
  }

  return NextResponse.json({
    activeUsersToday: activeToday.length,
    activeUsersThisWeek: activeWeek.length,
    topPages: topPages.map((p) => ({
      page: p.eventName,
      count: p._count.eventName,
    })),
    topFeatures: topFeatures.map((f) => ({
      feature: f.eventName,
      count: f._count.eventName,
    })),
    tierSplit,
  });
}
