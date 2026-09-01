import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-session";
import {
  AIActionItemSummary,
  AIStatsResponse,
  buildAIStatsRange,
  buildAIStatsResponse,
  parseAIStatsRange,
} from "@/lib/admin-ai-stats";
import { buildAdminBusinessInsights } from "@/lib/admin-business-insights";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
} as const;

interface ActionItemRow {
  id: string;
  sourceType: string;
  sourceId: string;
  title: string;
  description: string | null;
  priority: string;
  status: string;
  owner: string | null;
  notes: string | null;
  actionUrl: string | null;
  successMeasure: string | null;
  baselineValue: number | null;
  targetValue: number | null;
  resultValue: number | null;
  metricUnit: string | null;
  reviewAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

interface ActionItemDelegate {
  findMany(args: unknown): Promise<ActionItemRow[]>;
}

export async function GET(request: Request) {
  const session = await getAdminSession();
  if (!session.isAdmin) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: NO_STORE_HEADERS },
    );
  }

  const rangeDays = parseAIStatsRange(new URL(request.url).searchParams.get("range"));
  if (rangeDays === null) {
    return NextResponse.json(
      { error: "range must be one of 7, 30, or 90" },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  const now = new Date();
  const range = buildAIStatsRange(rangeDays, now);
  const combinedStart = new Date(range.previousStart);
  const combinedEnd = new Date(range.end);

  try {
    const [
      questions,
      messages,
      tokenUsage,
      gaps,
      usageEvents,
      commanders,
      cancellationCases,
      actionItems,
    ] = await Promise.all([
      prisma.advisorQuestionLog.findMany({
        where: { createdAt: { gte: combinedStart, lt: combinedEnd } },
        select: {
          id: true,
          commanderId: true,
          question: true,
          category: true,
          confidenceScore: true,
          answeredSuccessfully: true,
          knowledgeSourcesUsed: true,
          createdAt: true,
        },
      }),
      prisma.advisorMessage.findMany({
        where: {
          role: "assistant",
          createdAt: { gte: combinedStart, lt: combinedEnd },
        },
        select: {
          id: true,
          content: true,
          feedback: true,
          modelUsed: true,
          createdAt: true,
        },
      }),
      prisma.dailyTokenUsage.findMany({
        where: { date: { gte: combinedStart, lt: combinedEnd } },
        select: {
          id: true,
          date: true,
          tokensUsed: true,
        },
      }),
      prisma.knowledgeGap.findMany({
        select: {
          id: true,
          clusteredQuestion: true,
          category: true,
          frequency: true,
          status: true,
          resolvedAt: true,
          createdAt: true,
        },
      }),
      prisma.usageEvent.findMany({
        where: { createdAt: { gte: combinedStart, lt: combinedEnd } },
        select: {
          commanderId: true,
          eventType: true,
          eventName: true,
          tier: true,
          createdAt: true,
        },
      }),
      prisma.commander.findMany({
        where: {
          OR: [
            { createdAt: { gte: combinedStart, lt: combinedEnd } },
            {
              usageEvents: {
                some: { createdAt: { gte: combinedStart, lt: combinedEnd } },
              },
            },
            {
              advisorQuestionLogs: {
                some: { createdAt: { gte: combinedStart, lt: combinedEnd } },
              },
            },
          ],
        },
        select: {
          id: true,
          createdAt: true,
          hasCompletedOnboarding: true,
        },
      }),
      prisma.cancellationFeedbackCase.findMany({
        where: {
          OR: [
            {
              cancellationRequestedAt: {
                gte: combinedStart,
                lt: combinedEnd,
              },
            },
            {
              firstRespondedAt: { not: null },
              actionedAt: null,
              closedAt: null,
            },
          ],
        },
        select: {
          cancellationRequestedAt: true,
          cancellationReversedAt: true,
          firstRespondedAt: true,
          reviewStatus: true,
          actionedAt: true,
          closedAt: true,
        },
      }),
      getActionItems(),
    ]);

    const coreStats = buildAIStatsResponse({
      range,
      asOf: now,
      questions,
      messages,
      tokenUsage,
      gaps,
      actionItems,
    });
    const businessInsights = buildAdminBusinessInsights({
      days: rangeDays,
      asOf: now,
      usageEvents,
      questions,
      messages,
      gaps,
      commanders,
      cancellationCases,
    });
    const response: AIStatsResponse = {
      ...coreStats,
      ...businessInsights,
    };

    return NextResponse.json(response, { headers: NO_STORE_HEADERS });
  } catch (error) {
    console.error("[AI dashboard] Failed to load stats", error);
    return NextResponse.json(
      { error: "Unable to load AI dashboard statistics" },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }
}

async function getActionItems(): Promise<AIActionItemSummary[]> {
  // This structural access keeps this read route compatible while a generated
  // Prisma client is refreshed in the same change that adds AIActionItem.
  const delegate = (prisma as unknown as { aiActionItem?: ActionItemDelegate }).aiActionItem;
  if (!delegate) return [];

  const rows = await delegate.findMany({
    orderBy: { updatedAt: "desc" },
    take: 100,
  });

  const priorityOrder: Record<AIActionItemSummary["priority"], number> = {
    critical: 4,
    high: 3,
    medium: 2,
    low: 1,
  };
  const activeStatus = (status: string) =>
    status === "open" || status === "investigating" || status === "planned";
  rows.sort((a, b) =>
    Number(activeStatus(b.status)) - Number(activeStatus(a.status))
    || priorityOrder[asActionPriority(b.priority)] - priorityOrder[asActionPriority(a.priority)]
    || b.createdAt.getTime() - a.createdAt.getTime(),
  );

  return rows.map((row) => ({
    id: row.id,
    sourceType: row.sourceType,
    sourceId: row.sourceId,
    title: row.title,
    description: row.description,
    priority: asActionPriority(row.priority),
    status: asActionStatus(row.status),
    owner: row.owner,
    notes: row.notes,
    actionUrl: row.actionUrl,
    successMeasure: row.successMeasure,
    baselineValue: row.baselineValue,
    targetValue: row.targetValue,
    resultValue: row.resultValue,
    metricUnit: row.metricUnit,
    reviewAt: row.reviewAt?.toISOString() ?? null,
    completedAt: row.completedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }));
}

function asActionPriority(value: string): AIActionItemSummary["priority"] {
  return value === "low" || value === "high" || value === "critical" ? value : "medium";
}

function asActionStatus(value: string): AIActionItemSummary["status"] {
  return value === "investigating"
    || value === "planned"
    || value === "completed"
    || value === "dismissed"
    ? value
    : "open";
}
