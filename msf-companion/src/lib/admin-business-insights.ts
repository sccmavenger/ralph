export const BUSINESS_INSIGHT_RANGE_DAYS = [7, 30, 90] as const;

export type BusinessInsightRangeDays =
  (typeof BUSINESS_INSIGHT_RANGE_DAYS)[number];
export type BusinessInsightKind =
  | "opportunity"
  | "improvement"
  | "risk"
  | "behavior"
  | "measurement";
export type BusinessInsightPriority = "critical" | "high" | "medium" | "low";
export type BusinessInsightConfidence = "high" | "medium" | "low";

export interface BusinessInsightsRange {
  days: BusinessInsightRangeDays;
  start: string;
  end: string;
  previousStart: string;
  previousEnd: string;
  timezone: "UTC";
}

export interface BusinessUsageEventTelemetry {
  commanderId: string;
  eventType: string;
  eventName: string;
  tier: string;
  createdAt: Date;
}

export interface BusinessAdvisorQuestionTelemetry {
  commanderId: string;
  category: string;
  confidenceScore: number;
  answeredSuccessfully: boolean;
  createdAt: Date;
}

export interface BusinessAdvisorMessageTelemetry {
  feedback: string | null;
  createdAt: Date;
}

export interface BusinessKnowledgeGapTelemetry {
  category: string;
  frequency: number;
  status: string;
  createdAt: Date;
  resolvedAt: Date | null;
}

export interface BusinessCommanderTelemetry {
  id: string;
  createdAt: Date;
  hasCompletedOnboarding: boolean;
}

export interface BusinessCancellationCaseTelemetry {
  cancellationRequestedAt: Date;
  cancellationReversedAt: Date | null;
  firstRespondedAt: Date | null;
  reviewStatus: string;
  actionedAt?: Date | null;
  closedAt?: Date | null;
}

export interface BuildAdminBusinessInsightsInput {
  days: BusinessInsightRangeDays;
  asOf: Date;
  usageEvents: BusinessUsageEventTelemetry[];
  questions: BusinessAdvisorQuestionTelemetry[];
  messages: BusinessAdvisorMessageTelemetry[];
  gaps: BusinessKnowledgeGapTelemetry[];
  commanders: BusinessCommanderTelemetry[];
  cancellationCases: BusinessCancellationCaseTelemetry[];
}

export interface AdminProductUsage {
  range: BusinessInsightsRange;
  telemetryStatus: "partial";
  telemetryCaveat: string;
  activeUsers: number;
  previousActiveUsers: number;
  activeUserChangePercent: number | null;
  returningUsers: number;
  returnRate: number | null;
  pageViews: number;
  viewsPerActiveUser: number | null;
  advisorUsers: number;
  previousAdvisorUsers: number;
  advisorAdoptionRate: number | null;
  advisorAnswers: number;
  answersPerAdvisorUser: number | null;
  multiQuestionUsers: number;
  multiQuestionRate: number | null;
  aiReturningUsers: number;
  aiReturnRate: number | null;
  newCommanders: number;
  onboardingCompleted: number;
  onboardingCompletionRate: number | null;
  cancellationRequests: number;
  previousCancellationRequests: number;
  cancellationRequestChangePercent: number | null;
  cancellationResponses: number;
  cancellationResponseRate: number | null;
  cancellationReversals: number;
  unactionedCancellationResponses: number;
}

export interface BusinessProductAreaMetrics {
  id: string;
  label: string;
  path: string;
  uniqueUsers: number;
  pageViews: number;
  adoptionRate: number | null;
  returningUsers: number;
  returnRate: number | null;
  freeUsers: number;
  premiumUsers: number;
}

export interface BusinessInsightEvidence {
  label: string;
  value: string;
}

export interface ActionableBusinessInsight {
  sourceId: string;
  kind: BusinessInsightKind;
  priority: BusinessInsightPriority;
  title: string;
  observation: string;
  whyItMatters: string;
  recommendedAction: string;
  successMeasure: string;
  evidence: BusinessInsightEvidence[];
  confidence: BusinessInsightConfidence;
  sampleSize: number;
  caveat: string | null;
  actionUrl: string;
  drilldown: {
    metric: string;
    category?: string;
  } | null;
  baselineValue: number | null;
  targetValue: number | null;
  metricUnit: string | null;
  reviewAfterDays: number;
}

