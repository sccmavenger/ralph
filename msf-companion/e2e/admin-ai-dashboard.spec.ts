import { expect, test } from "@playwright/test";
import type { BrowserContext, Page, Route } from "@playwright/test";
import { sealData } from "iron-session";
import fs from "fs";
import path from "path";
import type {
  AIActionItemSummary,
  AIDrilldownResponse,
  AIKpi,
  AIKpiId,
  AIStatsRange,
  AIStatsRangeDays,
  AIStatsResponse,
} from "../src/lib/admin-ai-stats";

function getEnvVar(name: string): string {
  const envPath = path.join(__dirname, "..", ".env");
  const envContent = fs.readFileSync(envPath, "utf8");
  const match = envContent.match(new RegExp(name + '="([^"]+)"'));
  if (!match) throw new Error(name + " not found in .env");
  return match[1];
}

async function setAdminSession(context: BrowserContext) {
  const secret = getEnvVar("ADMIN_SESSION_SECRET");
  const sealed = await sealData(
    { isAdmin: true },
    { password: secret, ttl: 86400 },
  );
  await context.addCookies([
    {
      name: "admin-session",
      value: sealed,
      domain: "localhost",
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
}

const DAY_MS = 86_400_000;
const AS_OF = new Date("2026-09-01T00:00:00.000Z");

function makeRange(days: AIStatsRangeDays): AIStatsRange {
  const start = new Date(AS_OF.getTime() - days * DAY_MS);
  const previousStart = new Date(start.getTime() - days * DAY_MS);
  return {
    days,
    start: start.toISOString(),
    end: AS_OF.toISOString(),
    previousStart: previousStart.toISOString(),
    previousEnd: start.toISOString(),
    timezone: "UTC",
  };
}

const KPI_FIXTURES: AIKpi[] = [
  {
    id: "completed-answers",
    label: "Completed answers",
    value: 124,
    previousValue: 100,
    unit: "count",
    change: 24,
    changeType: "percent",
    status: "neutral",
    sampleSize: 124,
    definition: "Advisor answers logged during the selected UTC period.",
    caveat: "Includes answers later classified as unsuccessful.",
    drilldown: { metric: "completed-answers" },
  },
  {
    id: "ai-users",
    label: "AI users",
    value: 62,
    previousValue: 55,
    unit: "count",
    change: 12.7,
    changeType: "percent",
    status: "neutral",
    sampleSize: 124,
    definition: "Distinct commanders with a logged Advisor answer.",
    caveat: null,
    drilldown: { metric: "ai-users" },
  },
  {
    id: "classified-pass",
    label: "Classified pass rate",
    value: 81.5,
    previousValue: 84,
    unit: "percent",
    change: -2.5,
    changeType: "percentage-points",
    target: { operator: ">=", value: 85 },
    status: "watch",
    sampleSize: 124,
    definition: "Share of questions classified as answered successfully.",
    caveat: "This is an automated classifier result.",
    drilldown: { metric: "classified-pass" },
  },
  {
    id: "low-confidence",
    label: "Low-confidence answers",
    value: 22.6,
    previousValue: 14.1,
    unit: "percent",
    change: 8.5,
    changeType: "percentage-points",
    target: { operator: "<=", value: 15 },
    status: "critical",
    sampleSize: 124,
    definition: "Share of logged questions with a confidence score below 60.",
    caveat: "Confidence is not a calibrated probability.",
    drilldown: { metric: "low-confidence" },
  },
  {
    id: "grounded",
    label: "Grounded answers",
    value: 76.6,
    previousValue: 82,
    unit: "percent",
    change: -5.4,
    changeType: "percentage-points",
    target: { operator: ">=", value: 80 },
    status: "watch",
    sampleSize: 124,
    definition: "Share of answers with at least one recorded source.",
    caveat: "A source does not independently verify correctness.",
    drilldown: { metric: "grounded" },
  },
  {
    id: "satisfaction",
    label: "Commander satisfaction",
    value: 88.9,
    previousValue: 86.2,
    unit: "percent",
    change: 2.7,
    changeType: "percentage-points",
    target: { operator: ">=", value: 85 },
    status: "healthy",
    sampleSize: 18,
    definition: "Positive ratings as a share of all ratings.",
    caveat: "Persisted conversations skew toward Premium commanders.",
    drilldown: { metric: "satisfaction" },
  },
  {
    id: "rating-coverage",
    label: "Rating coverage",
    value: 12.5,
    previousValue: 9,
    unit: "percent",
    change: 3.5,
    changeType: "percentage-points",
    target: { operator: ">=", value: 10 },
    status: "healthy",
    sampleSize: 144,
    definition: "Share of persisted assistant messages with a rating.",
    caveat: "Only persisted messages are measurable.",
    drilldown: { metric: "rating-coverage" },
  },
  {
    id: "tokens-per-answer",
    label: "Estimated tokens per answer",
    value: 1500,
    previousValue: 1400,
    unit: "tokens",
    change: 7.1,
    changeType: "percent",
    status: "neutral",
    sampleSize: 124,
    definition: "Tracked output tokens divided by logged Advisor answers.",
    caveat: "The estimate is directional.",
    drilldown: { metric: "tokens-per-answer" },
  },
  {
    id: "open-gap-demand",
    label: "Open gap demand",
    value: 37,
    previousValue: 31,
    unit: "count",
    change: 6,
    changeType: "absolute",
    target: { operator: "=", value: 0 },
    status: "critical",
    sampleSize: 6,
    definition: "Demand across every currently open knowledge gap.",
    caveat: "Prior demand is reconstructed.",
    drilldown: { metric: "open-gap-demand" },
  },
  {
    id: "aged-gaps",
    label: "Aged open gaps",
    value: 3,
    previousValue: 2,
    unit: "count",
    change: 1,
    changeType: "absolute",
    target: { operator: "=", value: 0 },
    status: "watch",
    sampleSize: 6,
    definition: "Open gaps at least 30 days old.",
    caveat: "Prior state is reconstructed.",
    drilldown: { metric: "aged-gaps" },
  },
];

const EXISTING_ACTION: AIActionItemSummary = {
  id: "action-existing",
  sourceType: "knowledge_gap",
  sourceId: "gap-dark-dimension",
  title: "Fix Dark Dimension knowledge gap",
  description: "Add an authoritative source for the repeated question.",
  priority: "high",
  status: "investigating",
  owner: "Content Ops",
  notes: "Verify the official source before publishing.",
  actionUrl: "/admin/ai-dashboard?metric=open-gap-demand",
  successMeasure: "Raise classified pass rate to at least 85%.",
  baselineValue: 75,
  targetValue: 85,
  resultValue: null,
  metricUnit: "percent",
  reviewAt: "2026-09-15T12:00:00.000Z",
  completedAt: null,
  createdAt: "2026-08-28T12:00:00.000Z",
  updatedAt: "2026-08-31T12:00:00.000Z",
};

const CREATED_ACTION: AIActionItemSummary = {
  id: "action-low-confidence",
  sourceType: "advisor_question",
  sourceId: "question-low-1",
  title: "Which team counters Mephisto in Cosmic Crucible?",
  description: "Surfaced from Low-confidence answers.",
  priority: "critical",
  status: "open",
  owner: null,
  notes: null,
  actionUrl: null,
  successMeasure: null,
  baselineValue: null,
  targetValue: null,
  resultValue: null,
  metricUnit: null,
  reviewAt: null,
  completedAt: null,
  createdAt: "2026-08-31T15:00:00.000Z",
  updatedAt: "2026-08-31T15:00:00.000Z",
};

const DECISION_CREATED_ACTION: AIActionItemSummary = {
  ...CREATED_ACTION,
  id: "action-general-quality",
  sourceType: "kpi_anomaly",
  sourceId: "business:quality:general",
  title: "General answers are failing too often",
};

function makeStats(days: AIStatsRangeDays): AIStatsResponse {
  const range = makeRange(days);
  const kpis = KPI_FIXTURES.map((kpi) => {
    if (days === 7 && kpi.id === "completed-answers") {
      return {
        ...kpi,
        value: 17,
        previousValue: 14,
        change: 21.4,
        sampleSize: 17,
      };
    }
    return { ...kpi };
  });

  return {
    range,
    kpis,
    dailyTrend: [
      {
        date: range.start.slice(0, 10),
        completedAnswers: 34,
        aiUsers: 19,
        classifiedPassRate: 82.4,
        lowConfidenceRate: 20.6,
        groundedRate: 79.4,
      },
      {
        date: new Date(new Date(range.start).getTime() + DAY_MS)
          .toISOString()
          .slice(0, 10),
        completedAnswers: 48,
        aiUsers: 27,
        classifiedPassRate: 75,
        lowConfidenceRate: 29.2,
        groundedRate: 68.8,
      },
    ],
    categoryScorecard: [
      {
        category: "war",
        completedAnswers: 48,
        successRate: 75,
        lowConfidenceRate: 29.2,
        groundedRate: 68.8,
        averageConfidence: 64.3,
      },
      {
        category: "arena",
        completedAnswers: 31,
        successRate: 90.3,
        lowConfidenceRate: 9.7,
        groundedRate: 87.1,
        averageConfidence: 82.4,
      },
    ],
    gapSummary: {
      openGaps: 6,
      openDemand: 37,
      agedGaps: 3,
      agedAfterDays: 30,
      byCategory: [
        { category: "war", openGaps: 3, openDemand: 24, agedGaps: 2 },
        { category: "arena", openGaps: 2, openDemand: 9, agedGaps: 1 },
      ],
    },
    modelMix: [
      { model: "gpt-5-mini", answers: 96, share: 77.4 },
      { model: "gpt-5", answers: 28, share: 22.6 },
    ],
    actionItems: [EXISTING_ACTION],
    productUsage: {
      range,
      telemetryStatus: "partial",
      telemetryCaveat:
        "Page-view coverage is directional while the new navigation tracker accumulates a complete comparison window.",
      activeUsers: 19,
      previousActiveUsers: 14,
      activeUserChangePercent: 35.7,
      returningUsers: 5,
      returnRate: 35.7,
      pageViews: 59,
      viewsPerActiveUser: 3.1,
      advisorUsers: 6,
      previousAdvisorUsers: 4,
      advisorAdoptionRate: 31.6,
      advisorAnswers: 39,
      answersPerAdvisorUser: 6.5,
      multiQuestionUsers: 4,
      multiQuestionRate: 66.7,
      aiReturningUsers: 3,
      aiReturnRate: 50,
      newCommanders: 5,
      onboardingCompleted: 4,
      onboardingCompletionRate: 80,
      cancellationRequests: 3,
      previousCancellationRequests: 2,
      cancellationRequestChangePercent: 50,
      cancellationResponses: 2,
      cancellationResponseRate: 66.7,
      cancellationReversals: 1,
      unactionedCancellationResponses: 1,
    },
    productAreas: [
      {
        id: "roster",
        label: "Roster",
        path: "/roster",
        uniqueUsers: 6,
        pageViews: 24,
        adoptionRate: 31.6,
        returningUsers: 3,
        returnRate: 50,
        freeUsers: 4,
        premiumUsers: 2,
      },
      {
        id: "advisor",
        label: "Advisor",
        path: "/advisor",
        uniqueUsers: 6,
        pageViews: 18,
        adoptionRate: 31.6,
        returningUsers: 3,
        returnRate: 50,
        freeUsers: 2,
        premiumUsers: 4,
      },
    ],
    actionableInsights: [
      {
        sourceId: "business:quality:general",
        kind: "improvement",
        priority: "critical",
        title: "General answers are failing too often",
        observation:
          "General questions have a 62.5% classified pass rate across 24 completed answers.",
        whyItMatters:
          "This category concentrates avoidable failed experiences and can erode trust in the Advisor.",
        recommendedAction:
          "Review the failed general answers, improve intent routing, and add authoritative coverage for the largest failure pattern.",
        successMeasure:
          "Raise General classified pass rate to at least 85% with 10 or more new answers.",
        evidence: [
          { label: "classified pass", value: "62.5%" },
          { label: "completed answers", value: "24" },
        ],
        confidence: "high",
        sampleSize: 24,
        caveat: "Pass/fail is produced by the automated answer classifier.",
        actionUrl:
          "/admin/ai-dashboard?range=30&metric=classified-pass&category=general",
        drilldown: { metric: "classified-pass", category: "general" },
        baselineValue: 62.5,
        targetValue: 85,
        metricUnit: "percent",
        reviewAfterDays: 14,
      },
    ],
  };
}

function makeDrilldown(
  metric: AIKpiId,
  days: AIStatsRangeDays,
  category: string | null = null,
): AIDrilldownResponse {
  return {
    metric,
    range: makeRange(days),
    filters: { category },
    snapshot: {
      value: metric === "low-confidence" ? 22.6 : 0,
      unit: metric === "low-confidence" ? "percent" : "count",
      sampleSize: metric === "low-confidence" ? 124 : 0,
    },
    pagination: {
      page: 1,
      pageSize: 25,
      total: metric === "low-confidence" ? 1 : 0,
      totalPages: metric === "low-confidence" ? 1 : 0,
    },
    items:
      metric === "low-confidence"
        ? [
            {
              id: "question-low-1",
              occurredAt: "2026-08-31T14:15:00.000Z",
              category: "war",
              question: "Which team counters Mephisto in Cosmic Crucible?",
              confidenceScore: 42,
              answeredSuccessfully: false,
              knowledgeSourcesCount: 0,
              modelUsed: "gpt-5-mini",
            },
          ]
        : [],
  };
}

const INGEST_STATUS = {
  documentCount: 864,
  creators: ["MobileGamer365"],
  searchConfigured: true,
  refreshState: {
    lastRefreshAt: "2026-08-31T10:00:00.000Z",
    lastResult: {
      videosProcessed: 2,
      documentsUploaded: 18,
      newVideosFound: 1,
      errors: [],
    },
    staleness: [
      {
        name: "MobileGamer365",
        lastVideoDate: "2026-08-30T10:00:00.000Z",
        isStale: false,
      },
    ],
  },
};

const KB_HEALTH = {
  overallStatus: "degraded",
  totalDocuments: 864,
  documentsBySourceType: { official: 500, youtube: 364 },
  documentsByTier: { "1": 500, "2": 364 },
  metadataCoverage: 98.7,
  sources: {
    official: {
      count: 500,
      newestSourceDate: "2026-08-31T08:00:00.000Z",
      status: "healthy",
      ageHours: 4,
      maxAgeHours: 48,
    },
    youtube: {
      count: 364,
      newestSourceDate: "2026-08-20T08:00:00.000Z",
      status: "stale",
      ageHours: 268,
      maxAgeHours: 168,
    },
  },
  staleDocuments: 14,
  warnings: ["YouTube source is stale."],
};

function rangeFromRoute(route: Route): AIStatsRangeDays {
  const value = new URL(route.request().url()).searchParams.get("range");
  if (value === "7") return 7;
  if (value === "90") return 90;
  return 30;
}

async function fulfillJson(route: Route, body: unknown, status = 200) {
  await route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

interface DashboardMockOptions {
  statsResponder?: (route: Route, days: AIStatsRangeDays) => Promise<void>;
  createdAction?: AIActionItemSummary;
}

async function installDashboardMocks(
  page: Page,
  options: DashboardMockOptions = {},
) {
  await page.route("**/api/admin/ai-stats/drilldown?*", async (route) => {
    const url = new URL(route.request().url());
    const metric = url.searchParams.get("metric") as AIKpiId;
    await fulfillJson(
      route,
      makeDrilldown(
        metric,
        rangeFromRoute(route),
        url.searchParams.get("category"),
      ),
    );
  });

  await page.route("**/api/admin/ai-stats?*", async (route) => {
    const days = rangeFromRoute(route);
    if (options.statsResponder) {
      await options.statsResponder(route, days);
      return;
    }
    await fulfillJson(route, makeStats(days));
  });

  await page.route("**/api/admin/ingest", async (route) => {
    if (route.request().method() === "POST") {
      await fulfillJson(route, {
        videosProcessed: 2,
        documentsUploaded: 18,
        errors: [],
        skippedVideos: [],
        logs: [],
        documentCount: 882,
      });
      return;
    }
    await fulfillJson(route, INGEST_STATUS);
  });

  await page.route("**/api/admin/kb-health", async (route) => {
    await fulfillJson(route, KB_HEALTH);
  });

  await page.route("**/api/admin/ai-actions", async (route) => {
    if (route.request().method() !== "POST") {
      await fulfillJson(route, { error: "Method not allowed" }, 405);
      return;
    }
    const input = route.request().postDataJSON() as Record<string, unknown>;
    const base = options.createdAction ?? CREATED_ACTION;
    const action: AIActionItemSummary = {
      ...base,
      sourceType:
        typeof input.sourceType === "string"
          ? input.sourceType
          : base.sourceType,
      sourceId:
        typeof input.sourceId === "string" ? input.sourceId : base.sourceId,
      title: typeof input.title === "string" ? input.title : base.title,
      description:
        typeof input.description === "string"
          ? input.description
          : base.description,
      priority:
        typeof input.priority === "string"
          ? (input.priority as AIActionItemSummary["priority"])
          : base.priority,
      actionUrl:
        typeof input.actionUrl === "string" ? input.actionUrl : base.actionUrl,
      notes:
        input.notes === null || typeof input.notes === "string"
          ? input.notes
          : base.notes,
      successMeasure:
        input.successMeasure === null ||
        typeof input.successMeasure === "string"
          ? input.successMeasure
          : base.successMeasure,
      baselineValue:
        input.baselineValue === null || typeof input.baselineValue === "number"
          ? input.baselineValue
          : base.baselineValue,
      targetValue:
        input.targetValue === null || typeof input.targetValue === "number"
          ? input.targetValue
          : base.targetValue,
      resultValue:
        input.resultValue === null || typeof input.resultValue === "number"
          ? input.resultValue
          : base.resultValue,
      metricUnit:
        input.metricUnit === null || typeof input.metricUnit === "string"
          ? input.metricUnit
          : base.metricUnit,
      reviewAt:
        input.reviewAt === null || typeof input.reviewAt === "string"
          ? input.reviewAt
          : base.reviewAt,
    };
    await fulfillJson(route, { action }, 201);
  });

  await page.route("**/api/admin/ai-actions/*", async (route) => {
    if (route.request().method() !== "PATCH") {
      await fulfillJson(route, { error: "Method not allowed" }, 405);
      return;
    }
    const input = route.request().postDataJSON() as Record<string, unknown>;
    const action: AIActionItemSummary = {
      ...EXISTING_ACTION,
      status:
        typeof input.status === "string"
          ? (input.status as AIActionItemSummary["status"])
          : EXISTING_ACTION.status,
      priority:
        typeof input.priority === "string"
          ? (input.priority as AIActionItemSummary["priority"])
          : EXISTING_ACTION.priority,
      owner:
        input.owner === null || typeof input.owner === "string"
          ? input.owner
          : EXISTING_ACTION.owner,
      notes:
        input.notes === null || typeof input.notes === "string"
          ? input.notes
          : EXISTING_ACTION.notes,
      actionUrl:
        input.actionUrl === null || typeof input.actionUrl === "string"
          ? input.actionUrl
          : EXISTING_ACTION.actionUrl,
      successMeasure:
        input.successMeasure === null ||
        typeof input.successMeasure === "string"
          ? input.successMeasure
          : EXISTING_ACTION.successMeasure,
      baselineValue:
        input.baselineValue === null || typeof input.baselineValue === "number"
          ? input.baselineValue
          : EXISTING_ACTION.baselineValue,
      targetValue:
        input.targetValue === null || typeof input.targetValue === "number"
          ? input.targetValue
          : EXISTING_ACTION.targetValue,
      resultValue:
        input.resultValue === null || typeof input.resultValue === "number"
          ? input.resultValue
          : EXISTING_ACTION.resultValue,
      metricUnit:
        input.metricUnit === null || typeof input.metricUnit === "string"
          ? input.metricUnit
          : EXISTING_ACTION.metricUnit,
      reviewAt:
        input.reviewAt === null || typeof input.reviewAt === "string"
          ? input.reviewAt
          : EXISTING_ACTION.reviewAt,
      updatedAt: "2026-08-31T16:00:00.000Z",
    };
    await fulfillJson(route, { action });
  });
}

const EXPECTED_CARD_CONTENT: Record<
  AIKpiId,
  { value: string; target: string }
> = {
  "completed-answers": { value: "124", target: "No fixed target" },
  "ai-users": { value: "62", target: "No fixed target" },
  "classified-pass": { value: "81.5%", target: "Target >=85%" },
  "low-confidence": { value: "22.6%", target: "Target <=15%" },
  grounded: { value: "76.6%", target: "Target >=80%" },
  satisfaction: { value: "88.9%", target: "Target >=85%" },
  "rating-coverage": { value: "12.5%", target: "Target >=10%" },
  "tokens-per-answer": { value: "1.5K", target: "No fixed target" },
  "open-gap-demand": { value: "37", target: "Target =0" },
  "aged-gaps": { value: "3", target: "Target =0" },
};

test.describe("Admin AI Dashboard", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window.navigator, "standalone", { value: true });
      const originalMatchMedia = window.matchMedia.bind(window);
      window.matchMedia = (query: string) => {
        if (query === "(display-mode: standalone)") {
          return {
            matches: true,
            media: query,
            addEventListener: () => {},
            removeEventListener: () => {},
            addListener: () => {},
            removeListener: () => {},
            onchange: null,
            dispatchEvent: () => true,
          } as MediaQueryList;
        }
        return originalMatchMedia(query);
      };
    });
  });

  test("redirects an unauthenticated user to the admin login", async ({
    page,
    context,
  }) => {
    await context.clearCookies();
    await page.goto("/admin/ai-dashboard");
    await expect(page).toHaveURL(/\/admin\/?$/);
    await expect(page.getByTestId("ai-dashboard")).toHaveCount(0);
  });

  test("renders all KPI targets, analysis sections, and an editable action register", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await installDashboardMocks(page);
    await setAdminSession(page.context());
    await page.goto("/admin/ai-dashboard");

    await expect(page.getByTestId("ai-dashboard")).toBeVisible();
    await expect(page.getByTestId("ai-kpis").getByRole("button")).toHaveCount(
      10,
    );

    for (const kpi of KPI_FIXTURES) {
      await test.step("shows " + kpi.label, async () => {
        const card = page.getByTestId("kpi-" + kpi.id);
        await expect(card).toBeVisible();
        await expect(card).toContainText(kpi.label);
        await expect(card).toContainText(EXPECTED_CARD_CONTENT[kpi.id].value);
        await expect(card).toContainText(EXPECTED_CARD_CONTENT[kpi.id].target);
        await expect(card).toContainText("n=" + kpi.sampleSize);
      });
    }

    await expect(page.getByTestId("ai-quality-trend")).toContainText(
      "Completed-answer trend",
    );
    await expect(page.getByTestId("ai-model-mix")).toContainText("gpt-5-mini");

    const scorecard = page.getByTestId("ai-category-scorecard");
    await expect(scorecard).toContainText("Category scorecard");
    await expect(scorecard).toContainText("War");
    await expect(scorecard).toContainText("29.2%");

    const decisionBrief = page.getByTestId("ai-decision-brief");
    await expect(decisionBrief).toContainText("What should we act on now?");
    await expect(decisionBrief).toContainText("What we see");
    await expect(decisionBrief).toContainText("Why it matters");
    await expect(decisionBrief).toContainText("Do next");
    await expect(decisionBrief).toContainText("Success measure");
    await expect(decisionBrief).toContainText(
      "General answers are failing too often",
    );
    await expect(page.getByTestId("ai-attention-queue")).toHaveCount(0);
    await expect(page.getByTestId("ai-top-questions")).toHaveCount(0);
    await expect(
      page.getByText("Repeated questions", { exact: true }),
    ).toHaveCount(0);

    const usage = page.getByTestId("ai-product-usage");
    await expect(usage).toContainText("How commanders are using the toolkit");
    await expect(usage).toContainText("Directional · partial telemetry");
    await expect(usage).toContainText(
      "Page-view coverage is directional while the new navigation tracker accumulates a complete comparison window.",
    );
    await expect(usage).toContainText("Active commanders");
    await expect(usage).toContainText("Advisor reach");
    await expect(usage).toContainText("Answers per Advisor user");
    await expect(usage).toContainText("Advisor return rate");
    await expect(usage).toContainText("New-user activation");
    await expect(usage).toContainText("Cancellation learning");
    await expect(usage).toContainText("Feedback awaiting action");
    await expect(usage).toContainText("Roster");
    await expect(usage).toContainText("Advisor");

    const knowledge = page.getByTestId("ai-knowledge-operations");
    await expect(knowledge).toContainText("Gap backlog");
    await expect(knowledge).toContainText("6 open");
    await expect(knowledge).toContainText("37");
    await expect(knowledge).toContainText("Knowledge health");
    await expect(knowledge).toContainText("864");
    await expect(knowledge).toContainText("98.7%");
    await expect(knowledge).toContainText("YouTube source is stale.");
    await expect(
      knowledge.getByRole("button", { name: "Refresh knowledge base" }),
    ).toBeEnabled();

    const register = page.getByTestId("ai-action-register");
    await expect(register).toContainText("1 active");
    await expect(register).toContainText("0 unassigned");
    await expect(register).toContainText("0 overdue");
    const existingAction = page.getByTestId("ai-action-action-existing");
    await expect(existingAction).toContainText(
      "Fix Dark Dimension knowledge gap",
    );
    await expect(existingAction).toContainText(
      "Success: Raise classified pass rate to at least 85%.",
    );
    await expect(existingAction).toContainText(
      "Baseline 75% · target 85% · result —",
    );
    await existingAction.getByRole("button").first().click();
    await expect(existingAction.getByLabel("Status")).toHaveValue(
      "investigating",
    );
    await expect(existingAction.getByLabel("Owner")).toHaveValue("Content Ops");
    await expect(existingAction.getByLabel("Notes and next step")).toHaveValue(
      "Verify the official source before publishing.",
    );
    await expect(existingAction.getByLabel("Success measure")).toHaveValue(
      "Raise classified pass rate to at least 85%.",
    );
    await expect(existingAction.getByLabel("Baseline")).toHaveValue("75");
    await expect(existingAction.getByLabel("Target")).toHaveValue("85");
    await expect(existingAction.getByLabel("Result")).toHaveValue("");
    await expect(existingAction.getByLabel("Metric unit")).toHaveValue(
      "percent",
    );
    await expect(existingAction.getByLabel("Review date")).toHaveValue(
      "2026-09-15",
    );
    await expect(
      existingAction.getByRole("link", { name: "Open action link" }),
    ).toHaveAttribute("href", "/admin/ai-dashboard?metric=open-gap-demand");

    await existingAction.getByLabel("Status").selectOption("planned");
    await existingAction.getByLabel("Owner").fill("AI Operations");
    const patchRequestPromise = page.waitForRequest(
      (request) =>
        request.method() === "PATCH" &&
        new URL(request.url()).pathname ===
          "/api/admin/ai-actions/action-existing",
    );
    await existingAction.getByRole("button", { name: "Save action" }).click();
    const patchRequest = await patchRequestPromise;
    expect(patchRequest.postDataJSON()).toMatchObject({
      status: "planned",
      owner: "AI Operations",
      successMeasure: "Raise classified pass rate to at least 85%.",
      baselineValue: 75,
      targetValue: 85,
      resultValue: null,
      metricUnit: "percent",
      reviewAt: "2026-09-15T12:00:00.000Z",
    });
    await expect(
      existingAction.getByText("Saved", { exact: true }),
    ).toBeVisible();
  });

  test("switching to seven days refetches the dashboard for that range", async ({
    page,
  }) => {
    const requestedRanges: AIStatsRangeDays[] = [];
    await installDashboardMocks(page, {
      statsResponder: async (route, days) => {
        requestedRanges.push(days);
        await fulfillJson(route, makeStats(days));
      },
    });
    await setAdminSession(page.context());
    await page.goto("/admin/ai-dashboard");
    await expect(page.getByTestId("kpi-completed-answers")).toContainText(
      "124",
    );

    const sevenDayRequest = page.waitForRequest((request) => {
      const url = new URL(request.url());
      return (
        url.pathname === "/api/admin/ai-stats" &&
        url.searchParams.get("range") === "7"
      );
    });
    await page
      .getByTestId("ai-range-control")
      .getByRole("button", { name: "7 days" })
      .click();
    await sevenDayRequest;

    await expect(page).toHaveURL(/range=7/);
    await expect(page.getByTestId("kpi-completed-answers")).toContainText("17");
    expect(requestedRanges).toContain(30);
    expect(requestedRanges).toContain(7);
  });

  test("reviews category evidence and turns a decision insight into a measurable action", async ({
    page,
  }) => {
    await installDashboardMocks(page, {
      createdAction: DECISION_CREATED_ACTION,
    });
    await setAdminSession(page.context());
    await page.goto("/admin/ai-dashboard");

    const insight = page.getByTestId("ai-insight-business-quality-general");
    await expect(insight).toContainText("What we see");
    await expect(insight).toContainText("Why it matters");
    await expect(insight).toContainText("Do next");
    await expect(insight).toContainText("Success measure");

    const evidenceRequestPromise = page.waitForRequest((request) => {
      const url = new URL(request.url());
      return (
        url.pathname === "/api/admin/ai-stats/drilldown" &&
        url.searchParams.get("metric") === "classified-pass" &&
        url.searchParams.get("category") === "general" &&
        url.searchParams.get("range") === "30"
      );
    });
    await insight.getByRole("button", { name: "Review evidence" }).click();
    await evidenceRequestPromise;
    await expect(page).toHaveURL(
      /metric=classified-pass.*category=general|category=general.*metric=classified-pass/,
    );
    const drawer = page.getByTestId("ai-kpi-drilldown");
    await expect(drawer).toContainText("Filtered to General");
    await drawer.getByRole("button", { name: "Close KPI details" }).click();

    const beforeTrack = Date.now();
    const actionRequestPromise = page.waitForRequest(
      (request) =>
        request.method() === "POST" &&
        new URL(request.url()).pathname === "/api/admin/ai-actions",
    );
    await insight.getByRole("button", { name: "Track action" }).click();
    const actionRequest = await actionRequestPromise;
    const actionInput = actionRequest.postDataJSON() as Record<string, unknown>;
    expect(actionInput).toMatchObject({
      sourceType: "kpi_anomaly",
      sourceId: "business:quality:general",
      title: "General answers are failing too often",
      successMeasure:
        "Raise General classified pass rate to at least 85% with 10 or more new answers.",
      baselineValue: 62.5,
      targetValue: 85,
      metricUnit: "percent",
      actionUrl:
        "/admin/ai-dashboard?range=30&metric=classified-pass&category=general",
    });
    expect(actionInput.reviewAt).toEqual(expect.any(String));
    const reviewAt = Date.parse(actionInput.reviewAt as string);
    expect(reviewAt).toBeGreaterThanOrEqual(beforeTrack + 13 * DAY_MS);
    expect(reviewAt).toBeLessThanOrEqual(Date.now() + 15 * DAY_MS);

    const register = page.getByTestId("ai-action-register");
    await expect(register).toContainText(
      "Action is now tracked in the register.",
    );
    const trackedAction = page.getByTestId("ai-action-action-general-quality");
    await expect(trackedAction).toContainText(
      "General answers are failing too often",
    );
    await expect(trackedAction).toContainText(
      "Success: Raise General classified pass rate to at least 85% with 10 or more new answers.",
    );
    await expect(trackedAction).toContainText(
      "Baseline 62.5% · target 85% · result —",
    );
  });

  test("drills into low-confidence records and promotes a record to an action", async ({
    page,
  }) => {
    await installDashboardMocks(page);
    await setAdminSession(page.context());
    await page.goto("/admin/ai-dashboard");
    await expect(page.getByTestId("kpi-low-confidence")).toBeVisible();

    const drilldownRequest = page.waitForRequest((request) => {
      const url = new URL(request.url());
      return (
        url.pathname === "/api/admin/ai-stats/drilldown" &&
        url.searchParams.get("metric") === "low-confidence" &&
        url.searchParams.get("range") === "30"
      );
    });
    await page.getByTestId("kpi-low-confidence").click();
    await drilldownRequest;

    const drawer = page.getByTestId("ai-kpi-drilldown");
    await expect(drawer).toBeVisible();
    await expect(
      drawer.getByRole("heading", { name: "Low-confidence answers" }),
    ).toBeVisible();
    await expect(drawer).toContainText(
      "Share of logged questions with a confidence score below 60.",
    );

    const record = drawer.getByTestId("ai-drilldown-item");
    await expect(record).toHaveCount(1);
    await expect(record).toContainText(
      "Which team counters Mephisto in Cosmic Crucible?",
    );
    await expect(record).toContainText("Confidence 42");
    await expect(record).toContainText("Classified fail");
    await expect(record).toContainText("0 sources");

    const actionRequestPromise = page.waitForRequest(
      (request) =>
        request.method() === "POST" &&
        new URL(request.url()).pathname === "/api/admin/ai-actions",
    );
    await record.getByRole("button", { name: "Track action" }).click();
    const actionRequest = await actionRequestPromise;
    expect(actionRequest.postDataJSON()).toMatchObject({
      sourceType: "advisor_question",
      sourceId: "question-low-1",
      title: "Which team counters Mephisto in Cosmic Crucible?",
      priority: "critical",
      actionUrl: "/admin/ai-dashboard?range=30&metric=low-confidence",
    });

    await drawer.getByRole("button", { name: "Close KPI details" }).click();
    await expect(drawer).toHaveCount(0);
    const register = page.getByTestId("ai-action-register");
    await expect(register).toContainText(
      "Action is now tracked in the register.",
    );
    await expect(register).toContainText("2 active");
    await expect(
      page.getByTestId("ai-action-action-low-confidence"),
    ).toContainText("Which team counters Mephisto in Cosmic Crucible?");
  });

  test("keeps the closed dashboard within a 375px viewport", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await installDashboardMocks(page);
    await setAdminSession(page.context());
    await page.goto("/admin/ai-dashboard");

    await expect(page.getByTestId("ai-dashboard-content")).toBeVisible();
    await expect(page.getByTestId("ai-kpi-drilldown")).toHaveCount(0);

    const widths = await page.evaluate(() => ({
      viewport: window.innerWidth,
      documentClient: document.documentElement.clientWidth,
      documentScroll: document.documentElement.scrollWidth,
      bodyClient: document.body.clientWidth,
      bodyScroll: document.body.scrollWidth,
    }));
    expect(widths.viewport).toBe(375);
    expect(widths.documentScroll).toBeLessThanOrEqual(
      widths.documentClient + 1,
    );
    expect(widths.bodyScroll).toBeLessThanOrEqual(widths.bodyClient + 1);
  });

  test("surfaces a stats API failure and retries successfully", async ({
    page,
  }) => {
    let attempts = 0;
    await installDashboardMocks(page, {
      statsResponder: async (route, days) => {
        attempts += 1;
        if (attempts === 1) {
          await fulfillJson(route, { error: "temporary outage" }, 503);
          return;
        }
        await fulfillJson(route, makeStats(days));
      },
    });
    await setAdminSession(page.context());
    await page.goto("/admin/ai-dashboard");

    const alert = page.locator('[role="alert"]').filter({
      hasText: "Dashboard request failed (503)",
    });
    await expect(alert).toContainText("Dashboard request failed (503)");
    const successfulRetry = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return (
        url.pathname === "/api/admin/ai-stats" &&
        response.request().method() === "GET" &&
        response.status() === 200
      );
    });
    await alert.getByRole("button", { name: "Retry" }).click();
    await successfulRetry;

    await expect(page.getByTestId("ai-kpis")).toBeVisible();
    await expect(page.getByTestId("kpi-low-confidence")).toContainText("22.6%");
    expect(attempts).toBe(2);
  });
});
