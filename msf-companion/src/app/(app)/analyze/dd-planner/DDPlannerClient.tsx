"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import DDNodeIntelligence from "@/app/components/DDNodeIntelligence";
import DDRecommendation from "@/app/components/DDRecommendation";

interface DDListItem {
  id: string;
  name: string;
  nodeCount: number;
  ddCompletion: unknown;
}

interface DDNodeItem {
  roomId: string;
  name: string;
  isBoss: boolean;
  sectionName: string;
}

interface DDDetail {
  id: string;
  name: string;
  startingRoomId?: string;
  nodes: DDNodeItem[];
}

export default function DDPlannerPage() {
  const router = useRouter();
  const [ddList, setDDList] = useState<DDListItem[]>([]);
  const [ddListLoading, setDDListLoading] = useState(true);
  const [ddListError, setDDListError] = useState<string | null>(null);

  const [selectedDD, setSelectedDD] = useState<string | null>(null);
  const [ddDetail, setDDDetail] = useState<DDDetail | null>(null);
  const [ddDetailLoading, setDDDetailLoading] = useState(false);

  const [selectedNode, setSelectedNode] = useState<string | null>(null);

  /** Convert raw API IDs (e.g. DD_ID_INSANITY_EVENT) to readable names as a last resort */
  function formatDisplayName(raw: string | undefined, fallbackId: string): string {
    if (!raw) return fallbackId;
    // If the name is already human-readable (contains spaces or lowercase), return as-is
    if (/[a-z ]/.test(raw)) return raw;
    // Strip common prefixes and convert underscored IDs to title case
    return raw
      .replace(/^DD_ID_/i, "")
      .replace(/^ROOM_/i, "")
      .replace(/_/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase())
      .replace(/\s+Event$/i, "");
  }

  /** Build a clean display label for a node */
  function nodeLabel(node: DDNodeItem, idx: number): string {
    const isEntrance = ddDetail?.startingRoomId === node.roomId;
    const boss = node.isBoss ? " ★ BOSS" : "";
    const section = node.sectionName ? ` · ${formatDisplayName(node.sectionName, "")}` : "";

    // If the node name is missing or is just a short room ID like "E1", "A1", use a better label
    const rawName = node.name ?? "";
    const isBareName = !rawName || /^[A-Z]\d+$/.test(rawName);

    if (isEntrance && isBareName) {
      return `#${idx + 1}${boss} — Entrance${section}`;
    }
    if (isBareName) {
      return `#${idx + 1}${boss} — Node ${node.roomId}${section}`;
    }
    return `#${idx + 1}${boss} — ${formatDisplayName(rawName, node.roomId)}${section}`;
  }

  // Fetch DD list
  const fetchDDList = useCallback(async () => {
    setDDListLoading(true);
    setDDListError(null);
    try {
      const res = await fetch("/api/msf/planner/dd");
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      const data: DDListItem[] = await res.json();
      setDDList(data);
    } catch (err) {
      setDDListError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setDDListLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDDList();
  }, [fetchDDList]);

  // Fetch DD detail when selection changes
  useEffect(() => {
    if (!selectedDD) {
      setDDDetail(null);
      return;
    }
    let cancelled = false;
    setDDDetailLoading(true);
    setSelectedNode(null); // Clear node selection on DD change

    fetch(`/api/msf/planner/dd/${encodeURIComponent(selectedDD)}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data: DDDetail) => {
        if (!cancelled) setDDDetail(data);
      })
      .catch(() => {
        if (!cancelled) setDDDetail(null);
      })
      .finally(() => {
        if (!cancelled) setDDDetailLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedDD]);

  return (
    <div className="px-4 py-4">
      {/* Back link */}
      <button
        onClick={() => router.push("/analyze")}
        className="mb-3 text-xs text-[var(--color-accent)] hover:underline"
      >
        ← Back to Analyze
      </button>

      <h2 className="text-xl font-bold text-[var(--color-foreground)]">
        DD Planner
      </h2>
      <p className="mb-4 text-xs text-[var(--color-muted)]">
        Select a Dark Dimension and node to get team recommendations.
      </p>

      {/* DD Selector */}
      <label className="mb-2 block text-sm font-semibold text-[var(--color-foreground)]">
        Dark Dimension
      </label>

      {ddListLoading && (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="h-12 animate-pulse rounded-lg bg-[var(--color-surface)]"
            />
          ))}
        </div>
      )}

      {ddListError && (
        <div className="rounded-lg bg-red-900/30 p-4 text-center">
          <p className="text-sm text-red-400">{ddListError}</p>
          <button
            onClick={fetchDDList}
            className="mt-2 rounded-lg bg-[var(--color-accent)] px-4 py-2 text-xs font-semibold text-white"
          >
            Retry
          </button>
        </div>
      )}

      {!ddListLoading && !ddListError && ddList.length === 0 && (
        <p className="text-sm text-[var(--color-muted)]">
          No Dark Dimensions available
        </p>
      )}

      {!ddListLoading && !ddListError && ddList.length > 0 && (
        <select
          data-testid="dd-selector"
          value={selectedDD ?? ""}
          onChange={(e) => setSelectedDD(e.target.value || null)}
          className="mb-4 w-full rounded-lg border border-[var(--color-surface-light)] bg-[var(--color-surface)] px-3 py-3 text-sm text-[var(--color-foreground)]"
        >
          <option value="">Select a Dark Dimension...</option>
          {ddList.map((dd) => (
            <option key={dd.id} value={dd.id}>
              {formatDisplayName(dd.name, dd.id)} ({dd.nodeCount} nodes)
            </option>
          ))}
        </select>
      )}

      {/* Node Selector */}
      {selectedDD && (
        <>
          <label className="mb-2 block text-sm font-semibold text-[var(--color-foreground)]">
            Node
          </label>

          {ddDetailLoading && (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  className="h-10 animate-pulse rounded-lg bg-[var(--color-surface)]"
                />
              ))}
            </div>
          )}

          {!ddDetailLoading && ddDetail && (
            <>
              <p className="mb-2 text-xs text-[var(--color-muted)]">
                {ddDetail.nodes.length} nodes
              </p>
              <select
                data-testid="node-selector"
                value={selectedNode ?? ""}
                onChange={(e) => setSelectedNode(e.target.value || null)}
                className="mb-4 w-full rounded-lg border border-[var(--color-surface-light)] bg-[var(--color-surface)] px-3 py-3 text-sm text-[var(--color-foreground)]"
              >
                <option value="">Select a node...</option>
                {ddDetail.nodes.map((node, idx) => (
                  <option key={node.roomId} value={node.roomId}>
                    {nodeLabel(node, idx)}
                  </option>
                ))}
              </select>
            </>
          )}
        </>
      )}

      {/* Selected node indicator */}
      {selectedNode && ddDetail && (() => {
        const nodeIdx = ddDetail.nodes.findIndex((n) => n.roomId === selectedNode);
        const node = ddDetail.nodes[nodeIdx];
        return node ? (
          <div className="mb-2 rounded-lg bg-[var(--color-surface)] p-3">
            <p className="text-xs text-[var(--color-muted)]">Selected node:</p>
            <p className="text-sm font-semibold text-[var(--color-foreground)]">
              {nodeLabel(node, nodeIdx)}
            </p>
          </div>
        ) : null;
      })()}

      {/* Recommendation — shown first so users don't have to scroll past waves */}
      {selectedDD && selectedNode && (
        <DDRecommendation ddId={selectedDD} roomId={selectedNode} />
      )}

      {/* Node Enemy Intelligence — collapsible waves below */}
      {selectedDD && selectedNode && (
        <DDNodeIntelligence ddId={selectedDD} roomId={selectedNode} />
      )}
    </div>
  );
}
