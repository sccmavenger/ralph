import type { AdminBusinessInsightsResponse } from "./admin-business-insights";

export const AI_STATS_RANGE_DAYS = [7, 30, 90] as const;

export type AIStatsRangeDays = (typeof AI_STATS_RANGE_DAYS)[number];

export const AI_KPI_IDS = [
  "completed-answers",
  "ai-users",
  "classified-pass",
  "low-confidence",
  "grounded",
  "satisfaction",
  "rating-coverage",
  "tokens-per-answer",
  "open-gap-demand",
  "aged-gaps",
] as const;

export type AIKpiId = (typeof AI_KPI_IDS)[number];
export type AIKpiUnit = "count" | "percent" | "tokens";
export type AIKpiChangeType = "percent" | "percentage-points" | "absolute";
export type AIKpiStatus =
  | "healthy"
  | "watch"
  | "critical"
  | "neutral"
  | "insufficient-data";

export interface AIStatsRange {
  days: AIStatsRangeDays;
  start: string;
  end: string;
  previousStart: string;
  previousEnd: string;
  timezone: "UTC";
}

export interface AIKpi {
  id: AIKpiId;
  label: string;
  value: number | null;
  previousValue: number | null;
  unit: AIKpiUnit;
  change: number | null;
  changeType: AIKpiChangeType;
  target?: {
    operator: ">=" | "<=" | "=";
    value: number;
  };
  status: AIKpiStatus;
  sampleSize: number;
  definition: string;
  caveat: string | null;
  drilldown: {
    metric: AIKpiId;
  };
}

export interface AIDailyTrendPoint {
  date: string;
  completedAnswers: number;
  aiUsers: number;
  classifiedPassRate: number | null;
  lowConfidenceRate: number | null;
  groundedRate: number | null;
}

export interface AICategoryScorecardRow {
  category: string;
  completedAnswers: number;
  successRate: number | null;
  lowConfidenceRate: number | null;
  groundedRate: number | null;
  averageConfidence: number | null;
}

export interface AIGapSummary {
  openGaps: number;
  openDemand: number;
  agedGaps: number;
  agedAfterDays: 30;
  byCategory: Array<{
    category: string;
    openGaps: number;
    openDemand: number;
    agedGaps: number;
  }>;
}

export interface AIModelMixRow {
  model: string;
  answers: number;
  share: number | null;
}

