"use client";

import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import type {
  ActionableBusinessInsight,
  AdminProductUsage,
  BusinessProductAreaMetrics,
  BusinessInsightKind,
  BusinessInsightPriority,
} from "@/lib/admin-business-insights";

type RangeDays = 7 | 30 | 90;
type MetricId =
  | "completed-answers"
  | "ai-users"
  | "classified-pass"
  | "low-confidence"
  | "grounded"
  | "satisfaction"
  | "rating-coverage"
  | "tokens-per-answer"
  | "open-gap-demand"
  | "aged-gaps";
type KpiStatus =
  | "healthy"
  | "watch"
  | "critical"
  | "neutral"
  | "insufficient-data";
type ActionStatus =
  | "open"
  | "investigating"
  | "planned"
  | "completed"
  | "dismissed";
type ActionPriority = "low" | "medium" | "high" | "critical";

interface AIKpi {
  id: MetricId;
  label: string;
  value: number | null;
  previousValue: number | null;
  unit: "count" | "percent" | "tokens";
  change: number | null;
  changeType: "percent" | "percentage-points" | "absolute";
  target?: { operator: ">=" | "<=" | "="; value: number };
  status: KpiStatus;
  sampleSize: number;
  definition: string;
  caveat: string | null;
  drilldown: { metric: MetricId };
}

interface AiActionItem {
  id: string;
  sourceType: string;
  sourceId: string;
  title: string;
  description?: string | null;
  priority: ActionPriority;
  status: ActionStatus;
  owner?: string | null;
  notes?: string | null;
  actionUrl?: string | null;
  successMeasure?: string | null;
  baselineValue?: number | null;
  targetValue?: number | null;
  resultValue?: number | null;
  metricUnit?: string | null;
  reviewAt?: string | null;
  completedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

interface AIStats {
  range: {
    days: RangeDays;
    start: string;
    end: string;
    previousStart: string;
    previousEnd: string;
    timezone: "UTC";
  };
  kpis: AIKpi[];
  dailyTrend: Array<{
    date: string;
    completedAnswers: number;
    aiUsers: number;
    classifiedPassRate: number | null;
    lowConfidenceRate: number | null;
    groundedRate: number | null;
  }>;
  categoryScorecard: Array<{
    category: string;
    completedAnswers: number;
    successRate: number | null;
    lowConfidenceRate: number | null;
    groundedRate: number | null;
    averageConfidence: number | null;
  }>;
  gapSummary: {
    openGaps: number;
    openDemand: number;
    agedGaps: number;
    agedAfterDays: number;
    byCategory: Array<{
      category: string;
      openGaps: number;
      openDemand: number;
      agedGaps: number;
    }>;
  };
  modelMix: Array<{ model: string; answers: number; share: number | null }>;
  actionItems: AiActionItem[];
  productUsage: AdminProductUsage;
  productAreas: BusinessProductAreaMetrics[];
  actionableInsights: ActionableBusinessInsight[];
}

interface DrillItem {
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

interface DrilldownData {
  metric: MetricId;
  range: AIStats["range"];
  snapshot: { value: number | null; unit: AIKpi["unit"]; sampleSize: number };
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
  items: DrillItem[];
  filters: { category: string | null };
}

interface IngestStatus {
  documentCount: number;
  creators: string[];
  searchConfigured: boolean;
  refreshState?: {
    lastRefreshAt: string;
    lastResult: {
      videosProcessed: number;
      documentsUploaded: number;
      newVideosFound: number;
      errors: string[];
    };
    staleness: Array<{
      name: string;
      lastVideoDate: string | null;
      isStale: boolean;
    }>;
  } | null;
}

interface IngestResult {
  videosProcessed: number;
  documentsUploaded: number;
  errors: string[];
  skippedVideos: string[];
  logs: string[];
  documentCount: number;
}

interface KBHealth {
  overallStatus: "healthy" | "degraded";
  totalDocuments: number;
  documentsBySourceType: Record<string, number>;
  documentsByTier: Record<string, number>;
  metadataCoverage: number;
  sources: Record<
    string,
    {
      count: number;
      newestSourceDate: string | null;
      status: "healthy" | "stale" | "missing";
      ageHours: number | null;
      maxAgeHours: number;
    }
  >;
  staleDocuments: number;
  warnings: string[];
}

const RANGE_OPTIONS: RangeDays[] = [7, 30, 90];
const METRIC_IDS: MetricId[] = [
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
];
const ACTION_STATUSES: Array<{ value: ActionStatus; label: string }> = [
  { value: "open", label: "Open" },
  { value: "investigating", label: "Investigating" },
  { value: "planned", label: "Planned" },
  { value: "completed", label: "Completed" },
  { value: "dismissed", label: "Dismissed" },
];
const ACTION_PRIORITIES: Array<{ value: ActionPriority; label: string }> = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "critical", label: "Critical" },
];

const STATUS_STYLE: Record<KpiStatus, { label: string; className: string }> = {
  healthy: { label: "On target", className: "bg-green-500/15 text-green-300" },
  watch: { label: "Watch", className: "bg-yellow-500/15 text-yellow-300" },
  critical: { label: "Action needed", className: "bg-red-500/15 text-red-300" },
  neutral: { label: "Tracking", className: "bg-blue-500/15 text-blue-300" },
  "insufficient-data": {
    label: "Low sample",
    className: "bg-slate-500/20 text-slate-300",
  },
};

const INSIGHT_KIND_STYLE: Record<
  BusinessInsightKind,
  { label: string; className: string }
> = {
  opportunity: { label: "Opportunity", className: "bg-emerald-500/15 text-emerald-300" },
  improvement: { label: "Improve", className: "bg-orange-500/15 text-orange-300" },
  risk: { label: "Risk", className: "bg-red-500/15 text-red-300" },
  behavior: { label: "User behavior", className: "bg-cyan-500/15 text-cyan-300" },
  measurement: { label: "Measurement", className: "bg-violet-500/15 text-violet-300" },
};

const INSIGHT_PRIORITY_STYLE: Record<BusinessInsightPriority, string> = {
  critical: "border-red-500/50",
  high: "border-orange-500/45",
  medium: "border-[var(--color-surface-light)]",
  low: "border-[var(--color-surface-light)]",
};

function formatRelativeTime(value: string): string {
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return "unknown";
  const minutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function formatInclusiveDate(exclusiveEnd: string): string {
  return new Date(new Date(exclusiveEnd).getTime() - 1).toLocaleDateString();
}

function formatNumber(value: number, unit: AIKpi["unit"]): string {
  if (unit === "percent") return `${value.toFixed(value % 1 === 0 ? 0 : 1)}%`;
  if (unit === "tokens") {
    return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value);
  }
  return value.toLocaleString();
}

function formatKpiValue(kpi: AIKpi): string {
  return kpi.value === null ? "No data" : formatNumber(kpi.value, kpi.unit);
}

function formatChange(kpi: AIKpi): string {
  if (kpi.change === null) return "No prior comparison";
  const prefix = kpi.change > 0 ? "+" : "";
  if (kpi.changeType === "percentage-points") return `${prefix}${kpi.change.toFixed(1)} pp`;
  if (kpi.changeType === "percent") return `${prefix}${kpi.change.toFixed(1)}%`;
  return `${prefix}${kpi.change.toFixed(kpi.change % 1 === 0 ? 0 : 1)}`;
}

function formatTarget(kpi: AIKpi): string {
  if (!kpi.target) return "No fixed target";
  return `Target ${kpi.target.operator}${kpi.target.value}${kpi.unit === "percent" ? "%" : ""}`;
}