export interface AdminBusinessInsightsResponse {
  productUsage: AdminProductUsage;
  productAreas: BusinessProductAreaMetrics[];
  actionableInsights: ActionableBusinessInsight[];
}

const DAY_MS = 86_400_000;
const PRODUCT_AREAS = [
  { id: "dashboard", label: "Dashboard", path: "/dashboard", matches: ["/dashboard"] },
  { id: "advisor", label: "Advisor", path: "/advisor", matches: ["/advisor"] },
  { id: "roster", label: "Roster", path: "/roster", matches: ["/roster"] },
  { id: "heroes", label: "Heroes", path: "/heroes", matches: ["/heroes"] },
  { id: "teams", label: "Teams", path: "/teams", matches: ["/teams"] },
  { id: "analysis", label: "Analysis & planning", path: "/analyze", matches: ["/analyze", "/planner"] },
  { id: "inventory", label: "Inventory", path: "/inventory", matches: ["/inventory"] },
  { id: "profile", label: "Profile", path: "/profile", matches: ["/profile"] },
] as const;

export function buildBusinessInsightsRange(
  days: BusinessInsightRangeDays,
  asOf = new Date(),
): BusinessInsightsRange {
  const end = new Date(asOf);
  end.setUTCHours(0, 0, 0, 0);
  end.setUTCDate(end.getUTCDate() + 1);
  const start = new Date(end.getTime() - days * DAY_MS);
  const previousEnd = new Date(start);
  const previousStart = new Date(previousEnd.getTime() - days * DAY_MS);
  return {
    days,
    start: start.toISOString(),
    end: end.toISOString(),
    previousStart: previousStart.toISOString(),
    previousEnd: previousEnd.toISOString(),
    timezone: "UTC",
  };
}