export interface AIActionItemSummary {
  id: string;
  sourceType: string;
  sourceId: string;
  title: string;
  description: string | null;
  priority: "low" | "medium" | "high" | "critical";
  status: "open" | "investigating" | "planned" | "completed" | "dismissed";
  owner: string | null;
  notes: string | null;
  actionUrl: string | null;
  successMeasure: string | null;
  baselineValue: number | null;
  targetValue: number | null;
  resultValue: number | null;
  metricUnit: string | null;
  reviewAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AICoreStatsResponse {
  range: AIStatsRange;
  kpis: AIKpi[];
  dailyTrend: AIDailyTrendPoint[];
  categoryScorecard: AICategoryScorecardRow[];
  gapSummary: AIGapSummary;
  modelMix: AIModelMixRow[];
  actionItems: AIActionItemSummary[];
}

export interface AIStatsResponse
  extends AICoreStatsResponse, AdminBusinessInsightsResponse {}

export interface AIDrilldownItem {
  id: string;
  occurredAt: string;
  category?: string;
  question?: string;
  content?: string;
  confidenceScore?: number | null;
  answeredSuccessfully?: boolean;
  knowledgeSourcesCount?: number;
  feedback?: string | null;
  feedbackComment?: string | null;
  modelUsed?: string | null;
  tokensUsed?: number;
  date?: string;
  frequency?: number;
  ageDays?: number;
  answerCount?: number;
}

export interface AIDrilldownResponse {
  metric: AIKpiId;
  range: AIStatsRange;
  filters: {
    category: string | null;
  };
  snapshot: {
    value: number | null;
    unit: AIKpiUnit;
    sampleSize: number;
  };
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
  items: AIDrilldownItem[];
}

export interface AdvisorQuestionTelemetry {
  id: string;
  commanderId: string;
  question: string;
  category: string;
  confidenceScore: number;
  answeredSuccessfully: boolean;
  knowledgeSourcesUsed: unknown;
  createdAt: Date;
}

export interface AdvisorMessageTelemetry {
  id: string;
  content: string;
  feedback: string | null;
  modelUsed: string | null;
  createdAt: Date;
}

export interface DailyTokenTelemetry {
  id: string;
  date: Date;
  tokensUsed: number;
}

export interface KnowledgeGapTelemetry {
  id: string;
  clusteredQuestion: string;
  category: string;
  frequency: number;
  status: string;
  resolvedAt: Date | null;
  createdAt: Date;
}

export interface BuildAIStatsInput {
  range: AIStatsRange;
  asOf: Date;
  questions: AdvisorQuestionTelemetry[];
  messages: AdvisorMessageTelemetry[];
  tokenUsage: DailyTokenTelemetry[];
  gaps: KnowledgeGapTelemetry[];
  actionItems: AIActionItemSummary[];
}

const DAY_MS = 86_400_000;
export const AGED_GAP_DAYS = 30;

export function parseAIStatsRange(value: string | null): AIStatsRangeDays | null {
  if (value === null) return 30;
  if (value === "7") return 7;
  if (value === "30") return 30;
  if (value === "90") return 90;
  return null;
}

export function isAIKpiId(value: string | null): value is AIKpiId {
  return value !== null && AI_KPI_IDS.includes(value as AIKpiId);
}

/**
 * Builds equal, adjacent UTC-calendar windows. The current window includes
 * today and ends at the next UTC midnight, so its final day is naturally
 * partial until that midnight.
 */
export function buildAIStatsRange(
  days: AIStatsRangeDays,
  now = new Date(),
): AIStatsRange {
  const end = new Date(now);
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

export function percent(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null;
  return round((numerator / denominator) * 100, 1);
}

export function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return round(values.reduce((sum, value) => sum + value, 0) / values.length, 1);
}

export function calculateKpiChange(
  current: number | null,
  previous: number | null,
  changeType: AIKpiChangeType,
): number | null {
  if (current === null || previous === null) return null;
  if (changeType === "percent") {
    if (previous === 0) return null;
    return round(((current - previous) / Math.abs(previous)) * 100, 1);
  }
  return round(current - previous, 1);
}

export function higherIsBetterStatus(
  value: number | null,
  healthyAt: number,
  watchAt: number,
): AIKpiStatus {
  if (value === null) return "insufficient-data";
  if (value >= healthyAt) return "healthy";
  if (value >= watchAt) return "watch";
  return "critical";
}

export function lowerIsBetterStatus(
  value: number | null,
  healthyAt: number,
  watchAt: number,
): AIKpiStatus {
  if (value === null) return "insufficient-data";
  if (value <= healthyAt) return "healthy";
  if (value <= watchAt) return "watch";
  return "critical";
}

export function zeroTargetStatus(value: number | null): AIKpiStatus {
  if (value === null) return "insufficient-data";
  if (value === 0) return "healthy";
  if (value <= 5) return "watch";
  return "critical";
}

export function hasKnowledgeSources(value: unknown): boolean {
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "string") return value.trim().length > 0 && value !== "[]";
  if (value && typeof value === "object") return Object.keys(value).length > 0;
  return false;
}

export function knowledgeSourceCount(value: unknown): number {
  if (Array.isArray(value)) return value.length;
  return hasKnowledgeSources(value) ? 1 : 0;
}

export function truncateAdminText(value: string, maxLength = 240): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

