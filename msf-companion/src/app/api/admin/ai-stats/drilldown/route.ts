import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-session";
import {
  AGED_GAP_DAYS,
  AIDrilldownItem,
  AIDrilldownResponse,
  AIKpiId,
  AIKpiUnit,
  buildAIStatsRange,
  hasKnowledgeSources,
  isAIKpiId,
  knowledgeSourceCount,
  parseAIStatsRange,
  percent,
  truncateAdminText,
} from "@/lib/admin-ai-stats";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const PAGE_SIZE = 25;
const DAY_MS = 86_400_000;
const MAX_CATEGORY_LENGTH = 80;
const CATEGORY_CONTROL_CHARACTERS = /[\u0000-\u001F\u007F-\u009F]/;
const QUESTION_METRICS = new Set<AIKpiId>([
  "completed-answers",
  "ai-users",
  "classified-pass",
  "low-confidence",
  "grounded",
]);
const NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
} as const;

interface DrilldownData {
  value: number | null;
  unit: AIKpiUnit;
  sampleSize: number;
  items: AIDrilldownItem[];
}

export async function GET(request: Request) {
  const session = await getAdminSession();
  if (!session.isAdmin) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: NO_STORE_HEADERS },
    );
  }

  const params = new URL(request.url).searchParams;
  const metric = params.get("metric");
  if (!isAIKpiId(metric)) {
    return NextResponse.json(
      { error: "Unknown AI dashboard metric" },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  const rangeDays = parseAIStatsRange(params.get("range"));
  if (rangeDays === null) {
    return NextResponse.json(
      { error: "range must be one of 7, 30, or 90" },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  const pageValue = params.get("page") ?? "1";
  const page = Number(pageValue);
  if (!/^\d+$/.test(pageValue) || !Number.isSafeInteger(page) || page < 1) {
    return NextResponse.json(
      { error: "page must be a positive integer" },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  const categoryValue = params.get("category");
  let category: string | null = null;
  if (categoryValue !== null) {
    category = categoryValue.trim();
    if (
      category.length === 0
      || category.length > MAX_CATEGORY_LENGTH
      || CATEGORY_CONTROL_CHARACTERS.test(category)
    ) {
      return NextResponse.json(
        { error: "category must be 1-80 characters without control characters" },
        { status: 400, headers: NO_STORE_HEADERS },
      );
    }
    if (!QUESTION_METRICS.has(metric)) {
      return NextResponse.json(
        { error: "category is only supported for question-based metrics" },
        { status: 400, headers: NO_STORE_HEADERS },
      );
    }
  }

  const now = new Date();
  const range = buildAIStatsRange(rangeDays, now);

  try {
    const data = await loadDrilldown(metric, range.start, range.end, now, category);
    const total = data.items.length;
    const startIndex = (page - 1) * PAGE_SIZE;
    const response: AIDrilldownResponse = {
      metric,
      range,
      filters: { category },
      snapshot: {
        value: data.value,
        unit: data.unit,
        sampleSize: data.sampleSize,
      },
      pagination: {
        page,
        pageSize: PAGE_SIZE,
        total,
        totalPages: Math.ceil(total / PAGE_SIZE),
      },
      items: data.items.slice(startIndex, startIndex + PAGE_SIZE),
    };

    return NextResponse.json(response, { headers: NO_STORE_HEADERS });
  } catch (error) {
    console.error("[AI dashboard] Failed to load drilldown", error);
    return NextResponse.json(
      { error: "Unable to load AI dashboard drilldown" },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }
}

async function loadDrilldown(
  metric: AIKpiId,
  startIso: string,
  endIso: string,
  now: Date,
  category: string | null,
): Promise<DrilldownData> {
  const start = new Date(startIso);
  const end = new Date(endIso);

  if (
    metric === "completed-answers"
    || metric === "ai-users"
    || metric === "classified-pass"
    || metric === "low-confidence"
    || metric === "grounded"
  ) {
    const rows = await prisma.advisorQuestionLog.findMany({
      where: {
        createdAt: { gte: start, lt: end },
        ...(category === null ? {} : { category }),
      },
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
      orderBy: { createdAt: "desc" },
    });

    const toItem = (row: (typeof rows)[number]): AIDrilldownItem => ({
      id: row.id,
      occurredAt: row.createdAt.toISOString(),
      category: row.category,
      question: truncateAdminText(row.question),
      confidenceScore: row.confidenceScore,
      answeredSuccessfully: row.answeredSuccessfully,
      knowledgeSourcesCount: knowledgeSourceCount(row.knowledgeSourcesUsed),
    });

    if (metric === "completed-answers") {
      return {
        value: rows.length,
        unit: "count",
        sampleSize: rows.length,
        items: rows.map(toItem),
      };
    }

    if (metric === "ai-users") {
      const byCommander = new Map<string, (typeof rows)[number][]>();
      for (const row of rows) {
        const group = byCommander.get(row.commanderId) ?? [];
        group.push(row);
        byCommander.set(row.commanderId, group);
      }
      const items = [...byCommander.values()].map((commanderRows) => ({
        ...toItem(commanderRows[0]),
        answerCount: commanderRows.length,
      }));
      return {
        value: items.length,
        unit: "count",
        sampleSize: rows.length,
        items,
      };
    }

    if (metric === "classified-pass") {
      return {
        value: percent(rows.filter((row) => row.answeredSuccessfully).length, rows.length),
        unit: "percent",
        sampleSize: rows.length,
        items: rows.filter((row) => !row.answeredSuccessfully).map(toItem),
      };
    }

    if (metric === "low-confidence") {
      const lowConfidence = rows.filter((row) => row.confidenceScore < 60);
      return {
        value: percent(lowConfidence.length, rows.length),
        unit: "percent",
        sampleSize: rows.length,
        items: lowConfidence.map(toItem),
      };
    }

    const sourceLess = rows.filter((row) => !hasKnowledgeSources(row.knowledgeSourcesUsed));
    return {
      value: percent(rows.length - sourceLess.length, rows.length),
      unit: "percent",
      sampleSize: rows.length,
      items: sourceLess.map(toItem),
    };
  }

  if (metric === "satisfaction" || metric === "rating-coverage") {
    const messages = await prisma.advisorMessage.findMany({
      where: {
        role: "assistant",
        createdAt: { gte: start, lt: end },
      },
      select: {
        id: true,
        content: true,
        feedback: true,
        feedbackComment: true,
        modelUsed: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    });
    const ratings = messages.filter(
      (message) => message.feedback === "positive" || message.feedback === "negative",
    );
    if (metric === "satisfaction") {
      ratings.sort((a, b) => {
        const feedbackOrder = Number(b.feedback === "negative") - Number(a.feedback === "negative");
        return feedbackOrder || b.createdAt.getTime() - a.createdAt.getTime();
      });
    }
    const visibleMessages = metric === "satisfaction"
      ? ratings
      : [...messages].sort((a, b) => {
          const ratingOrder = Number(a.feedback !== null) - Number(b.feedback !== null);
          return ratingOrder || b.createdAt.getTime() - a.createdAt.getTime();
        });
    const items = visibleMessages.map((message) => ({
      id: message.id,
      occurredAt: message.createdAt.toISOString(),
      content: truncateAdminText(message.content, 320),
      feedback: message.feedback,
      feedbackComment: message.feedbackComment
        ? truncateAdminText(message.feedbackComment, 320)
        : null,
      modelUsed: message.modelUsed,
    }));
    return {
      value: metric === "satisfaction"
        ? percent(ratings.filter((message) => message.feedback === "positive").length, ratings.length)
        : percent(ratings.length, messages.length),
      unit: "percent",
      sampleSize: metric === "satisfaction" ? ratings.length : messages.length,
      items,
    };
  }

  if (metric === "tokens-per-answer") {
    const [tokenRows, answerCount] = await Promise.all([
      prisma.dailyTokenUsage.findMany({
        where: { date: { gte: start, lt: end } },
        select: { id: true, date: true, tokensUsed: true },
        orderBy: [{ date: "desc" }, { tokensUsed: "desc" }],
      }),
      prisma.advisorQuestionLog.count({
        where: { createdAt: { gte: start, lt: end } },
      }),
    ]);
    const tokens = tokenRows.reduce((total, row) => total + row.tokensUsed, 0);
    return {
      value: answerCount > 0 ? Math.round((tokens / answerCount) * 10) / 10 : null,
      unit: "tokens",
      sampleSize: answerCount,
      items: tokenRows.map((row) => ({
        id: row.id,
        occurredAt: row.date.toISOString(),
        date: row.date.toISOString().slice(0, 10),
        tokensUsed: row.tokensUsed,
      })),
    };
  }

  const openGaps = await prisma.knowledgeGap.findMany({
    where: { status: "open" },
    select: {
      id: true,
      clusteredQuestion: true,
      category: true,
      frequency: true,
      createdAt: true,
    },
  });
  const agedCutoff = new Date(now.getTime() - AGED_GAP_DAYS * DAY_MS);
  const gaps = metric === "aged-gaps"
    ? openGaps.filter((gap) => gap.createdAt <= agedCutoff)
    : openGaps;
  gaps.sort((a, b) => metric === "aged-gaps"
    ? a.createdAt.getTime() - b.createdAt.getTime()
    : b.frequency - a.frequency || a.createdAt.getTime() - b.createdAt.getTime());

  return {
    value: metric === "aged-gaps"
      ? gaps.length
      : openGaps.reduce((total, gap) => total + gap.frequency, 0),
    unit: "count",
    sampleSize: openGaps.length,
    items: gaps.map((gap) => ({
      id: gap.id,
      occurredAt: gap.createdAt.toISOString(),
      category: gap.category,
      question: truncateAdminText(gap.clusteredQuestion),
      frequency: gap.frequency,
      ageDays: Math.max(0, Math.floor((now.getTime() - gap.createdAt.getTime()) / DAY_MS)),
    })),
  };
}