export function buildAdminBusinessInsights(
  input: BuildAdminBusinessInsightsInput,
): AdminBusinessInsightsResponse {
  const range = buildBusinessInsightsRange(input.days, input.asOf);
  const start = new Date(range.start);
  const end = new Date(range.end);
  const previousStart = new Date(range.previousStart);
  const previousEnd = new Date(range.previousEnd);

  const currentUsage = input.usageEvents.filter((row) => inWindow(row.createdAt, start, end));
  const previousUsage = input.usageEvents.filter((row) =>
    inWindow(row.createdAt, previousStart, previousEnd),
  );
  const currentQuestions = input.questions.filter((row) =>
    inWindow(row.createdAt, start, end),
  );
  const previousQuestions = input.questions.filter((row) =>
    inWindow(row.createdAt, previousStart, previousEnd),
  );
  const currentMessages = input.messages.filter((row) =>
    inWindow(row.createdAt, start, end),
  );

  const currentActive = unionSets(
    new Set(currentUsage.map((row) => row.commanderId)),
    new Set(currentQuestions.map((row) => row.commanderId)),
  );
  const previousActive = unionSets(
    new Set(previousUsage.map((row) => row.commanderId)),
    new Set(previousQuestions.map((row) => row.commanderId)),
  );
  const currentAdvisorUsers = new Set(currentQuestions.map((row) => row.commanderId));
  const previousAdvisorUsers = new Set(previousQuestions.map((row) => row.commanderId));
  const currentPageViews = currentUsage.filter((row) => row.eventType === "page_view");
  const answersByCommander = countBy(currentQuestions, (row) => row.commanderId);
  const currentNewCommanders = input.commanders.filter((row) =>
    inWindow(row.createdAt, start, end),
  );
  const currentCancellationCohort = input.cancellationCases.filter(
    (row) =>
      inWindow(row.cancellationRequestedAt, start, end)
      && row.cancellationReversedAt === null,
  );
  const previousCancellationCohort = input.cancellationCases.filter(
    (row) =>
      inWindow(row.cancellationRequestedAt, previousStart, previousEnd)
      && row.cancellationReversedAt === null,
  );

  const productUsage: AdminProductUsage = {
    range,
    telemetryStatus: "partial",
    telemetryCaveat:
      "Page and product-area telemetry is directional while corrected client-navigation tracking accumulates a full comparison period. Advisor answer logs and account records are independently measured.",
    activeUsers: currentActive.size,
    previousActiveUsers: previousActive.size,
    activeUserChangePercent: percentChange(currentActive.size, previousActive.size),
    returningUsers: intersectionSize(previousActive, currentActive),
    returnRate: percent(intersectionSize(previousActive, currentActive), previousActive.size),
    pageViews: currentPageViews.length,
    viewsPerActiveUser: ratio(currentPageViews.length, currentActive.size),
    advisorUsers: currentAdvisorUsers.size,
    previousAdvisorUsers: previousAdvisorUsers.size,
    advisorAdoptionRate: percent(currentAdvisorUsers.size, currentActive.size),
    advisorAnswers: currentQuestions.length,
    answersPerAdvisorUser: ratio(currentQuestions.length, currentAdvisorUsers.size),
    multiQuestionUsers: [...answersByCommander.values()].filter((count) => count > 1).length,
    multiQuestionRate: percent(
      [...answersByCommander.values()].filter((count) => count > 1).length,
      currentAdvisorUsers.size,
    ),
    aiReturningUsers: intersectionSize(previousAdvisorUsers, currentAdvisorUsers),
    aiReturnRate: percent(
      intersectionSize(previousAdvisorUsers, currentAdvisorUsers),
      previousAdvisorUsers.size,
    ),
    newCommanders: currentNewCommanders.length,
    onboardingCompleted: currentNewCommanders.filter(
      (row) => row.hasCompletedOnboarding,
    ).length,
    onboardingCompletionRate: percent(
      currentNewCommanders.filter((row) => row.hasCompletedOnboarding).length,
      currentNewCommanders.length,
    ),
    cancellationRequests: currentCancellationCohort.length,
    previousCancellationRequests: previousCancellationCohort.length,
    cancellationRequestChangePercent: percentChange(
      currentCancellationCohort.length,
      previousCancellationCohort.length,
    ),
    cancellationResponses: currentCancellationCohort.filter(
      (row) => row.firstRespondedAt !== null,
    ).length,
    cancellationResponseRate: percent(
      currentCancellationCohort.filter((row) => row.firstRespondedAt !== null).length,
      currentCancellationCohort.length,
    ),
    cancellationReversals: input.cancellationCases.filter(
      (row) =>
        inWindow(row.cancellationRequestedAt, start, end)
        && row.cancellationReversedAt !== null,
    ).length,
    unactionedCancellationResponses: input.cancellationCases.filter(
      isUnactionedCancellationResponse,
    ).length,
  };

  const productAreas = buildProductAreas(
    currentUsage,
    previousUsage,
    currentActive.size,
  );
  const actionableInsights = buildActionableInsights({
    productUsage,
    productAreas,
    currentQuestions,
    currentMessages,
    gaps: input.gaps,
    currentNewCommanders,
  });

  return { productUsage, productAreas, actionableInsights };
}

function buildProductAreas(
  currentUsage: BusinessUsageEventTelemetry[],
  previousUsage: BusinessUsageEventTelemetry[],
  activeUserCount: number,
): BusinessProductAreaMetrics[] {
  const currentPageViews = currentUsage.filter((row) => row.eventType === "page_view");
  const previousPageViews = previousUsage.filter((row) => row.eventType === "page_view");

  return PRODUCT_AREAS.map((area) => {
    const currentRows = currentPageViews.filter((row) => matchesArea(row.eventName, area.matches));
    const previousRows = previousPageViews.filter((row) => matchesArea(row.eventName, area.matches));
    const currentUsers = new Set(currentRows.map((row) => row.commanderId));
    const previousUsers = new Set(previousRows.map((row) => row.commanderId));
    const freeUsers = new Set(
      currentRows
        .filter((row) => row.tier.toUpperCase() !== "PREMIUM")
        .map((row) => row.commanderId),
    );
    const premiumUsers = new Set(
      currentRows
        .filter((row) => row.tier.toUpperCase() === "PREMIUM")
        .map((row) => row.commanderId),
    );
    return {
      id: area.id,
      label: area.label,
      path: area.path,
      uniqueUsers: currentUsers.size,
      pageViews: currentRows.length,
      adoptionRate: percent(currentUsers.size, activeUserCount),
      returningUsers: intersectionSize(previousUsers, currentUsers),
      returnRate: percent(intersectionSize(previousUsers, currentUsers), previousUsers.size),
      freeUsers: freeUsers.size,
      premiumUsers: premiumUsers.size,
    };
  }).sort(
    (a, b) =>
      b.uniqueUsers - a.uniqueUsers
      || b.pageViews - a.pageViews
      || a.label.localeCompare(b.label),
  );
}