export function buildAIStatsResponse(input: BuildAIStatsInput): AICoreStatsResponse {
  const start = new Date(input.range.start);
  const end = new Date(input.range.end);
  const previousStart = new Date(input.range.previousStart);
  const previousEnd = new Date(input.range.previousEnd);

  const currentQuestions = input.questions.filter((row) => inWindow(row.createdAt, start, end));
  const previousQuestions = input.questions.filter((row) =>
    inWindow(row.createdAt, previousStart, previousEnd),
  );
  const currentMessages = input.messages.filter((row) => inWindow(row.createdAt, start, end));
  const previousMessages = input.messages.filter((row) =>
    inWindow(row.createdAt, previousStart, previousEnd),
  );
  const currentTokens = input.tokenUsage.filter((row) => inWindow(row.date, start, end));
  const previousTokens = input.tokenUsage.filter((row) =>
    inWindow(row.date, previousStart, previousEnd),
  );

  const currentRatings = currentMessages.filter(isRatedMessage);
  const previousRatings = previousMessages.filter(isRatedMessage);
  const currentPositive = currentRatings.filter((row) => row.feedback === "positive").length;
  const previousPositive = previousRatings.filter((row) => row.feedback === "positive").length;
  const currentTokenTotal = sum(currentTokens.map((row) => row.tokensUsed));
  const previousTokenTotal = sum(previousTokens.map((row) => row.tokensUsed));

  const currentOpenGaps = input.gaps.filter((gap) => gap.status === "open");
  const priorOpenGaps = input.gaps.filter((gap) => wasOpenAt(gap, start));
  const agedCutoff = new Date(input.asOf.getTime() - AGED_GAP_DAYS * DAY_MS);
  const previousAgedCutoff = new Date(start.getTime() - AGED_GAP_DAYS * DAY_MS);
  const currentAgedGaps = currentOpenGaps.filter((gap) => gap.createdAt <= agedCutoff);
  const priorAgedGaps = priorOpenGaps.filter((gap) => gap.createdAt <= previousAgedCutoff);

  const current = questionPeriodMetrics(currentQuestions);
  const previous = questionPeriodMetrics(previousQuestions);
  const satisfaction = percent(currentPositive, currentRatings.length);
  const previousSatisfaction = percent(previousPositive, previousRatings.length);
  const ratingCoverage = percent(currentRatings.length, currentMessages.length);
  const previousRatingCoverage = percent(previousRatings.length, previousMessages.length);
  const tokensPerAnswer = currentQuestions.length > 0
    ? round(currentTokenTotal / currentQuestions.length, 1)
    : null;
  const previousTokensPerAnswer = previousQuestions.length > 0
    ? round(previousTokenTotal / previousQuestions.length, 1)
    : null;
  const openDemand = sum(currentOpenGaps.map((gap) => gap.frequency));
  const priorOpenDemand = sum(priorOpenGaps.map((gap) => gap.frequency));

  const kpis: AIKpi[] = [
    makeKpi({
      id: "completed-answers",
      label: "Completed answers",
      value: currentQuestions.length,
      previousValue: previousQuestions.length,
      unit: "count",
      changeType: "percent",
      status: "neutral",
      sampleSize: currentQuestions.length,
      definition: "Advisor answers logged during the selected UTC period.",
      caveat: "A log records the completed advisor pipeline, including answers later classified as unsuccessful.",
    }),
    makeKpi({
      id: "ai-users",
      label: "AI users",
      value: current.uniqueUsers,
      previousValue: previous.uniqueUsers,
      unit: "count",
      changeType: "percent",
      status: "neutral",
      sampleSize: currentQuestions.length,
      definition: "Distinct commanders with at least one logged Advisor answer in the selected period.",
      caveat: "Commander identifiers are counted only and are never returned by this dashboard API.",
    }),
    makeKpi({
      id: "classified-pass",
      label: "Classified pass rate",
      value: current.passRate,
      previousValue: previous.passRate,
      unit: "percent",
      changeType: "percentage-points",
      target: { operator: ">=", value: 85 },
      status: higherIsBetterStatus(current.passRate, 85, 70),
      sampleSize: currentQuestions.length,
      definition: "Share of logged questions classified as answered successfully.",
      caveat: "This is the automated post-answer classifier result, not direct commander feedback.",
    }),
    makeKpi({
      id: "low-confidence",
      label: "Low-confidence answers",
      value: current.lowConfidenceRate,
      previousValue: previous.lowConfidenceRate,
      unit: "percent",
      changeType: "percentage-points",
      target: { operator: "<=", value: 15 },
      status: lowerIsBetterStatus(current.lowConfidenceRate, 15, 25),
      sampleSize: currentQuestions.length,
      definition: "Share of logged questions with a confidence score below 60.",
      caveat: "Confidence is generated by the classification pipeline and is not a calibrated probability.",
    }),
    makeKpi({
      id: "grounded",
      label: "Grounded answers",
      value: current.groundedRate,
      previousValue: previous.groundedRate,
      unit: "percent",
      changeType: "percentage-points",
      target: { operator: ">=", value: 80 },
      status: higherIsBetterStatus(current.groundedRate, 80, 60),
      sampleSize: currentQuestions.length,
      definition: "Share of logged answers that recorded at least one knowledge source.",
      caveat: "A recorded source indicates retrieval grounding; it does not independently verify answer correctness.",
    }),
    makeKpi({
      id: "satisfaction",
      label: "Commander satisfaction",
      value: satisfaction,
      previousValue: previousSatisfaction,
      unit: "percent",
      changeType: "percentage-points",
      target: { operator: ">=", value: 85 },
      status: currentRatings.length < 10
        ? "insufficient-data"
        : higherIsBetterStatus(satisfaction, 85, 70),
      sampleSize: currentRatings.length,
      definition: "Positive ratings as a share of positive and negative ratings on persisted assistant messages.",
      caveat: "Feedback has no separate timestamp, so it is attributed to the message date; persisted conversations skew toward Premium commanders.",
    }),
    makeKpi({
      id: "rating-coverage",
      label: "Rating coverage",
      value: ratingCoverage,
      previousValue: previousRatingCoverage,
      unit: "percent",
      changeType: "percentage-points",
      target: { operator: ">=", value: 10 },
      status: higherIsBetterStatus(ratingCoverage, 10, 5),
      sampleSize: currentMessages.length,
      definition: "Share of persisted assistant messages with a positive or negative rating.",
      caveat: "Only persisted assistant messages are measurable, which skews coverage toward Premium conversations.",
    }),
    makeKpi({
      id: "tokens-per-answer",
      label: "Estimated tokens per answer",
      value: tokensPerAnswer,
      previousValue: previousTokensPerAnswer,
      unit: "tokens",
      changeType: "percent",
      status: "neutral",
      sampleSize: currentQuestions.length,
      definition: "Tracked daily output tokens divided by logged Advisor answers in the selected period.",
      caveat: "DailyTokenUsage is an output-token estimate recorded separately from question logs; retries or tracking failures can make this directional.",
    }),
    makeKpi({
      id: "open-gap-demand",
      label: "Open gap demand",
      value: openDemand,
      previousValue: priorOpenDemand,
      unit: "count",
      changeType: "absolute",
      target: { operator: "=", value: 0 },
      status: zeroTargetStatus(openDemand),
      sampleSize: currentOpenGaps.length,
      definition: "Sum of frequency across every currently open knowledge gap.",
      caveat: "Gap frequency has no history table; the prior value reconstructs which gaps were open then using their current frequency.",
    }),
    makeKpi({
      id: "aged-gaps",
      label: "Aged open gaps",
      value: currentAgedGaps.length,
      previousValue: priorAgedGaps.length,
      unit: "count",
      changeType: "absolute",
      target: { operator: "=", value: 0 },
      status: zeroTargetStatus(currentAgedGaps.length),
      sampleSize: currentOpenGaps.length,
      definition: `Currently open knowledge gaps created at least ${AGED_GAP_DAYS} days ago.`,
      caveat: "Prior state is reconstructed from created and resolved dates because status-change history is not persisted.",
    }),
  ];

  return {
    range: input.range,
    kpis,
    dailyTrend: buildDailyTrend(currentQuestions, input.range),
    categoryScorecard: buildCategoryScorecard(currentQuestions),
    gapSummary: buildGapSummary(currentOpenGaps, agedCutoff),
    modelMix: buildModelMix(currentMessages),
    actionItems: input.actionItems,
  };
}

