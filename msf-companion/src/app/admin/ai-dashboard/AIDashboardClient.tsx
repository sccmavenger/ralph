"use client";

import { useState, useEffect, useCallback, FormEvent } from "react";
import { useRouter } from "next/navigation";

interface AIStats {
  questionsToday: number;
  questionsThisWeek: number;
  topQuestions: Array<{ question: string; count: number }>;
  gaps: { open: number; resolved: number };
  tokenUsage: { today: number; thisWeek: number; estimatedMonthlyCost: number };
  feedback: { positive: number; negative: number };
  avgConfidence: number;
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
  totalDocuments: number;
  documentsBySourceType: Record<string, number>;
  documentsByTier: Record<string, number>;
  lastSyncTimestamps: Record<string, string | null>;
  staleDocuments: number;
}

function formatRelativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

export default function AIDashboardClient() {
  const [stats, setStats] = useState<AIStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [ingestStatus, setIngestStatus] = useState<IngestStatus | null>(null);
  const [ingesting, setIngesting] = useState(false);
  const [ingestResult, setIngestResult] = useState<IngestResult | null>(null);
  const [kbHealth, setKBHealth] = useState<KBHealth | null>(null);
  const router = useRouter();

  const handleLogout = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      await fetch("/api/admin/logout", { method: "POST" });
      router.push("/admin");
    },
    [router]
  );

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/ai-stats");
      if (res.ok) {
        const data = (await res.json()) as AIStats;
        setStats(data);
        setLastRefresh(new Date());
      }
    } catch {
      // Non-blocking
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchIngestStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/ingest");
      if (res.ok) {
        setIngestStatus(await res.json() as IngestStatus);
      }
    } catch {
      // Non-blocking
    }
  }, []);

  const handleIngest = useCallback(async () => {
    setIngesting(true);
    setIngestResult(null);
    try {
      const res = await fetch("/api/admin/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "ingest", clearExisting: false }),
      });
      if (res.ok) {
        const result = (await res.json()) as IngestResult;
        setIngestResult(result);
        setIngestStatus((prev) =>
          prev ? { ...prev, documentCount: result.documentCount } : prev
        );
      } else {
        const errBody = await res.text().catch(() => "Unknown error");
        setIngestResult({
          videosProcessed: 0,
          documentsUploaded: 0,
          errors: [`Ingest failed (${res.status}): ${errBody.substring(0, 200)}`],
          skippedVideos: [],
          logs: [],
          documentCount: ingestStatus?.documentCount ?? 0,
        });
      }
    } catch (err) {
      setIngestResult({
        videosProcessed: 0,
        documentsUploaded: 0,
        errors: [`Network error: ${err instanceof Error ? err.message : "Request failed"}`],
        skippedVideos: [],
        logs: [],
        documentCount: ingestStatus?.documentCount ?? 0,
      });
    } finally {
      setIngesting(false);
    }
  }, [ingestStatus?.documentCount]);

  const fetchKBHealth = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/kb-health");
      if (res.ok) {
        setKBHealth(await res.json() as KBHealth);
      }
    } catch {
      // Non-blocking
    }
  }, []);

  useEffect(() => {
    fetchStats();
    fetchIngestStatus();
    fetchKBHealth();
    const interval = setInterval(fetchStats, 60000); // Auto-refresh every 60s
    return () => clearInterval(interval);
  }, [fetchStats, fetchIngestStatus, fetchKBHealth]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[var(--color-background)]">
        <p className="text-[var(--color-muted)]">Loading AI Dashboard...</p>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[var(--color-background)]">
        <p className="text-red-400">Failed to load dashboard data.</p>
      </div>
    );
  }

  const totalFeedback = stats.feedback.positive + stats.feedback.negative;
  const satisfactionRate = totalFeedback > 0
    ? Math.round((stats.feedback.positive / totalFeedback) * 100)
    : 0;

  return (
    <div className="min-h-screen bg-[var(--color-background)]" data-testid="ai-dashboard">
      {/* Shared admin header */}
      <header className="sticky top-0 z-10 border-b border-[var(--color-surface-light)] bg-[var(--color-surface)]">
        <div className="flex items-center justify-between px-4 py-3">
          <h1 className="text-lg font-bold text-[var(--color-foreground)]">Admin Panel</h1>
          <form onSubmit={handleLogout}>
            <button
              type="submit"
              className="rounded-lg border border-[var(--color-surface-light)] px-3 py-1.5 text-sm text-[var(--color-muted)] transition-colors hover:border-red-500 hover:text-red-400"
            >
              Log Out
            </button>
          </form>
        </div>
        <nav className="flex px-4 gap-1">
          <a
            href="/admin/dashboard"
            className="px-3 py-2 text-sm font-medium border-b-2 border-transparent text-[var(--color-muted)] hover:text-[var(--color-foreground)] transition-colors"
          >
            Commanders
          </a>
          <span
            className="px-3 py-2 text-sm font-medium border-b-2 border-[var(--color-accent)] text-[var(--color-accent)]"
          >
            AI Dashboard
          </span>
        </nav>
      </header>

      <div className="max-w-4xl mx-auto p-4 pb-20">
        {/* Sub-header */}
        <p className="text-xs text-[var(--color-muted)] mb-6">
          Last refreshed: {lastRefresh.toLocaleTimeString()} · auto-refresh: 60s
        </p>

        {/* Stats cards row */}
        <div className="grid grid-cols-2 gap-3 mb-6" data-testid="stats-cards">
          <div className="rounded-xl bg-[var(--color-surface)] p-4 shadow-sm" data-testid="question-count">
            <p className="text-xs text-[var(--color-muted)] mb-1">Questions Today</p>
            <p className="text-2xl font-bold text-[var(--color-foreground)]">{stats.questionsToday}</p>
            <p className="text-xs text-[var(--color-muted)]">{stats.questionsThisWeek} this week</p>
          </div>

          <div className="rounded-xl bg-[var(--color-surface)] p-4 shadow-sm" data-testid="gap-count">
            <p className="text-xs text-[var(--color-muted)] mb-1">Knowledge Gaps</p>
            <p className="text-2xl font-bold text-[var(--color-foreground)]">{stats.gaps.open}</p>
            <p className="text-xs text-green-400">{stats.gaps.resolved} resolved</p>
          </div>

          <div className="rounded-xl bg-[var(--color-surface)] p-4 shadow-sm" data-testid="cost-estimate">
            <p className="text-xs text-[var(--color-muted)] mb-1">Est. Monthly Cost</p>
            <p className="text-2xl font-bold text-[var(--color-foreground)]">
              ${stats.tokenUsage.estimatedMonthlyCost.toFixed(2)}
            </p>
            <p className="text-xs text-[var(--color-muted)]">{stats.tokenUsage.thisWeek.toLocaleString()} tokens/week</p>
          </div>

          <div className="rounded-xl bg-[var(--color-surface)] p-4 shadow-sm" data-testid="feedback-stats">
            <p className="text-xs text-[var(--color-muted)] mb-1">Satisfaction</p>
            <p className="text-2xl font-bold text-[var(--color-foreground)]">
              {satisfactionRate}%
            </p>
            <p className="text-xs text-[var(--color-muted)]">
              👍 {stats.feedback.positive} / 👎 {stats.feedback.negative}
            </p>
          </div>
        </div>

        {/* Avg Confidence */}
        <div className="rounded-xl bg-[var(--color-surface)] p-4 shadow-sm mb-6" data-testid="pipeline-health">
          <p className="text-xs text-[var(--color-muted)] mb-1">Pipeline Health</p>
          <div className="flex items-center gap-3">
            <div className={`w-3 h-3 rounded-full ${stats.avgConfidence >= 60 ? "bg-green-400" : "bg-red-400"}`} />
            <span className="text-sm text-[var(--color-foreground)]">
              Avg Confidence: {stats.avgConfidence}%
            </span>
            <span className="text-xs text-[var(--color-muted)]">
              {stats.avgConfidence >= 60 ? "Healthy" : "Needs Attention"}
            </span>
          </div>
        </div>

        {/* Top Questions Table */}
        <div className="rounded-xl bg-[var(--color-surface)] p-4 shadow-sm mb-6" data-testid="top-questions">
          <h2 className="text-sm font-semibold text-[var(--color-foreground)] mb-3">Top 10 Questions</h2>
          {stats.topQuestions.length === 0 ? (
            <p className="text-xs text-[var(--color-muted)]">No questions yet.</p>
          ) : (
            <div className="divide-y divide-[var(--color-surface-light)]">
              {stats.topQuestions.map((q, i) => (
                <div
                  key={i}
                  className={`flex items-center justify-between py-2 text-sm ${
                    i % 2 === 0 ? "" : "bg-[var(--color-surface-light)]/30"
                  }`}
                >
                  <span className="text-[var(--color-foreground)] truncate flex-1 mr-2" title={q.question}>
                    {q.question}
                  </span>
                  <span className="text-[var(--color-accent)] font-medium shrink-0">
                    {q.count}×
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Knowledge Base / YouTube Pipeline */}
        <div className="rounded-xl bg-[var(--color-surface)] p-4 shadow-sm mb-6" data-testid="knowledge-base">

          {/* Last Auto-Refresh Status */}
          <div className="mb-4" data-testid="auto-refresh-status">
            <h3 className="text-xs font-semibold text-[var(--color-muted)] mb-2">Last Auto-Refresh</h3>
            <p className="text-sm text-[var(--color-foreground)]" data-testid="refresh-timestamp">
              {ingestStatus?.refreshState
                ? formatRelativeTime(ingestStatus.refreshState.lastRefreshAt)
                : "Never"}
            </p>
            {ingestStatus?.refreshState?.staleness && ingestStatus.refreshState.staleness.length > 0 && (
              <div className="mt-2 space-y-1" data-testid="creator-staleness">
                {ingestStatus.refreshState.staleness.map((s) => (
                  <div key={s.name} className="flex items-center justify-between text-xs">
                    <span className="text-[var(--color-foreground)]">{s.name}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-[var(--color-muted)]">
                        {s.lastVideoDate || "No videos"}
                      </span>
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                          s.isStale
                            ? "bg-yellow-500/20 text-yellow-400"
                            : "bg-green-500/20 text-green-400"
                        }`}
                        data-testid={`staleness-badge-${s.name.toLowerCase().replace(/\s+/g, "-")}`}
                      >
                        {s.isStale ? "Stale" : "Active"}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <h2 className="text-sm font-semibold text-[var(--color-foreground)] mb-3">Knowledge Base</h2>

          {ingestStatus ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-[var(--color-muted)]">Search Index Documents</p>
                  <p className="text-xl font-bold text-[var(--color-foreground)]">{ingestStatus.documentCount}</p>
                </div>
                <div className={`px-2 py-1 rounded text-xs ${ingestStatus.searchConfigured ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"}`}>
                  {ingestStatus.searchConfigured ? "Connected" : "Not Configured"}
                </div>
              </div>

              <div>
                <p className="text-xs text-[var(--color-muted)] mb-1">YouTube Creators ({ingestStatus.creators.length})</p>
                <div className="flex flex-wrap gap-1">
                  {ingestStatus.creators.map((name) => (
                    <span key={name} className="px-2 py-0.5 rounded-full bg-[var(--color-surface-light)] text-xs text-[var(--color-foreground)]">
                      {name}
                    </span>
                  ))}
                </div>
              </div>

              <button
                onClick={handleIngest}
                disabled={ingesting || !ingestStatus.searchConfigured}
                className="w-full rounded-lg bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--color-accent)]/80 disabled:opacity-50 disabled:cursor-not-allowed"
                data-testid="ingest-button"
              >
                {ingesting ? "Ingesting YouTube Transcripts..." : "Refresh Knowledge Base"}
              </button>
              <p className="text-[10px] text-[var(--color-muted)] mt-1">
                Re-fetches latest YouTube videos from MSF creators, transcribes them, and uploads to the search index. May take 2-5 minutes.
              </p>

              {ingestResult && (
                <div className="rounded-lg bg-[var(--color-background)] p-3 text-xs space-y-1" data-testid="ingest-result">
                  <p className="text-green-400">
                    {ingestResult.videosProcessed} videos processed → {ingestResult.documentsUploaded} documents uploaded
                  </p>
                  {ingestResult.errors.length > 0 && (
                    <div className="text-red-400">
                      {ingestResult.errors.map((e, i) => <p key={i}>{e}</p>)}
                    </div>
                  )}
                  {ingestResult.skippedVideos.length > 0 && (
                    <p className="text-yellow-400">{ingestResult.skippedVideos.length} videos skipped (no transcript)</p>
                  )}
                </div>
              )}
            </div>
          ) : (
            <p className="text-xs text-[var(--color-muted)]">Loading knowledge base status...</p>
          )}
        </div>

        {/* KB Health Section */}
        <div className="rounded-xl bg-[var(--color-surface)] p-4 shadow-sm mb-6" data-testid="kb-health">
          <h3 className="text-sm font-semibold text-[var(--color-foreground)] mb-3">Knowledge Base Health</h3>
          {kbHealth ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg bg-[var(--color-background)] p-3">
                  <p className="text-xs text-[var(--color-muted)]">Total Documents</p>
                  <p className="text-lg font-bold text-[var(--color-foreground)]" data-testid="kb-total-docs">{kbHealth.totalDocuments}</p>
                </div>
                <div className="rounded-lg bg-[var(--color-background)] p-3">
                  <p className="text-xs text-[var(--color-muted)]">Stale Documents</p>
                  <p className={`text-lg font-bold ${kbHealth.staleDocuments > 0 ? "text-yellow-400" : "text-green-400"}`} data-testid="kb-stale-docs">{kbHealth.staleDocuments}</p>
                </div>
              </div>

              <div>
                <p className="text-xs text-[var(--color-muted)] mb-1">Documents by Source</p>
                <div className="space-y-1" data-testid="kb-by-source">
                  {Object.entries(kbHealth.documentsBySourceType).map(([type, count]) => (
                    <div key={type} className="flex justify-between text-xs">
                      <span className="text-[var(--color-foreground)]">{type}</span>
                      <span className="text-[var(--color-muted)]">{count}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-xs text-[var(--color-muted)] mb-1">Documents by Tier</p>
                <div className="space-y-1" data-testid="kb-by-tier">
                  {Object.entries(kbHealth.documentsByTier).map(([tier, count]) => (
                    <div key={tier} className="flex justify-between text-xs">
                      <span className="text-[var(--color-foreground)]">Tier {tier}</span>
                      <span className="text-[var(--color-muted)]">{count}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-xs text-[var(--color-muted)] mb-1">Last Sync</p>
                <div className="space-y-1" data-testid="kb-last-sync">
                  {Object.entries(kbHealth.lastSyncTimestamps).map(([type, ts]) => (
                    <div key={type} className="flex justify-between text-xs">
                      <span className="text-[var(--color-foreground)]">{type}</span>
                      <span className={ts ? "text-[var(--color-muted)]" : "text-red-400"}>
                        {ts ? formatRelativeTime(ts) : "Never"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <p className="text-xs text-[var(--color-muted)]">Loading KB health...</p>
          )}
        </div>
      </div>
    </div>
  );
}