function buildActionableInsights(input: {
  productUsage: AdminProductUsage;
  productAreas: BusinessProductAreaMetrics[];
  currentQuestions: BusinessAdvisorQuestionTelemetry[];
  currentMessages: BusinessAdvisorMessageTelemetry[];
  gaps: BusinessKnowledgeGapTelemetry[];
  currentNewCommanders: BusinessCommanderTelemetry[];
}): ActionableBusinessInsight[] {
  const insights: ActionableBusinessInsight[] = [];
  addCategoryQualityInsight(insights, input.currentQuestions);
  addRatingCoverageInsight(insights, input.currentMessages);
  addGapFragmentationInsight(insights, input.gaps);
  addAdvisorDepthInsight(insights, input.productUsage);
  addAdvisorReturnInsight(insights, input.productUsage);
  addTopProductAreaInsight(insights, input.productAreas, input.productUsage);
  addOnboardingInsight(insights, input.productUsage, input.currentNewCommanders.length);
  addCancellationInsights(insights, input.productUsage);
  addProductTelemetryInsight(insights, input.productUsage, input.productAreas);

  const priorityRank: Record<BusinessInsightPriority, number> = {
    critical: 4,
    high: 3,
    medium: 2,
    low: 1,
  };
  const kindRank: Record<BusinessInsightKind, number> = {
    risk: 5,
    improvement: 4,
    opportunity: 3,
    behavior: 2,
    measurement: 1,
  };
  return insights.sort(
    (a, b) =>
      priorityRank[b.priority] - priorityRank[a.priority]
      || kindRank[b.kind] - kindRank[a.kind]
      || b.sampleSize - a.sampleSize
      || a.sourceId.localeCompare(b.sourceId),
  );
}

function addCategoryQualityInsight(
  insights: ActionableBusinessInsight[],
  questions: BusinessAdvisorQuestionTelemetry[],
) {
  const categories = groupBy(questions, (row) => normalizeCategory(row.category));
  const candidates = [...categories.entries()]
    .map(([category, rows]) => ({
      category,
      rows,
      passRate: percent(rows.filter((row) => row.answeredSuccessfully).length, rows.length),
    }))
    .filter((item) => item.rows.length >= 5 && (item.passRate ?? 100) < 85)
    .sort(
      (a, b) =>
        (a.passRate ?? 100) - (b.passRate ?? 100)
        || b.rows.length - a.rows.length,
    );
  const weakest = candidates[0];
  if (!weakest || weakest.passRate === null) return;

  const failed = weakest.rows.filter((row) => !row.answeredSuccessfully).length;
  const categoryLabel = titleCase(weakest.category);
  insights.push({
    sourceId: `business:quality:${weakest.category.toLowerCase()}`,
    kind: "improvement",
    priority: weakest.passRate < 60 ? "critical" : "high",
    title: `Improve ${categoryLabel} Advisor answers`,
    observation: `${categoryLabel} has the weakest meaningful category result: ${formatPercent(weakest.passRate)} classified pass across ${weakest.rows.length} answers.`,
    whyItMatters: `${failed} answers were classified as unsuccessful, concentrating avoidable trust and retention risk in one topic area.`,
    recommendedAction: `Review the failed ${categoryLabel} answers, group the missing intents, and add or refresh the highest-value source material before retesting.`,
    successMeasure: `Raise ${categoryLabel} classified pass rate to at least 85% with 10 or more new answers.`,
    evidence: [
      { label: "Classified pass", value: formatPercent(weakest.passRate) },
      { label: "Failed answers", value: `${failed} of ${weakest.rows.length}` },
      {
        label: "Low confidence",
        value: formatPercent(
          percent(
            weakest.rows.filter((row) => row.confidenceScore < 60).length,
            weakest.rows.length,
          ),
        ),
      },
    ],
    confidence: confidenceForSample(weakest.rows.length),
    sampleSize: weakest.rows.length,
    caveat: "Classified pass and confidence come from the automated answer classifier, not direct commander feedback.",
    actionUrl: `/admin/ai-dashboard?metric=classified-pass&category=${encodeURIComponent(weakest.category)}`,
    drilldown: { metric: "classified-pass", category: weakest.category },
    baselineValue: weakest.passRate,
    targetValue: 85,
    metricUnit: "percent",
    reviewAfterDays: 14,
  });
}