function makeKpi(
  input: Omit<AIKpi, "change" | "drilldown">,
): AIKpi {
  return {
    ...input,
    change: calculateKpiChange(input.value, input.previousValue, input.changeType),
    drilldown: { metric: input.id },
  };
}

function questionPeriodMetrics(rows: AdvisorQuestionTelemetry[]) {
  const passed = rows.filter((row) => row.answeredSuccessfully).length;
  const lowConfidence = rows.filter((row) => row.confidenceScore < 60).length;
  const grounded = rows.filter((row) => hasKnowledgeSources(row.knowledgeSourcesUsed)).length;
  return {
    uniqueUsers: new Set(rows.map((row) => row.commanderId)).size,
    passRate: percent(passed, rows.length),
    lowConfidenceRate: percent(lowConfidence, rows.length),
    groundedRate: percent(grounded, rows.length),
  };
}

function buildDailyTrend(
  rows: AdvisorQuestionTelemetry[],
  range: AIStatsRange,
): AIDailyTrendPoint[] {
  const byDate = new Map<string, AdvisorQuestionTelemetry[]>();
  for (const row of rows) {
    const key = row.createdAt.toISOString().slice(0, 10);
    const bucket = byDate.get(key) ?? [];
    bucket.push(row);
    byDate.set(key, bucket);
  }

  const start = new Date(range.start);
  return Array.from({ length: range.days }, (_, index) => {
    const date = new Date(start.getTime() + index * DAY_MS).toISOString().slice(0, 10);
    const bucket = byDate.get(date) ?? [];
    const metrics = questionPeriodMetrics(bucket);
    return {
      date,
      completedAnswers: bucket.length,
      aiUsers: metrics.uniqueUsers,
      classifiedPassRate: metrics.passRate,
      lowConfidenceRate: metrics.lowConfidenceRate,
      groundedRate: metrics.groundedRate,
    };
  });
}