function titleCase(value: string): string {
  return value.replaceAll("_", " ").replaceAll("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function sourceTypeForMetric(metric: MetricId): string {
  if (metric === "satisfaction" || metric === "rating-coverage") return "advisor_feedback";
  if (metric === "open-gap-demand" || metric === "aged-gaps") return "knowledge_gap";
  if (metric === "tokens-per-answer") return "token_usage";
  return "advisor_question";
}

function itemTitle(item: DrillItem, fallback: string): string {
  return (item.question || item.content || item.date || fallback).slice(0, 240);
}

function actionStatusStyle(status: ActionStatus): string {
  if (status === "completed") return "bg-green-500/15 text-green-300";
  if (status === "planned") return "bg-blue-500/15 text-blue-300";
  if (status === "investigating") return "bg-yellow-500/15 text-yellow-300";
  if (status === "dismissed") return "bg-slate-500/20 text-slate-300";
  return "bg-red-500/15 text-red-300";
}

function metricValue(value: number | null | undefined, unit: string | null | undefined): string {
  if (value === null || value === undefined) return "—";
  const formatted = value.toLocaleString(undefined, { maximumFractionDigits: 1 });
  if (unit === "percent" || unit === "percent adoption") return `${formatted}%`;
  return unit ? `${formatted} ${unit}` : formatted;
}

function dateInputValue(value: string | null | undefined): string {
  return value ? value.slice(0, 10) : "";
}

function parsedNumber(value: string): number | null {
  const trimmed = value.trim();
  return trimmed ? Number(trimmed) : null;
}

function isMetricId(value: string): value is MetricId {
  return METRIC_IDS.includes(value as MetricId);
}

function ActionEditor({ action, onSave }: { action: AiActionItem; onSave: (id: string, update: Partial<AiActionItem>) => Promise<void> }) {
  const [expanded, setExpanded] = useState(false);
  const [status, setStatus] = useState<ActionStatus>(action.status);
  const [priority, setPriority] = useState<ActionPriority>(action.priority);
  const [owner, setOwner] = useState(action.owner ?? "");
  const [notes, setNotes] = useState(action.notes ?? "");
  const [actionUrl, setActionUrl] = useState(action.actionUrl ?? "");
  const [successMeasure, setSuccessMeasure] = useState(action.successMeasure ?? "");
  const [baselineValue, setBaselineValue] = useState(action.baselineValue?.toString() ?? "");
  const [targetValue, setTargetValue] = useState(action.targetValue?.toString() ?? "");
  const [resultValue, setResultValue] = useState(action.resultValue?.toString() ?? "");
  const [metricUnit, setMetricUnit] = useState(action.metricUnit ?? "");
  const [reviewAt, setReviewAt] = useState(dateInputValue(action.reviewAt));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    setStatus(action.status);
    setPriority(action.priority);
    setOwner(action.owner ?? "");
    setNotes(action.notes ?? "");
    setActionUrl(action.actionUrl ?? "");
    setSuccessMeasure(action.successMeasure ?? "");
    setBaselineValue(action.baselineValue?.toString() ?? "");
    setTargetValue(action.targetValue?.toString() ?? "");
    setResultValue(action.resultValue?.toString() ?? "");
    setMetricUnit(action.metricUnit ?? "");
    setReviewAt(dateInputValue(action.reviewAt));
  }, [
    action.actionUrl,
    action.baselineValue,
    action.metricUnit,
    action.notes,
    action.owner,
    action.priority,
    action.resultValue,
    action.reviewAt,
    action.status,
    action.successMeasure,
    action.targetValue,
  ]);

  async function save() {
    setSaving(true);
    setMessage(null);
    try {
      await onSave(action.id, {
        status,
        priority,
        owner: owner.trim() || null,
        notes: notes.trim() || null,
        actionUrl: actionUrl.trim() || null,
        successMeasure: successMeasure.trim() || null,
        baselineValue: parsedNumber(baselineValue),
        targetValue: parsedNumber(targetValue),
        resultValue: parsedNumber(resultValue),
        metricUnit: metricUnit.trim() || null,
        reviewAt: reviewAt ? new Date(`${reviewAt}T12:00:00.000Z`).toISOString() : null,
      });
      setMessage("Saved");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save action");
    } finally {
      setSaving(false);
    }
  }

  const isOverdue = Boolean(
    action.reviewAt
    && action.status !== "completed"
    && action.status !== "dismissed"
    && new Date(action.reviewAt).getTime() < Date.now(),
  );

  return (
    <div className="rounded-xl border border-[var(--color-surface-light)] bg-[var(--color-background)]/45 p-3" data-testid={`ai-action-${action.id}`}>
      <button type="button" onClick={() => setExpanded((value) => !value)} className="w-full text-left">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-[var(--color-foreground)]">{action.title}</p>
            <p className="mt-1 text-xs text-[var(--color-muted)]">{titleCase(action.sourceType)} · {action.owner || "Unassigned"} · updated {formatRelativeTime(action.updatedAt)}</p>
            {action.successMeasure && <p className="mt-2 line-clamp-2 text-xs text-[var(--color-foreground)]"><span className="font-semibold">Success:</span> {action.successMeasure}</p>}
            {(action.baselineValue !== null && action.baselineValue !== undefined) && <p className="mt-1 text-[10px] text-[var(--color-muted)]">Baseline {metricValue(action.baselineValue, action.metricUnit)} · target {metricValue(action.targetValue, action.metricUnit)} · result {metricValue(action.resultValue, action.metricUnit)}</p>}
          </div>
          <div className="flex flex-wrap items-center justify-end gap-1.5">
            {isOverdue && <span className="rounded-full bg-red-500/15 px-2 py-1 text-[10px] font-semibold text-red-300">Review overdue</span>}
            <span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${actionStatusStyle(action.status)}`}>{titleCase(action.status)}</span>
            <span className="text-xs text-[var(--color-muted)]">{expanded ? "▲" : "▼"}</span>
          </div>
        </div>
      </button>
      {expanded && (
        <div className="mt-3 grid gap-3 border-t border-[var(--color-surface-light)] pt-3 sm:grid-cols-2">
          <label className="text-xs text-[var(--color-muted)]">Status<select value={status} onChange={(event) => setStatus(event.target.value as ActionStatus)} className="mt-1 w-full rounded-lg border border-[var(--color-surface-light)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-foreground)]">{ACTION_STATUSES.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
          <label className="text-xs text-[var(--color-muted)]">Priority<select value={priority} onChange={(event) => setPriority(event.target.value as ActionPriority)} className="mt-1 w-full rounded-lg border border-[var(--color-surface-light)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-foreground)]">{ACTION_PRIORITIES.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
          <label className="text-xs text-[var(--color-muted)]">Owner<input value={owner} onChange={(event) => setOwner(event.target.value)} maxLength={120} placeholder="Name or team" className="mt-1 w-full rounded-lg border border-[var(--color-surface-light)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-foreground)]" /></label>
          <label className="text-xs text-[var(--color-muted)]">Review date<input type="date" value={reviewAt} onChange={(event) => setReviewAt(event.target.value)} className="mt-1 w-full rounded-lg border border-[var(--color-surface-light)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-foreground)]" /></label>
          <label className="text-xs text-[var(--color-muted)] sm:col-span-2">Success measure<textarea value={successMeasure} onChange={(event) => setSuccessMeasure(event.target.value)} maxLength={2000} rows={2} className="mt-1 w-full rounded-lg border border-[var(--color-surface-light)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-foreground)]" /></label>
          <label className="text-xs text-[var(--color-muted)]">Baseline<input type="number" step="any" value={baselineValue} onChange={(event) => setBaselineValue(event.target.value)} className="mt-1 w-full rounded-lg border border-[var(--color-surface-light)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-foreground)]" /></label>
          <label className="text-xs text-[var(--color-muted)]">Target<input type="number" step="any" value={targetValue} onChange={(event) => setTargetValue(event.target.value)} className="mt-1 w-full rounded-lg border border-[var(--color-surface-light)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-foreground)]" /></label>
          <label className="text-xs text-[var(--color-muted)]">Result<input type="number" step="any" value={resultValue} onChange={(event) => setResultValue(event.target.value)} className="mt-1 w-full rounded-lg border border-[var(--color-surface-light)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-foreground)]" /></label>
          <label className="text-xs text-[var(--color-muted)]">Metric unit<input value={metricUnit} onChange={(event) => setMetricUnit(event.target.value)} maxLength={80} placeholder="percent, users, cases…" className="mt-1 w-full rounded-lg border border-[var(--color-surface-light)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-foreground)]" /></label>
          <label className="text-xs text-[var(--color-muted)] sm:col-span-2">Action link<input value={actionUrl} onChange={(event) => setActionUrl(event.target.value)} maxLength={1000} placeholder="https://... or /admin/..." className="mt-1 w-full rounded-lg border border-[var(--color-surface-light)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-foreground)]" /></label>
          <label className="text-xs text-[var(--color-muted)] sm:col-span-2">Notes and next step<textarea value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={8000} rows={3} className="mt-1 w-full rounded-lg border border-[var(--color-surface-light)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-foreground)]" /></label>
          <div className="flex flex-wrap items-center gap-2 sm:col-span-2"><button type="button" onClick={save} disabled={saving} className="rounded-lg bg-[var(--color-accent)] px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">{saving ? "Saving…" : "Save action"}</button>{action.actionUrl && <a href={action.actionUrl} className="rounded-lg border border-[var(--color-accent)] px-3 py-2 text-xs font-semibold text-[var(--color-accent)]">Open action link →</a>}{message && <span className={`text-xs ${message === "Saved" ? "text-green-400" : "text-red-400"}`}>{message}</span>}</div>
        </div>
      )}
    </div>
  );
}

function InsightCard({
  insight,
  onDrilldown,
  onTrack,
}: {
  insight: ActionableBusinessInsight;
  onDrilldown: (metric: MetricId, category?: string) => void;
  onTrack: (insight: ActionableBusinessInsight) => void;
}) {
  const kind = INSIGHT_KIND_STYLE[insight.kind];
  const drillMetric = insight.drilldown?.metric;
  return (
    <article className={`min-w-0 rounded-xl border bg-[var(--color-surface)] p-4 ${INSIGHT_PRIORITY_STYLE[insight.priority]}`} data-testid={`ai-insight-${insight.sourceId.replaceAll(":", "-")}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${kind.className}`}>{kind.label}</span>
            <span className="rounded-full bg-[var(--color-background)] px-2 py-1 text-[10px] font-semibold text-[var(--color-muted)]">{titleCase(insight.priority)} priority</span>
          </div>
          <h4 className="mt-2 text-base font-bold text-[var(--color-foreground)]">{insight.title}</h4>
        </div>
        <span className="shrink-0 text-[10px] text-[var(--color-muted)]">{titleCase(insight.confidence)} confidence · n={insight.sampleSize}</span>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div><p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-accent)]">What we see</p><p className="mt-1 text-sm leading-relaxed text-[var(--color-foreground)]">{insight.observation}</p></div>
        <div><p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-accent)]">Why it matters</p><p className="mt-1 text-sm leading-relaxed text-[var(--color-foreground)]">{insight.whyItMatters}</p></div>
        <div><p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-300">Do next</p><p className="mt-1 text-sm leading-relaxed text-[var(--color-foreground)]">{insight.recommendedAction}</p></div>
        <div><p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-300">Success measure</p><p className="mt-1 text-sm leading-relaxed text-[var(--color-foreground)]">{insight.successMeasure}</p></div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">{insight.evidence.map((item) => <span key={`${item.label}:${item.value}`} className="rounded-lg bg-[var(--color-background)] px-2.5 py-1.5 text-[10px] text-[var(--color-muted)]"><span className="font-semibold text-[var(--color-foreground)]">{item.value}</span> {item.label}</span>)}</div>
      {insight.caveat && <p className="mt-3 rounded-lg bg-yellow-500/10 p-2 text-[10px] leading-relaxed text-yellow-200">Decision note: {insight.caveat}</p>}
      <div className="mt-4 flex flex-wrap gap-2">
        {drillMetric && isMetricId(drillMetric) ? <button type="button" onClick={() => onDrilldown(drillMetric, insight.drilldown?.category)} className="rounded-lg border border-[var(--color-accent)] px-3 py-2 text-xs font-semibold text-[var(--color-accent)]">Review evidence</button> : <a href={insight.actionUrl} className="rounded-lg border border-[var(--color-accent)] px-3 py-2 text-xs font-semibold text-[var(--color-accent)]">Open work area →</a>}
        <button type="button" onClick={() => onTrack(insight)} className="rounded-lg bg-[var(--color-accent)] px-3 py-2 text-xs font-semibold text-white">Track action</button>
      </div>
    </article>
  );
}

export default function AIDashboardClient() {
  const [range, setRange] = useState<RangeDays>(30);
  const [stats, setStats] = useState<AIStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [ingestStatus, setIngestStatus] = useState<IngestStatus | null>(null);
  const [ingesting, setIngesting] = useState(false);
  const [ingestResult, setIngestResult] = useState<IngestResult | null>(null);
  const [kbHealth, setKBHealth] = useState<KBHealth | null>(null);
  const [knowledgeError, setKnowledgeError] = useState<string | null>(null);
  const [activeMetric, setActiveMetric] = useState<MetricId | null>(null);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [drilldown, setDrilldown] = useState<DrilldownData | null>(null);
  const [drillPage, setDrillPage] = useState(1);
  const [drillLoading, setDrillLoading] = useState(false);
  const [drillError, setDrillError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [resolvingGapId, setResolvingGapId] = useState<string | null>(null);
  const router = useRouter();

  const loadStats = useCallback(async (days: RangeDays, quiet = false) => {
    if (!quiet) setLoading(true);
    else setRefreshing(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/ai-stats?range=${days}`, { cache: "no-store" });
      if (!response.ok) throw new Error(`Dashboard request failed (${response.status})`);
      setStats(await response.json() as AIStats);
      setLastRefresh(new Date());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load AI dashboard");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const loadKnowledgeHealth = useCallback(async () => {
    setKnowledgeError(null);
    const [ingestResponse, healthResponse] = await Promise.allSettled([
      fetch("/api/admin/ingest", { cache: "no-store" }),
      fetch("/api/admin/kb-health", { cache: "no-store" }),
    ]);
    try {
      if (ingestResponse.status !== "fulfilled" || !ingestResponse.value.ok) throw new Error("Ingestion status unavailable");
      setIngestStatus(await ingestResponse.value.json() as IngestStatus);
    } catch (loadError) {
      setKnowledgeError(loadError instanceof Error ? loadError.message : "Knowledge status unavailable");
    }
    try {
      if (healthResponse.status !== "fulfilled" || !healthResponse.value.ok) throw new Error("Knowledge health unavailable");
      setKBHealth(await healthResponse.value.json() as KBHealth);
    } catch (loadError) {
      setKnowledgeError((current) => current ?? (loadError instanceof Error ? loadError.message : "Knowledge health unavailable"));
    }
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requestedRange = Number(params.get("range"));
    if (RANGE_OPTIONS.includes(requestedRange as RangeDays)) setRange(requestedRange as RangeDays);
    const metric = params.get("metric");
    if (metric && METRIC_IDS.includes(metric as MetricId)) {
      setActiveMetric(metric as MetricId);
      setActiveCategory(params.get("category"));
    }
    loadKnowledgeHealth();
  }, [loadKnowledgeHealth]);

  useEffect(() => {
    loadStats(range);
    const interval = window.setInterval(() => loadStats(range, true), 60000);
    return () => window.clearInterval(interval);
  }, [loadStats, range]);

  const loadDrilldown = useCallback(async (metric: MetricId, days: RangeDays, page: number, category: string | null = null) => {
    setDrillLoading(true);
    setDrillError(null);
    try {
      const params = new URLSearchParams({ metric, range: String(days), page: String(page) });
      if (category) params.set("category", category);
      const response = await fetch(`/api/admin/ai-stats/drilldown?${params.toString()}`, { cache: "no-store" });
      if (!response.ok) throw new Error(`Detail request failed (${response.status})`);
      setDrilldown(await response.json() as DrilldownData);
    } catch (loadError) {
      setDrillError(loadError instanceof Error ? loadError.message : "Could not load KPI details");
    } finally {
      setDrillLoading(false);
    }
  }, []);

  function updateUrl(metric: MetricId | null, days = range, category: string | null = activeCategory) {
    const url = new URL(window.location.href);
    url.searchParams.set("range", String(days));
    if (metric) {
      url.searchParams.set("metric", metric);
      if (category) url.searchParams.set("category", category);
      else url.searchParams.delete("category");
    } else {
      url.searchParams.delete("metric");
      url.searchParams.delete("category");
    }
    window.history.replaceState({}, "", url);
  }

  function closeDrilldown() {
    setActiveMetric(null);
    setActiveCategory(null);
    setDrilldown(null);
    setDrillError(null);
    updateUrl(null);
  }

  useEffect(() => {
    if (!activeMetric) {
      setDrilldown(null);
      return;
    }
    loadDrilldown(activeMetric, range, drillPage, activeCategory);
  }, [activeCategory, activeMetric, drillPage, loadDrilldown, range]);

  useEffect(() => {
    if (!activeMetric) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") closeDrilldown();
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  });

  const activeKpi = useMemo(() => stats?.kpis.find((kpi) => kpi.id === activeMetric) ?? null, [activeMetric, stats?.kpis]);
  const activeActions = useMemo(() => stats?.actionItems.filter((item) => item.status !== "completed" && item.status !== "dismissed") ?? [], [stats?.actionItems]);
  const decisionInsights = useMemo(() => {
    const insights = stats?.actionableInsights ?? [];
    const leading = insights.slice(0, 5);
    const leverage = insights.find(
      (item) =>
        (item.kind === "opportunity" || item.kind === "behavior")
        && !leading.some((selected) => selected.sourceId === item.sourceId),
    );
    return leverage ? [...leading, leverage] : insights.slice(0, 6);
  }, [stats?.actionableInsights]);
  const unassignedActions = useMemo(() => activeActions.filter((item) => !item.owner).length, [activeActions]);
  const overdueActions = useMemo(() => activeActions.filter((item) => item.reviewAt && new Date(item.reviewAt).getTime() < Date.now()).length, [activeActions]);

  function selectRange(days: RangeDays) {
    setRange(days);
    setDrillPage(1);
    updateUrl(activeMetric, days, activeCategory);
  }

  function openDrilldown(metric: MetricId, category: string | null = null) {
    setActiveMetric(metric);
    setActiveCategory(category);
    setDrillPage(1);
    updateUrl(metric, range, category);
  }

  const handleLogout = useCallback(async (event: FormEvent) => {
    event.preventDefault();
    await fetch("/api/admin/logout", { method: "POST" });
    router.push("/admin");
  }, [router]);

  async function refreshAll() {
    await Promise.all([loadStats(range, true), loadKnowledgeHealth()]);
  }

  async function handleIngest() {
    setIngesting(true);
    setIngestResult(null);
    try {
      const response = await fetch("/api/admin/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "ingest", clearExisting: false }),
      });
      if (!response.ok) throw new Error(`Knowledge refresh failed (${response.status})`);
      setIngestResult(await response.json() as IngestResult);
      await loadKnowledgeHealth();
    } catch (ingestError) {
      setIngestResult({ videosProcessed: 0, documentsUploaded: 0, errors: [ingestError instanceof Error ? ingestError.message : "Knowledge refresh failed"], skippedVideos: [], logs: [], documentCount: ingestStatus?.documentCount ?? 0 });
    } finally {
      setIngesting(false);
    }
  }

  async function createAction(input: { sourceType: string; sourceId: string; title: string; description?: string; priority: ActionPriority; actionUrl?: string; notes?: string; successMeasure?: string; baselineValue?: number | null; targetValue?: number | null; metricUnit?: string | null; reviewAt?: string | null }) {
    setActionMessage(null);
    const response = await fetch("/api/admin/ai-actions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
    const body = await response.json().catch(() => ({})) as { action?: AiActionItem; error?: string } & Partial<AiActionItem>;
    if (!response.ok) throw new Error(body.error || `Could not track action (${response.status})`);
    const action = body.action ?? body as AiActionItem;
    setStats((current) => current ? { ...current, actionItems: [action, ...current.actionItems.filter((item) => item.id !== action.id)] } : current);
    setActionMessage("Action is now tracked in the register.");
  }

  async function trackKpi(kpi: AIKpi) {
    const windowKey = stats ? `${stats.range.start}:${stats.range.end}` : String(range);
    const reviewAt = new Date();
    reviewAt.setUTCDate(reviewAt.getUTCDate() + Math.min(range, 30));
    await createAction({ sourceType: "kpi_anomaly", sourceId: `${kpi.id}:${windowKey}`, title: `${kpi.label} needs attention`, description: `${kpi.definition} Current value: ${formatKpiValue(kpi)}. ${formatTarget(kpi)}.`, priority: kpi.status === "critical" ? "critical" : "high", actionUrl: `/admin/ai-dashboard?range=${range}&metric=${kpi.id}`, successMeasure: kpi.target ? `Move ${kpi.label.toLowerCase()} to ${kpi.target.operator}${kpi.target.value}${kpi.unit === "percent" ? "%" : ""} and verify it in the next comparison window.` : `Document the decision this metric supports and record the measured result in the next comparison window.`, baselineValue: kpi.value, targetValue: kpi.target?.value ?? null, metricUnit: kpi.unit, reviewAt: reviewAt.toISOString() });
  }

  async function trackInsight(insight: ActionableBusinessInsight) {
    const reviewAt = new Date();
    reviewAt.setUTCDate(reviewAt.getUTCDate() + insight.reviewAfterDays);
    await createAction({
      sourceType: "kpi_anomaly",
      sourceId: insight.sourceId,
      title: insight.title,
      description: `${insight.observation}\n\n${insight.whyItMatters}`,
      priority: insight.priority,
      notes: `Recommended next step: ${insight.recommendedAction}`,
      actionUrl: insight.drilldown && isMetricId(insight.drilldown.metric)
        ? `/admin/ai-dashboard?range=${range}&metric=${encodeURIComponent(insight.drilldown.metric)}${insight.drilldown.category ? `&category=${encodeURIComponent(insight.drilldown.category)}` : ""}`
        : insight.actionUrl,
      successMeasure: insight.successMeasure,
      baselineValue: insight.baselineValue,
      targetValue: insight.targetValue,
      metricUnit: insight.metricUnit,
      reviewAt: reviewAt.toISOString(),
    });
  }

  async function trackDrillItem(item: DrillItem) {
    if (!activeKpi || !activeMetric) return;
    const reviewAt = new Date();
    reviewAt.setUTCDate(reviewAt.getUTCDate() + 14);
    await createAction({ sourceType: sourceTypeForMetric(activeMetric), sourceId: item.id, title: itemTitle(item, activeKpi.label), description: `Surfaced from ${activeKpi.label}. ${activeKpi.definition}`, priority: activeKpi.status === "critical" ? "critical" : "high", actionUrl: `/admin/ai-dashboard?range=${range}&metric=${activeMetric}${activeCategory ? `&category=${encodeURIComponent(activeCategory)}` : ""}`, successMeasure: `Resolve or document this finding and verify the relevant ${activeKpi.label.toLowerCase()} result at the review date.`, baselineValue: activeKpi.value, targetValue: activeKpi.target?.value ?? null, metricUnit: activeKpi.unit, reviewAt: reviewAt.toISOString() });
  }

  async function updateAction(id: string, update: Partial<AiActionItem>) {
    const response = await fetch(`/api/admin/ai-actions/${encodeURIComponent(id)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(update) });
    const body = await response.json().catch(() => ({})) as { action?: AiActionItem; error?: string } & Partial<AiActionItem>;
    if (!response.ok) throw new Error(body.error || `Could not update action (${response.status})`);
    const updated = body.action ?? body as AiActionItem;
    setStats((current) => current ? { ...current, actionItems: current.actionItems.map((item) => item.id === id ? updated : item) } : current);
  }

  async function resolveGap(item: DrillItem) {
    setResolvingGapId(item.id);
    try {
      const response = await fetch("/api/admin/gaps/resolve", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ gapId: item.id }) });
      if (!response.ok) {
        const body = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error || `Could not resolve gap (${response.status})`);
      }
      if (activeMetric) await loadDrilldown(activeMetric, range, drillPage, activeCategory);
      await loadStats(range, true);
      setActionMessage("Knowledge gap marked resolved.");
    } finally {
      setResolvingGapId(null);
    }
  }

  if (loading && !stats) {
    return <div className="min-h-screen bg-[var(--color-background)] p-4" data-testid="ai-dashboard-skeleton"><div className="mx-auto max-w-7xl animate-pulse space-y-4 pt-20"><div className="h-9 w-64 rounded bg-[var(--color-surface-light)]" /><div className="grid grid-cols-2 gap-3 lg:grid-cols-5">{Array.from({ length: 10 }, (_, index) => <div key={index} className="h-40 rounded-xl bg-[var(--color-surface)]" />)}</div></div></div>;
  }

  return (
    <div className="min-h-screen bg-[var(--color-background)]" data-testid="ai-dashboard">
      <header className="sticky top-0 z-30 border-b border-[var(--color-surface-light)] bg-[var(--color-surface)]">
        <div className="flex items-center justify-between px-4 py-3"><h1 className="text-lg font-bold text-[var(--color-foreground)]">Admin Panel</h1><form onSubmit={handleLogout}><button type="submit" className="rounded-lg border border-[var(--color-surface-light)] px-3 py-1.5 text-sm text-[var(--color-muted)] hover:border-red-500 hover:text-red-400">Log Out</button></form></div>
        <nav className="flex gap-1 overflow-x-auto px-4" aria-label="Admin navigation"><a href="/admin/dashboard" className="whitespace-nowrap border-b-2 border-transparent px-3 py-2 text-sm font-medium text-[var(--color-muted)]">Commanders</a><span className="whitespace-nowrap border-b-2 border-[var(--color-accent)] px-3 py-2 text-sm font-medium text-[var(--color-accent)]">AI Dashboard</span><a href="/admin/usage-analytics" className="whitespace-nowrap border-b-2 border-transparent px-3 py-2 text-sm font-medium text-[var(--color-muted)]">Usage Analytics</a><a href="/admin/monetization" className="whitespace-nowrap border-b-2 border-transparent px-3 py-2 text-sm font-medium text-[var(--color-muted)]">Monetization</a></nav>
      </header>

      <main className="mx-auto max-w-7xl space-y-6 p-4 pb-24" data-testid="ai-dashboard-content">
        <section className="flex flex-col gap-4 pt-2 lg:flex-row lg:items-end lg:justify-between">
          <div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-accent)]">AI decision center</p><h2 className="mt-1 text-2xl font-bold text-[var(--color-foreground)]">Turn product signals into measurable decisions</h2><p className="mt-1 max-w-3xl text-sm text-[var(--color-muted)]">See what commanders are doing, where the business can gain leverage, what needs improvement, and the next action to test. Raw metrics remain available as supporting evidence.</p></div>
          <div className="flex flex-wrap items-center gap-2"><div className="flex rounded-lg border border-[var(--color-surface-light)] bg-[var(--color-surface)] p-1" aria-label="Reporting range" data-testid="ai-range-control">{RANGE_OPTIONS.map((days) => <button key={days} type="button" onClick={() => selectRange(days)} className={`rounded-md px-3 py-1.5 text-xs font-semibold ${range === days ? "bg-[var(--color-accent)] text-white" : "text-[var(--color-muted)]"}`}>{days} days</button>)}</div><button type="button" onClick={refreshAll} disabled={refreshing} className="rounded-lg border border-[var(--color-surface-light)] bg-[var(--color-surface)] px-3 py-2 text-xs font-semibold text-[var(--color-foreground)] disabled:opacity-50">{refreshing ? "Refreshing…" : "Refresh all"}</button></div>
        </section>

        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--color-muted)]"><span>{stats ? `${new Date(stats.range.start).toLocaleDateString()}–${formatInclusiveDate(stats.range.end)} · compared with the prior ${stats.range.days} days · UTC` : "Range unavailable"}</span><span>Data as of {lastRefresh ? lastRefresh.toLocaleTimeString() : "—"} · refreshes every 60s</span></div>
        {error && <div className="flex items-center justify-between gap-3 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300" role="alert"><span>{error}</span><button type="button" onClick={() => loadStats(range)} className="rounded-lg border border-red-400/40 px-3 py-1.5 text-xs font-semibold">Retry</button></div>}

        {stats && (
          <>
            <section className="min-w-0" aria-labelledby="decision-brief-heading" data-testid="ai-decision-brief">
              <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-accent)]">Decision brief</p>
                  <h3 id="decision-brief-heading" className="mt-1 text-xl font-bold text-[var(--color-foreground)]">What should we act on now?</h3>
                  <p className="mt-1 max-w-3xl text-xs leading-relaxed text-[var(--color-muted)]">Prioritized opportunities, risks, and improvements. Every finding explains the evidence, the business implication, the next move, and how success will be judged.</p>
                </div>
                <span className="rounded-full bg-[var(--color-surface)] px-3 py-1 text-xs text-[var(--color-muted)]">{stats.actionableInsights.length} actionable findings</span>
              </div>
              {stats.actionableInsights.length === 0 ? (
                <p className="rounded-xl border border-green-500/30 bg-green-500/10 p-4 text-sm text-green-300">No rule currently surfaces a material opportunity or problem. Keep collecting data and review the diagnostic evidence below.</p>
              ) : (
                <div className="grid min-w-0 gap-4 xl:grid-cols-2">
                  {decisionInsights.map((insight) => (
                    <InsightCard
                      key={insight.sourceId}
                      insight={insight}
                      onDrilldown={(metric, category) => openDrilldown(metric, category ?? null)}
                      onTrack={(selected) => trackInsight(selected).catch((trackError) => setActionMessage(trackError instanceof Error ? trackError.message : "Could not track action"))}
                    />
                  ))}
                </div>
              )}
            </section>

            <section className="min-w-0 rounded-xl border border-[var(--color-surface-light)] bg-[var(--color-surface)] p-4" data-testid="ai-action-register">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="text-lg font-semibold text-[var(--color-foreground)]">Action register</h3>
                  <p className="text-xs text-[var(--color-muted)]">Assign the work, define the target, record the result, and decide whether the change worked.</p>
                </div>
                <div className="flex flex-wrap gap-1.5 text-[10px]">
                  <span className="rounded-full bg-blue-500/15 px-2 py-1 text-blue-300">{activeActions.length} active</span>
                  <span className={`rounded-full px-2 py-1 ${unassignedActions > 0 ? "bg-orange-500/15 text-orange-300" : "bg-green-500/15 text-green-300"}`}>{unassignedActions} unassigned</span>
                  <span className={`rounded-full px-2 py-1 ${overdueActions > 0 ? "bg-red-500/15 text-red-300" : "bg-green-500/15 text-green-300"}`}>{overdueActions} overdue</span>
                </div>
              </div>
              {actionMessage && <p className="mt-3 rounded-lg bg-blue-500/10 p-2 text-xs text-blue-300">{actionMessage}</p>}
              <div className="mt-3 grid min-w-0 gap-3 lg:grid-cols-2">
                {stats.actionItems.length === 0 ? <p className="text-xs text-[var(--color-muted)]">No tracked actions yet. Use “Track action” on a decision card to retain its baseline, target, and review date.</p> : stats.actionItems.map((action) => <ActionEditor key={action.id} action={action} onSave={updateAction} />)}
              </div>
            </section>

            <section className="min-w-0 rounded-xl border border-[var(--color-surface-light)] bg-[var(--color-surface)] p-4" data-testid="ai-product-usage">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold text-[var(--color-foreground)]">How commanders are using the toolkit</h3>
                  <p className="mt-1 text-xs text-[var(--color-muted)]">Reach, return behavior, Advisor adoption, onboarding, and the product areas commanders actually visit.</p>
                </div>
                <span className="rounded-full bg-violet-500/15 px-2.5 py-1 text-[10px] font-semibold text-violet-300">Directional · partial telemetry</span>
              </div>
              <p className="mt-3 rounded-lg bg-yellow-500/10 p-2 text-[10px] leading-relaxed text-yellow-200">{stats.productUsage.telemetryCaveat}</p>
              <div className="mt-4 grid grid-cols-2 gap-2 lg:grid-cols-4">
                <div className="rounded-lg bg-[var(--color-background)] p-3"><p className="text-2xl font-bold text-[var(--color-foreground)]">{stats.productUsage.activeUsers}</p><p className="text-[10px] text-[var(--color-muted)]">Active commanders</p><p className="mt-1 text-[10px] text-[var(--color-foreground)]">{stats.productUsage.activeUserChangePercent === null ? "No prior baseline" : `${stats.productUsage.activeUserChangePercent > 0 ? "+" : ""}${stats.productUsage.activeUserChangePercent}% vs prior`}</p></div>
                <div className="rounded-lg bg-[var(--color-background)] p-3"><p className="text-2xl font-bold text-[var(--color-foreground)]">{metricValue(stats.productUsage.advisorAdoptionRate, "percent")}</p><p className="text-[10px] text-[var(--color-muted)]">Advisor reach</p><p className="mt-1 text-[10px] text-[var(--color-foreground)]">{stats.productUsage.advisorUsers} users</p></div>
                <div className="rounded-lg bg-[var(--color-background)] p-3"><p className="text-2xl font-bold text-[var(--color-foreground)]">{metricValue(stats.productUsage.answersPerAdvisorUser, null)}</p><p className="text-[10px] text-[var(--color-muted)]">Answers per Advisor user</p><p className="mt-1 text-[10px] text-[var(--color-foreground)]">{metricValue(stats.productUsage.multiQuestionRate, "percent")} asked more than once</p></div>
                <div className="rounded-lg bg-[var(--color-background)] p-3"><p className="text-2xl font-bold text-[var(--color-foreground)]">{metricValue(stats.productUsage.aiReturnRate, "percent")}</p><p className="text-[10px] text-[var(--color-muted)]">Advisor return rate</p><p className="mt-1 text-[10px] text-[var(--color-foreground)]">{stats.productUsage.aiReturningUsers} returned</p></div>
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                <div className="rounded-lg border border-[var(--color-surface-light)] p-3"><p className="text-xs font-semibold text-[var(--color-foreground)]">New-user activation</p><p className="mt-1 text-sm text-[var(--color-foreground)]">{metricValue(stats.productUsage.onboardingCompletionRate, "percent")} completed onboarding</p><p className="text-[10px] text-[var(--color-muted)]">{stats.productUsage.onboardingCompleted} of {stats.productUsage.newCommanders} new commanders</p></div>
                <div className="rounded-lg border border-[var(--color-surface-light)] p-3"><p className="text-xs font-semibold text-[var(--color-foreground)]">Cancellation learning</p><p className="mt-1 text-sm text-[var(--color-foreground)]">{metricValue(stats.productUsage.cancellationResponseRate, "percent")} request-cohort response</p><p className="text-[10px] text-[var(--color-muted)]">{stats.productUsage.cancellationResponses} of {stats.productUsage.cancellationRequests} current requests</p></div>
                <div className={`rounded-lg border p-3 ${stats.productUsage.unactionedCancellationResponses > 0 ? "border-red-500/40 bg-red-500/5" : "border-green-500/30 bg-green-500/5"}`}><p className="text-xs font-semibold text-[var(--color-foreground)]">Feedback awaiting action</p><p className="mt-1 text-sm text-[var(--color-foreground)]">{stats.productUsage.unactionedCancellationResponses} open response{stats.productUsage.unactionedCancellationResponses === 1 ? "" : "s"}</p><a href="/admin/cancellation-feedback" className="text-[10px] font-semibold text-[var(--color-accent)]">Open cancellation queue →</a></div>
              </div>
              <div className="mt-4 max-w-full overflow-x-auto">
                <table className="w-full min-w-[680px] text-left text-xs">
                  <thead className="text-[var(--color-muted)]"><tr><th className="pb-2 font-medium">Product area</th><th className="pb-2 text-right font-medium">Users</th><th className="pb-2 text-right font-medium">Page views</th><th className="pb-2 text-right font-medium">Adoption</th><th className="pb-2 text-right font-medium">Return</th><th className="pb-2 text-right font-medium">Free / Premium</th></tr></thead>
                  <tbody className="divide-y divide-[var(--color-surface-light)]">{stats.productAreas.map((area) => <tr key={area.id}><td className="py-2.5 font-medium text-[var(--color-foreground)]">{area.label}</td><td className="py-2.5 text-right text-[var(--color-foreground)]">{area.uniqueUsers}</td><td className="py-2.5 text-right text-[var(--color-muted)]">{area.pageViews}</td><td className="py-2.5 text-right text-[var(--color-foreground)]">{metricValue(area.adoptionRate, "percent")}</td><td className="py-2.5 text-right text-[var(--color-foreground)]">{metricValue(area.returnRate, "percent")}</td><td className="py-2.5 text-right text-[var(--color-muted)]">{area.freeUsers} / {area.premiumUsers}</td></tr>)}</tbody>
                </table>
              </div>
            </section>

            <section aria-labelledby="kpi-heading">
              <div className="mb-3 flex items-center justify-between"><div><h3 id="kpi-heading" className="text-lg font-semibold text-[var(--color-foreground)]">Diagnostic evidence</h3><p className="text-xs text-[var(--color-muted)]">Supporting AI metrics for investigating a decision card—not a substitute for a recommended action.</p></div><span className="rounded-full bg-[var(--color-surface)] px-3 py-1 text-xs text-[var(--color-muted)]">Select a KPI to inspect records</span></div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5" data-testid="ai-kpis">
                {stats.kpis.map((kpi) => { const status = STATUS_STYLE[kpi.status]; return <button key={kpi.id} type="button" onClick={() => openDrilldown(kpi.drilldown.metric)} className="group min-h-44 rounded-xl border border-[var(--color-surface-light)] bg-[var(--color-surface)] p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-[var(--color-accent)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]" data-testid={`kpi-${kpi.id}`}><div className="flex items-start justify-between gap-2"><p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-muted)]">{kpi.label}</p><span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-semibold ${status.className}`}>{status.label}</span></div><p className="mt-3 text-3xl font-bold text-[var(--color-foreground)]">{formatKpiValue(kpi)}</p><div className="mt-2 flex flex-wrap gap-x-2 text-xs"><span className="font-medium text-[var(--color-foreground)]">{formatChange(kpi)}</span><span className="text-[var(--color-muted)]">vs prior period</span></div><p className="mt-2 text-[11px] text-[var(--color-muted)]">{formatTarget(kpi)} · n={kpi.sampleSize.toLocaleString()}</p><p className="mt-3 text-xs font-semibold text-[var(--color-accent)]">View details →</p></button>; })}
              </div>
            </section>

            <section className="grid min-w-0 gap-4 xl:grid-cols-[1.35fr_1fr]">
              <div className="min-w-0 rounded-xl border border-[var(--color-surface-light)] bg-[var(--color-surface)] p-4" data-testid="ai-quality-trend"><div className="flex flex-wrap items-start justify-between gap-2"><div><h3 className="text-sm font-semibold text-[var(--color-foreground)]">Completed-answer trend</h3><p className="text-xs text-[var(--color-muted)]">Daily volume; red segment is the low-confidence share.</p></div><div className="flex gap-3 text-[10px] text-[var(--color-muted)]"><span>■ Completed</span><span className="text-red-300">■ Low confidence</span></div></div><div className="mt-4 max-w-full overflow-x-auto pb-2"><div className="flex h-44 min-w-[560px] items-end gap-1" style={{ width: `${Math.max(560, stats.dailyTrend.length * 18)}px` }}>{stats.dailyTrend.map((point) => { const max = Math.max(1, ...stats.dailyTrend.map((entry) => entry.completedAnswers)); const height = Math.max(point.completedAnswers > 0 ? 4 : 1, (point.completedAnswers / max) * 144); const lowHeight = point.lowConfidenceRate === null ? 0 : height * point.lowConfidenceRate / 100; return <div key={point.date} className="group relative flex h-full min-w-3 flex-1 items-end" title={`${point.date}: ${point.completedAnswers} answers, ${point.lowConfidenceRate ?? "—"}% low confidence`}><div className="relative w-full overflow-hidden rounded-t bg-blue-500/70" style={{ height: `${height}px` }}>{lowHeight > 0 && <div className="absolute inset-x-0 bottom-0 bg-red-400/90" style={{ height: `${lowHeight}px` }} />}</div></div>; })}</div></div></div>
              <div className="min-w-0 rounded-xl border border-[var(--color-surface-light)] bg-[var(--color-surface)] p-4" data-testid="ai-model-mix"><h3 className="text-sm font-semibold text-[var(--color-foreground)]">Persisted answer model mix</h3><p className="text-xs text-[var(--color-muted)]">Conversation-backed answers only; cached or legacy rows may be unlabeled.</p><div className="mt-4 space-y-3">{stats.modelMix.length === 0 ? <p className="text-xs text-[var(--color-muted)]">No model data in this period.</p> : stats.modelMix.map((model) => <div key={model.model}><div className="mb-1 flex justify-between gap-3 text-xs"><span className="truncate text-[var(--color-foreground)]">{model.model}</span><span className="text-[var(--color-muted)]">{model.answers} · {model.share ?? 0}%</span></div><div className="h-1.5 overflow-hidden rounded-full bg-[var(--color-background)]"><div className="h-full rounded-full bg-[var(--color-accent)]" style={{ width: `${Math.min(100, model.share ?? 0)}%` }} /></div></div>)}</div></div>
            </section>

            <section className="min-w-0 rounded-xl border border-[var(--color-surface-light)] bg-[var(--color-surface)] p-4" data-testid="ai-category-scorecard"><div className="mb-3"><h3 className="text-sm font-semibold text-[var(--color-foreground)]">Category scorecard</h3><p className="text-xs text-[var(--color-muted)]">Shows whether a quality issue is broad or concentrated in a specific question category.</p></div><div className="max-w-full overflow-x-auto"><table className="w-full min-w-[700px] text-left text-xs"><thead className="text-[var(--color-muted)]"><tr><th className="pb-2 font-medium">Category</th><th className="pb-2 text-right font-medium">Answers</th><th className="pb-2 text-right font-medium">Pass</th><th className="pb-2 text-right font-medium">Low confidence</th><th className="pb-2 text-right font-medium">Grounded</th><th className="pb-2 text-right font-medium">Avg confidence</th></tr></thead><tbody className="divide-y divide-[var(--color-surface-light)]">{stats.categoryScorecard.map((category) => <tr key={category.category}><td className="py-2.5 font-medium text-[var(--color-foreground)]">{titleCase(category.category)}</td><td className="py-2.5 text-right text-[var(--color-muted)]">{category.completedAnswers}</td><td className="py-2.5 text-right text-[var(--color-foreground)]">{category.successRate === null ? "—" : `${category.successRate}%`}</td><td className={`py-2.5 text-right ${(category.lowConfidenceRate ?? 0) > 15 ? "text-red-300" : "text-[var(--color-foreground)]"}`}>{category.lowConfidenceRate === null ? "—" : `${category.lowConfidenceRate}%`}</td><td className="py-2.5 text-right text-[var(--color-foreground)]">{category.groundedRate === null ? "—" : `${category.groundedRate}%`}</td><td className="py-2.5 text-right text-[var(--color-foreground)]">{category.averageConfidence ?? "—"}</td></tr>)}</tbody></table></div></section>

            <section className="grid min-w-0 gap-4 xl:grid-cols-[1fr_1.2fr]" data-testid="ai-knowledge-operations">
              <div className="min-w-0 rounded-xl border border-[var(--color-surface-light)] bg-[var(--color-surface)] p-4"><div className="flex min-w-0 items-start justify-between gap-2"><div className="min-w-0"><h3 className="text-sm font-semibold text-[var(--color-foreground)]">Gap backlog</h3><p className="text-xs text-[var(--color-muted)]">Unresolved knowledge demand, regardless of the selected reporting period.</p></div><span className={`shrink-0 rounded-full px-2 py-1 text-xs font-semibold ${stats.gapSummary.agedGaps > 0 ? "bg-red-500/15 text-red-300" : "bg-green-500/15 text-green-300"}`}>{stats.gapSummary.openGaps} open</span></div><div className="mt-4 grid grid-cols-3 gap-2 text-center"><div className="rounded-lg bg-[var(--color-background)] p-3"><p className="text-xl font-bold text-[var(--color-foreground)]">{stats.gapSummary.openGaps}</p><p className="text-[10px] text-[var(--color-muted)]">Open gaps</p></div><div className="rounded-lg bg-[var(--color-background)] p-3"><p className="text-xl font-bold text-[var(--color-foreground)]">{stats.gapSummary.openDemand}</p><p className="text-[10px] text-[var(--color-muted)]">Question demand</p></div><div className="rounded-lg bg-[var(--color-background)] p-3"><p className="text-xl font-bold text-red-300">{stats.gapSummary.agedGaps}</p><p className="text-[10px] text-[var(--color-muted)]">Older than {stats.gapSummary.agedAfterDays}d</p></div></div><div className="mt-3 space-y-1.5">{stats.gapSummary.byCategory.slice(0, 6).map((category) => <div key={category.category} className="flex items-center justify-between text-xs"><span className="text-[var(--color-foreground)]">{titleCase(category.category)}</span><span className="text-[var(--color-muted)]">{category.openGaps} gaps · {category.openDemand} demand</span></div>)}</div><button type="button" onClick={() => openDrilldown("open-gap-demand")} className="mt-4 w-full rounded-lg border border-[var(--color-accent)] px-3 py-2 text-xs font-semibold text-[var(--color-accent)]">Open gap work queue</button></div>
              <div className="min-w-0 rounded-xl border border-[var(--color-surface-light)] bg-[var(--color-surface)] p-4"><div className="flex min-w-0 flex-wrap items-start justify-between gap-2"><div className="min-w-0"><h3 className="text-sm font-semibold text-[var(--color-foreground)]">Knowledge health</h3><p className="text-xs text-[var(--color-muted)]">Search coverage, freshness, and ingestion controls.</p></div>{kbHealth && <span className={`shrink-0 rounded-full px-2 py-1 text-xs font-semibold ${kbHealth.overallStatus === "healthy" ? "bg-green-500/15 text-green-300" : "bg-yellow-500/15 text-yellow-300"}`}>{titleCase(kbHealth.overallStatus)}</span>}</div>{knowledgeError && <p className="mt-3 rounded-lg bg-red-500/10 p-2 text-xs text-red-300">{knowledgeError}</p>}{kbHealth && ingestStatus ? <><div className="mt-4 grid grid-cols-3 gap-2 text-center"><div className="rounded-lg bg-[var(--color-background)] p-3"><p className="text-xl font-bold text-[var(--color-foreground)]">{kbHealth.totalDocuments}</p><p className="text-[10px] text-[var(--color-muted)]">Documents</p></div><div className="rounded-lg bg-[var(--color-background)] p-3"><p className="text-xl font-bold text-[var(--color-foreground)]">{kbHealth.metadataCoverage}%</p><p className="text-[10px] text-[var(--color-muted)]">Metadata</p></div><div className="rounded-lg bg-[var(--color-background)] p-3"><p className={`text-xl font-bold ${kbHealth.staleDocuments > 0 ? "text-yellow-300" : "text-green-300"}`}>{kbHealth.staleDocuments}</p><p className="text-[10px] text-[var(--color-muted)]">Stale</p></div></div><div className="mt-3 space-y-1.5">{Object.entries(kbHealth.sources).map(([name, source]) => <div key={name} className="flex items-center justify-between text-xs"><span className="text-[var(--color-foreground)]">{titleCase(name)}</span><span className={source.status === "healthy" ? "text-green-300" : source.status === "stale" ? "text-yellow-300" : "text-red-300"}>{source.status === "missing" ? "Missing" : `${source.count} · ${source.newestSourceDate ? formatRelativeTime(source.newestSourceDate) : "unknown"}`}</span></div>)}</div>{kbHealth.warnings.length > 0 && <div className="mt-3 rounded-lg bg-yellow-500/10 p-2 text-xs text-yellow-300">{kbHealth.warnings.map((warning) => <p key={warning}>• {warning}</p>)}</div>}<button type="button" onClick={handleIngest} disabled={ingesting || !ingestStatus.searchConfigured} className="mt-4 w-full rounded-lg bg-[var(--color-accent)] px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">{ingesting ? "Refreshing knowledge…" : "Refresh knowledge base"}</button><p className="mt-2 text-[10px] text-[var(--color-muted)]">Last automated refresh: {ingestStatus.refreshState ? formatRelativeTime(ingestStatus.refreshState.lastRefreshAt) : "never"}</p></> : !knowledgeError ? <p className="mt-4 text-xs text-[var(--color-muted)]">Loading knowledge health…</p> : null}{ingestResult && <div className={`mt-3 rounded-lg p-2 text-xs ${ingestResult.errors.length > 0 ? "bg-red-500/10 text-red-300" : "bg-green-500/10 text-green-300"}`}>{ingestResult.errors.length > 0 ? ingestResult.errors.map((item) => <p key={item}>{item}</p>) : <p>{ingestResult.videosProcessed} videos processed · {ingestResult.documentsUploaded} documents uploaded</p>}</div>}</div>
            </section>
          </>
        )}
      </main>

      {activeMetric && <div className="fixed inset-0 z-50 bg-black/60" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeDrilldown(); }}><aside className="absolute inset-y-0 right-0 w-full overflow-y-auto border-l border-[var(--color-surface-light)] bg-[var(--color-background)] shadow-2xl sm:max-w-xl" role="dialog" aria-modal="true" aria-labelledby="drilldown-title" data-testid="ai-kpi-drilldown"><div className="sticky top-0 z-10 border-b border-[var(--color-surface-light)] bg-[var(--color-background)]/95 p-4 backdrop-blur"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-accent)]">Evidence drill-down</p><h2 id="drilldown-title" className="mt-1 text-xl font-bold text-[var(--color-foreground)]">{activeKpi?.label ?? titleCase(activeMetric)}</h2>{activeCategory && <p className="mt-1 text-xs font-semibold text-cyan-300">Filtered to {titleCase(activeCategory)}</p>}</div><button type="button" onClick={closeDrilldown} aria-label="Close KPI details" className="rounded-lg border border-[var(--color-surface-light)] px-3 py-2 text-sm text-[var(--color-muted)]">✕</button></div>{activeKpi && <div className="mt-3"><div className="flex flex-wrap items-center gap-2"><span className="text-2xl font-bold text-[var(--color-foreground)]">{formatKpiValue(activeKpi)}</span><span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${STATUS_STYLE[activeKpi.status].className}`}>{STATUS_STYLE[activeKpi.status].label}</span><span className="text-xs text-[var(--color-muted)]">{formatChange(activeKpi)} vs prior</span></div><p className="mt-2 text-sm leading-relaxed text-[var(--color-foreground)]">{activeKpi.definition}</p><p className="mt-1 text-xs text-[var(--color-muted)]">{formatTarget(activeKpi)} · sample n={activeKpi.sampleSize}</p>{activeKpi.caveat && <p className="mt-2 rounded-lg bg-yellow-500/10 p-2 text-xs leading-relaxed text-yellow-200">{activeKpi.caveat}</p>}<button type="button" onClick={() => trackKpi(activeKpi).catch((trackError) => setActionMessage(trackError instanceof Error ? trackError.message : "Could not track action"))} className="mt-3 rounded-lg bg-[var(--color-accent)] px-3 py-2 text-xs font-semibold text-white">Track KPI action</button></div>}</div><div className="space-y-3 p-4">{drillLoading && <p className="rounded-xl bg-[var(--color-surface)] p-4 text-sm text-[var(--color-muted)]">Loading underlying records…</p>}{drillError && <div className="rounded-xl bg-red-500/10 p-4 text-sm text-red-300"><p>{drillError}</p><button type="button" onClick={() => loadDrilldown(activeMetric, range, drillPage, activeCategory)} className="mt-2 text-xs font-semibold underline">Retry</button></div>}{!drillLoading && !drillError && drilldown?.items.length === 0 && <p className="rounded-xl bg-[var(--color-surface)] p-4 text-sm text-[var(--color-muted)]">No underlying records for this period.</p>}{!drillLoading && drilldown?.items.map((item) => <article key={item.id} className="rounded-xl border border-[var(--color-surface-light)] bg-[var(--color-surface)] p-4" data-testid="ai-drilldown-item"><div className="flex items-start justify-between gap-3"><p className="min-w-0 flex-1 text-sm font-semibold leading-relaxed text-[var(--color-foreground)]">{itemTitle(item, activeKpi?.label ?? "AI record")}</p><span className="shrink-0 text-[10px] text-[var(--color-muted)]">{formatRelativeTime(item.occurredAt)}</span></div><div className="mt-2 flex flex-wrap gap-1.5 text-[10px]">{item.category && <span className="rounded-full bg-blue-500/15 px-2 py-1 text-blue-300">{titleCase(item.category)}</span>}{item.confidenceScore !== undefined && item.confidenceScore !== null && <span className={`rounded-full px-2 py-1 ${item.confidenceScore < 60 ? "bg-red-500/15 text-red-300" : "bg-green-500/15 text-green-300"}`}>Confidence {item.confidenceScore}</span>}{item.answeredSuccessfully !== undefined && <span className={`rounded-full px-2 py-1 ${item.answeredSuccessfully ? "bg-green-500/15 text-green-300" : "bg-red-500/15 text-red-300"}`}>{item.answeredSuccessfully ? "Classified pass" : "Classified fail"}</span>}{item.knowledgeSourcesCount !== undefined && <span className="rounded-full bg-slate-500/20 px-2 py-1 text-slate-300">{item.knowledgeSourcesCount} sources</span>}{item.answerCount !== undefined && <span className="rounded-full bg-cyan-500/15 px-2 py-1 text-cyan-300">{item.answerCount} answers</span>}{item.feedback && <span className={`rounded-full px-2 py-1 ${item.feedback === "positive" ? "bg-green-500/15 text-green-300" : "bg-red-500/15 text-red-300"}`}>{titleCase(item.feedback)}</span>}{item.modelUsed && <span className="rounded-full bg-violet-500/15 px-2 py-1 text-violet-300">{item.modelUsed}</span>}{item.tokensUsed !== undefined && <span className="rounded-full bg-slate-500/20 px-2 py-1 text-slate-300">{item.tokensUsed.toLocaleString()} tokens</span>}{item.frequency !== undefined && <span className="rounded-full bg-orange-500/15 px-2 py-1 text-orange-300">Demand {item.frequency}</span>}{item.ageDays !== undefined && <span className="rounded-full bg-red-500/15 px-2 py-1 text-red-300">{item.ageDays}d old</span>}</div>{item.feedbackComment && <blockquote className="mt-3 rounded-lg border-l-2 border-red-400 bg-red-500/10 p-3 text-xs leading-relaxed text-red-100">“{item.feedbackComment}”</blockquote>}{item.content && item.content !== item.question && <p className="mt-3 whitespace-pre-wrap text-xs leading-relaxed text-[var(--color-muted)]">{item.content}</p>}<div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={() => trackDrillItem(item).catch((trackError) => setActionMessage(trackError instanceof Error ? trackError.message : "Could not track action"))} className="rounded-lg border border-[var(--color-accent)] px-2.5 py-1.5 text-xs font-semibold text-[var(--color-accent)]">Track action</button>{(activeMetric === "open-gap-demand" || activeMetric === "aged-gaps") && <button type="button" onClick={() => resolveGap(item).catch((resolveError) => setActionMessage(resolveError instanceof Error ? resolveError.message : "Could not resolve gap"))} disabled={resolvingGapId === item.id} className="rounded-lg bg-green-600 px-2.5 py-1.5 text-xs font-semibold text-white disabled:opacity-50">{resolvingGapId === item.id ? "Resolving…" : "Mark resolved"}</button>}</div></article>)}{drilldown && drilldown.pagination.totalPages > 1 && <div className="flex items-center justify-between border-t border-[var(--color-surface-light)] pt-3"><button type="button" onClick={() => setDrillPage((page) => Math.max(1, page - 1))} disabled={drilldown.pagination.page <= 1} className="rounded-lg border border-[var(--color-surface-light)] px-3 py-2 text-xs text-[var(--color-foreground)] disabled:opacity-40">Previous</button><span className="text-xs text-[var(--color-muted)]">Page {drilldown.pagination.page} of {drilldown.pagination.totalPages} · {drilldown.pagination.total} records</span><button type="button" onClick={() => setDrillPage((page) => Math.min(drilldown.pagination.totalPages, page + 1))} disabled={drilldown.pagination.page >= drilldown.pagination.totalPages} className="rounded-lg border border-[var(--color-surface-light)] px-3 py-2 text-xs text-[var(--color-foreground)] disabled:opacity-40">Next</button></div>}</div></aside></div>}
    </div>
  );
}