function addRatingCoverageInsight(
  insights: ActionableBusinessInsight[],
  messages: BusinessAdvisorMessageTelemetry[],
) {
  if (messages.length < 5) return;
  const ratings = messages.filter(
    (row) => row.feedback === "positive" || row.feedback === "negative",
  ).length;
  const coverage = percent(ratings, messages.length) ?? 0;
  if (coverage >= 10 && ratings >= 10) return;
  insights.push({
    sourceId: "business:measurement:advisor-ratings",
    kind: "measurement",
    priority: ratings === 0 ? "high" : "medium",
    title: "Make Advisor satisfaction measurable",
    observation: `Only ${formatPercent(coverage)} of persisted Advisor answers were rated (${ratings} of ${messages.length}).`,
    whyItMatters: ratings === 0
      ? "There is no direct commander signal to confirm whether automated quality scores match the experience users are having."
      : "The response sample is too small to use satisfaction as a dependable product decision signal.",
    recommendedAction: "Place a lightweight helpful/not-helpful prompt immediately after answers and review the lowest-rated answer categories each week.",
    successMeasure: "Reach at least 10% rating coverage and collect at least 10 ratings in the reporting period.",
    evidence: [
      { label: "Rating coverage", value: formatPercent(coverage) },
      { label: "Ratings", value: `${ratings}` },
      { label: "Persisted answers", value: `${messages.length}` },
    ],
    confidence: confidenceForSample(messages.length),
    sampleSize: messages.length,
    caveat: "Only persisted assistant messages are measurable, which currently skews toward Premium conversations.",
    actionUrl: "/admin/ai-dashboard?metric=rating-coverage",
    drilldown: { metric: "rating-coverage" },
    baselineValue: coverage,
    targetValue: 10,
    metricUnit: "percent",
    reviewAfterDays: 14,
  });
}

function addGapFragmentationInsight(
  insights: ActionableBusinessInsight[],
  gaps: BusinessKnowledgeGapTelemetry[],
) {
  const open = gaps.filter((row) => row.status === "open");
  if (open.length < 5) return;
  const singleton = open.filter((row) => row.frequency <= 1).length;
  const singletonShare = percent(singleton, open.length) ?? 0;
  if (singletonShare < 75) return;
  insights.push({
    sourceId: "business:knowledge-gap:fragmentation",
    kind: "improvement",
    priority: open.length >= 25 ? "high" : "medium",
    title: "Consolidate fragmented knowledge gaps",
    observation: `${singleton} of ${open.length} open gaps (${formatPercent(singletonShare)}) have appeared only once.`,
    whyItMatters: "Equivalent questions are likely being split into separate records, preventing frequency-based prioritization and automatic resolution from activating.",
    recommendedAction: "Normalize and semantically cluster existing gap wording, then rerun the resolver so related demand accumulates under a shared intent.",
    successMeasure: "Reduce singleton gaps below 50% of the open backlog and create at least one multi-question cluster.",
    evidence: [
      { label: "Open gaps", value: `${open.length}` },
      { label: "Singleton gaps", value: `${singleton}` },
      { label: "Singleton share", value: formatPercent(singletonShare) },
    ],
    confidence: confidenceForSample(open.length),
    sampleSize: open.length,
    caveat: "This rule detects frequency fragmentation; confirming semantic equivalence still requires reviewing the underlying questions.",
    actionUrl: "/admin/ai-dashboard?metric=open-gap-demand",
    drilldown: { metric: "open-gap-demand" },
    baselineValue: singletonShare,
    targetValue: 50,
    metricUnit: "percent",
    reviewAfterDays: 14,
  });
}