function buildCategoryScorecard(
  rows: AdvisorQuestionTelemetry[],
): AICategoryScorecardRow[] {
  const groups = groupBy(rows, (row) => row.category.trim() || "Uncategorized");
  return [...groups.entries()]
    .map(([category, categoryRows]) => {
      const metrics = questionPeriodMetrics(categoryRows);
      return {
        category,
        completedAnswers: categoryRows.length,
        successRate: metrics.passRate,
        lowConfidenceRate: metrics.lowConfidenceRate,
        groundedRate: metrics.groundedRate,
        averageConfidence: average(categoryRows.map((row) => row.confidenceScore)),
      };
    })
    .sort((a, b) => b.completedAnswers - a.completedAnswers || a.category.localeCompare(b.category));
}

function buildGapSummary(
  openGaps: KnowledgeGapTelemetry[],
  agedCutoff: Date,
): AIGapSummary {
  const groups = groupBy(openGaps, (gap) => gap.category.trim() || "Uncategorized");
  return {
    openGaps: openGaps.length,
    openDemand: sum(openGaps.map((gap) => gap.frequency)),
    agedGaps: openGaps.filter((gap) => gap.createdAt <= agedCutoff).length,
    agedAfterDays: AGED_GAP_DAYS,
    byCategory: [...groups.entries()]
      .map(([category, gaps]) => ({
        category,
        openGaps: gaps.length,
        openDemand: sum(gaps.map((gap) => gap.frequency)),
        agedGaps: gaps.filter((gap) => gap.createdAt <= agedCutoff).length,
      }))
      .sort((a, b) => b.openDemand - a.openDemand || a.category.localeCompare(b.category)),
  };
}

function buildModelMix(messages: AdvisorMessageTelemetry[]): AIModelMixRow[] {
  const groups = groupBy(messages, (message) => message.modelUsed?.trim() || "Unknown");
  return [...groups.entries()]
    .map(([model, rows]) => ({
      model,
      answers: rows.length,
      share: percent(rows.length, messages.length),
    }))
    .sort((a, b) => b.answers - a.answers || a.model.localeCompare(b.model));
}

function isRatedMessage(message: AdvisorMessageTelemetry): boolean {
  return message.feedback === "positive" || message.feedback === "negative";
}

function wasOpenAt(gap: KnowledgeGapTelemetry, at: Date): boolean {
  if (gap.createdAt > at) return false;
  return gap.resolvedAt === null || gap.resolvedAt > at;
}

function inWindow(value: Date, start: Date, end: Date): boolean {
  return value >= start && value < end;
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function round(value: number, precision: number): number {
  const factor = 10 ** precision;
  return Math.round((value + Number.EPSILON) * factor) / factor;
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
