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

  // Question stats
  const [questionsToday, questionsThisWeek] = await Promise.all([
    prisma.advisorQuestionLog.count({
      where: { createdAt: { gte: todayStart } },
    }),
    prisma.advisorQuestionLog.count({
      where: { createdAt: { gte: weekStart } },
    }),
  ]);

  // Top 10 most-asked questions
  const topQuestions = await prisma.advisorQuestionLog.groupBy({
    by: ["question"],
    _count: { question: true },
    orderBy: { _count: { question: "desc" } },
    take: 10,
  });

  // Knowledge gap counts
  const [openGaps, resolvedGaps] = await Promise.all([
    prisma.knowledgeGap.count({ where: { status: "open" } }),
    prisma.knowledgeGap.count({ where: { status: "resolved" } }),
  ]);

  // Token usage (estimated cost)
  const tokenUsageToday = await prisma.dailyTokenUsage.aggregate({
    _sum: { tokensUsed: true },
    where: { date: { gte: todayStart } },
  });
  const tokenUsageWeek = await prisma.dailyTokenUsage.aggregate({
    _sum: { tokensUsed: true },
    where: { date: { gte: weekStart } },
  });

  // Estimate monthly cost: $0.005 per 1K tokens (GPT-4o average)
  const weeklyTokens = tokenUsageWeek._sum.tokensUsed || 0;
  const estimatedMonthlyCost = (weeklyTokens / 1000) * 0.005 * 4.3;

  // Feedback stats
  const [positiveFeedback, negativeFeedback] = await Promise.all([
    prisma.advisorMessage.count({ where: { feedback: "positive" } }),
    prisma.advisorMessage.count({ where: { feedback: "negative" } }),
  ]);

  // Confidence distribution
  const avgConfidence = await prisma.advisorQuestionLog.aggregate({
    _avg: { confidenceScore: true },
  });

  return NextResponse.json({
    questionsToday,
    questionsThisWeek,
    topQuestions: topQuestions.map((q) => ({
      question: q.question,
      count: q._count.question,
    })),
    gaps: { open: openGaps, resolved: resolvedGaps },
    tokenUsage: {
      today: tokenUsageToday._sum.tokensUsed || 0,
      thisWeek: weeklyTokens,
      estimatedMonthlyCost: Math.round(estimatedMonthlyCost * 100) / 100,
    },
    feedback: { positive: positiveFeedback, negative: negativeFeedback },
    avgConfidence: Math.round(avgConfidence._avg.confidenceScore || 0),
  });
}