function addAdvisorDepthInsight(
  insights: ActionableBusinessInsight[],
  usage: AdminProductUsage,
) {
  if (
    usage.advisorUsers < 3
    || usage.answersPerAdvisorUser === null
    || usage.answersPerAdvisorUser < 3
  ) return;
  insights.push({
    sourceId: "business:opportunity:advisor-depth",
    kind: "opportunity",
    priority: "medium",
    title: "Turn strong Advisor depth into broader adoption",
    observation: `${usage.advisorUsers} Advisor users asked ${round(usage.answersPerAdvisorUser, 1)} questions each on average.`,
    whyItMatters: "People who discover the Advisor use it repeatedly, which is evidence of product value that can support onboarding, retention, and Premium positioning.",
    recommendedAction: "Expose one contextual Advisor prompt in a high-traffic product area and compare Advisor adoption and repeat use against this baseline.",
    successMeasure: "Increase Advisor users by 20% without reducing answers per Advisor user below the current baseline.",
    evidence: [
      { label: "Advisor users", value: `${usage.advisorUsers}` },
      { label: "Answers per user", value: `${round(usage.answersPerAdvisorUser, 1)}` },
      { label: "Repeat questioners", value: formatPercent(usage.multiQuestionRate) },
    ],
    confidence: confidenceForSample(usage.advisorUsers),
    sampleSize: usage.advisorUsers,
    caveat: "Depth shows behavior among adopters; it does not prove that an additional placement will cause adoption.",
    actionUrl: "/admin/usage-analytics",
    drilldown: null,
    baselineValue: usage.advisorUsers,
    targetValue: round(usage.advisorUsers * 1.2, 0),
    metricUnit: "users",
    reviewAfterDays: 30,
  });
}

function addAdvisorReturnInsight(
  insights: ActionableBusinessInsight[],
  usage: AdminProductUsage,
) {
  if (usage.aiReturnRate === null || usage.aiReturnRate >= 30) return;
  if (usage.previousAdvisorUsers < 5) return;
  insights.push({
    sourceId: "business:retention:advisor-return",
    kind: "improvement",
    priority: "high",
    title: "Improve repeat Advisor use",
    observation: `${formatPercent(usage.aiReturnRate)} of prior-period Advisor users returned to ask another question.`,
    whyItMatters: "High usage within a period is less valuable if commanders do not return; this may signal weak habit formation or inconsistent answer value.",
    recommendedAction: "Review first-session answer quality and add a relevant follow-up or saved insight that gives new Advisor users a reason to return.",
    successMeasure: "Raise Advisor return rate to at least 30% in the next equal comparison period.",
    evidence: [
      { label: "AI return rate", value: formatPercent(usage.aiReturnRate) },
      { label: "Returning AI users", value: `${usage.aiReturningUsers}` },
    ],
    confidence: confidenceForSample(usage.previousAdvisorUsers),
    sampleSize: usage.previousAdvisorUsers,
    caveat: "Return rate compares distinct prior-period Advisor users with the selected current period; it is not a rolling retention cohort.",
    actionUrl: "/admin/usage-analytics",
    drilldown: null,
    baselineValue: usage.aiReturnRate,
    targetValue: 30,
    metricUnit: "percent",
    reviewAfterDays: usage.range.days,
  });
}

function addTopProductAreaInsight(
  insights: ActionableBusinessInsight[],
  productAreas: BusinessProductAreaMetrics[],
  usage: AdminProductUsage,
) {
  const top = productAreas.find((area) => area.uniqueUsers >= 2);
  if (!top || top.adoptionRate === null || top.adoptionRate < 30) return;
  insights.push({
    sourceId: `business:behavior:top-area:${top.id}`,
    kind: "behavior",
    priority: "medium",
    title: `${top.label} has the widest measured reach`,
    observation: `${top.uniqueUsers} active commanders used ${top.label}, representing ${formatPercent(top.adoptionRate)} of measured active users.`,
    whyItMatters: "The highest-reach area is the best candidate for introducing adjacent value, collecting targeted feedback, and testing paths into underused capabilities.",
    recommendedAction: `Test one contextual path from ${top.label} into Advisor or another underused feature and measure downstream use.`,
    successMeasure: `Increase downstream feature adoption by 10% while maintaining ${top.label} return rate.`,
    evidence: [
      { label: "Unique users", value: `${top.uniqueUsers}` },
      { label: "Page views", value: `${top.pageViews}` },
      { label: "Area return rate", value: formatPercent(top.returnRate) },
    ],
    confidence: "low",
    sampleSize: top.uniqueUsers,
    caveat: usage.telemetryCaveat,
    actionUrl: "/admin/usage-analytics",
    drilldown: null,
    baselineValue: top.adoptionRate,
    targetValue: round(top.adoptionRate * 1.1, 1),
    metricUnit: "percent adoption",
    reviewAfterDays: usage.range.days,
  });
}

function addOnboardingInsight(
  insights: ActionableBusinessInsight[],
  usage: AdminProductUsage,
  sampleSize: number,
) {
  if (
    sampleSize < 5
    || usage.onboardingCompletionRate === null
    || usage.onboardingCompletionRate >= 70
  ) return;
  insights.push({
    sourceId: "business:onboarding:completion",
    kind: "improvement",
    priority: usage.onboardingCompletionRate < 50 ? "high" : "medium",
    title: "Reduce new-commander onboarding drop-off",
    observation: `${formatPercent(usage.onboardingCompletionRate)} of ${sampleSize} new commanders completed onboarding in the selected period.`,
    whyItMatters: "Commanders who do not finish setup are less likely to reach roster analysis, Advisor, and other recurring-value experiences.",
    recommendedAction: "Review the first-login path, remove the highest-friction step, and prompt incomplete commanders to resume where they stopped.",
    successMeasure: "Reach at least 70% onboarding completion for new commanders in the next equal period.",
    evidence: [
      { label: "New commanders", value: `${sampleSize}` },
      { label: "Completed onboarding", value: `${usage.onboardingCompleted}` },
      { label: "Completion rate", value: formatPercent(usage.onboardingCompletionRate) },
    ],
    confidence: confidenceForSample(sampleSize),
    sampleSize,
    caveat: "The current schema records completion state, not the exact onboarding step where a commander stopped.",
    actionUrl: "/admin/usage-analytics",
    drilldown: null,
    baselineValue: usage.onboardingCompletionRate,
    targetValue: 70,
    metricUnit: "percent",
    reviewAfterDays: usage.range.days,
  });
}

function addCancellationInsights(
  insights: ActionableBusinessInsight[],
  usage: AdminProductUsage,
) {
  if (usage.unactionedCancellationResponses > 0) {
    insights.push({
      sourceId: "business:cancellation:response-backlog",
      kind: "risk",
      priority: usage.unactionedCancellationResponses >= 5 ? "critical" : "high",
      title: "Act on cancellation feedback waiting for review",
      observation: `${usage.unactionedCancellationResponses} cancellation response${usage.unactionedCancellationResponses === 1 ? " is" : "s are"} still open without a recorded action or closure.`,
      whyItMatters: "These commanders have supplied direct reasons for leaving; delayed review wastes the clearest available signal for retention and product improvement.",
      recommendedAction: "Assign each response, group themes, record the product or communication decision, and close the loop in the cancellation feedback queue.",
      successMeasure: "Reduce responded-but-unactioned cancellation cases to zero within seven days.",
      evidence: [
        { label: "Open responses", value: `${usage.unactionedCancellationResponses}` },
        { label: "Current requests", value: `${usage.cancellationRequests}` },
        { label: "Cohort response rate", value: formatPercent(usage.cancellationResponseRate) },
      ],
      confidence: "high",
      sampleSize: usage.unactionedCancellationResponses,
      caveat: "The response rate is based on cancellation-request cohorts, not confirmed email deliveries, and recent requests have had less time to respond.",
      actionUrl: "/admin/cancellation-feedback",
      drilldown: null,
      baselineValue: usage.unactionedCancellationResponses,
      targetValue: 0,
      metricUnit: "cases",
      reviewAfterDays: 7,
    });
  }

  if (
    usage.cancellationRequests >= 3
    && usage.cancellationRequestChangePercent !== null
    && usage.cancellationRequestChangePercent >= 25
  ) {
    insights.push({
      sourceId: "business:cancellation:request-growth",
      kind: "risk",
      priority: "high",
      title: "Investigate the rise in cancellation requests",
      observation: `Cancellation requests increased ${formatPercent(usage.cancellationRequestChangePercent)} versus the prior equal period (${usage.cancellationRequests} vs ${usage.previousCancellationRequests}).`,
      whyItMatters: "A sustained increase can erase acquisition gains and may reveal a recent product, value, or communication problem.",
      recommendedAction: "Review cancellation reasons by theme and timing, then select the highest-frequency controllable cause for a retention experiment.",
      successMeasure: "Return cancellation requests to or below the prior-period count while documenting the leading reason and chosen intervention.",
      evidence: [
        { label: "Current requests", value: `${usage.cancellationRequests}` },
        { label: "Prior requests", value: `${usage.previousCancellationRequests}` },
        { label: "Change", value: formatPercent(usage.cancellationRequestChangePercent) },
      ],
      confidence: confidenceForSample(usage.cancellationRequests),
      sampleSize: usage.cancellationRequests,
      caveat: "Counts exclude reversed cancellation requests and do not adjust for changes in the size of the Premium subscriber base.",
      actionUrl: "/admin/cancellation-feedback",
      drilldown: null,
      baselineValue: usage.cancellationRequests,
      targetValue: usage.previousCancellationRequests,
      metricUnit: "requests",
      reviewAfterDays: usage.range.days,
    });
  }
}

function addProductTelemetryInsight(
  insights: ActionableBusinessInsight[],
  usage: AdminProductUsage,
  productAreas: BusinessProductAreaMetrics[],
) {
  insights.push({
    sourceId: "business:measurement:product-journeys",
    kind: "measurement",
    priority: "medium",
    title: "Establish a trustworthy product-journey baseline",
    observation: `The dashboard recorded ${usage.pageViews} page views, but historical client navigation coverage is partial.`,
    whyItMatters: "Acquisition, activation, feature adoption, and conversion decisions need dependable page and feature events; directional counts can suggest a test but should not justify a major investment alone.",
    recommendedAction: "Let corrected page tracking run for one full comparison period, add explicit events to the highest-value workflows, and then lock baseline adoption and return targets.",
    successMeasure: `Collect a complete ${usage.range.days}-day comparison window with page events across each core product area and explicit events for key workflow completions.`,
    evidence: [
      { label: "Tracked page views", value: `${usage.pageViews}` },
      { label: "Active users", value: `${usage.activeUsers}` },
      {
        label: "Product areas with users",
        value: `${productAreas.filter((area) => area.uniqueUsers > 0).length}`,
      },
    ],
    confidence: "high",
    sampleSize: usage.pageViews,
    caveat: usage.telemetryCaveat,
    actionUrl: "/admin/usage-analytics",
    drilldown: null,
    baselineValue: null,
    targetValue: null,
    metricUnit: null,
    reviewAfterDays: usage.range.days,
  });
}

function isUnactionedCancellationResponse(
  row: BusinessCancellationCaseTelemetry,
): boolean {
  if (!row.firstRespondedAt || row.cancellationReversedAt !== null) return false;
  if (row.actionedAt || row.closedAt) return false;
  return row.reviewStatus !== "actioned" && row.reviewStatus !== "closed";
}

function matchesArea(path: string, prefixes: readonly string[]): boolean {
  return prefixes.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

function normalizeCategory(value: string): string {
  const trimmed = value.trim();
  return trimmed || "uncategorized";
}

function confidenceForSample(sampleSize: number): BusinessInsightConfidence {
  if (sampleSize >= 20) return "high";
  if (sampleSize >= 5) return "medium";
  return "low";
}

function titleCase(value: string): string {
  return value.replaceAll("_", " ").replaceAll("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatPercent(value: number | null): string {
  return value === null ? "Not enough data" : `${round(value, 1)}%`;
}

function inWindow(value: Date, start: Date, end: Date): boolean {
  return value >= start && value < end;
}

function unionSets<T>(first: Set<T>, second: Set<T>): Set<T> {
  return new Set([...first, ...second]);
}

function intersectionSize<T>(first: Set<T>, second: Set<T>): number {
  let total = 0;
  for (const value of first) {
    if (second.has(value)) total += 1;
  }
  return total;
}

function percent(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null;
  return round((numerator / denominator) * 100, 1);
}

function percentChange(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return round(((current - previous) / Math.abs(previous)) * 100, 1);
}

function ratio(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null;
  return round(numerator / denominator, 1);
}

function round(value: number, precision: number): number {
  const factor = 10 ** precision;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function countBy<T>(rows: T[], keyFor: (row: T) => string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const key = keyFor(row);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

function groupBy<T>(rows: T[], keyFor: (row: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const key = keyFor(row);
    const group = groups.get(key) ?? [];
    group.push(row);
    groups.set(key, group);
  }
  return groups;
}
