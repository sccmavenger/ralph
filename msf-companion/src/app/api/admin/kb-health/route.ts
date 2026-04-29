import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth";

const SEARCH_ENDPOINT = process.env.AZURE_AI_SEARCH_ENDPOINT || "";
const SEARCH_KEY = process.env.AZURE_AI_SEARCH_KEY || "";

interface KBHealthResponse {
  totalDocuments: number;
  documentsBySourceType: Record<string, number>;
  documentsByTier: Record<string, number>;
  lastSyncTimestamps: Record<string, string | null>;
  staleDocuments: number;
}

export async function GET() {
  const authError = await requireAdminSession();
  if (authError) return authError;

  if (!SEARCH_ENDPOINT || !SEARCH_KEY) {
    return NextResponse.json({ error: "Azure AI Search not configured" }, { status: 500 });
  }

  try {
    // Facet query for sourceType and sourceTier counts
    const facetResponse = await fetch(
      `${SEARCH_ENDPOINT}/indexes/msf-knowledge/docs/search?api-version=2024-07-01`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "api-key": SEARCH_KEY },
        body: JSON.stringify({
          search: "*",
          top: 0,
          count: true,
          facets: ["sourceType,count:20", "sourceTier,count:10"],
        }),
      }
    );

    if (!facetResponse.ok) {
      return NextResponse.json({ error: "Failed to query search index" }, { status: 500 });
    }

    const facetData = (await facetResponse.json()) as {
      "@odata.count"?: number;
      "@search.facets"?: {
        sourceType?: Array<{ value: string; count: number }>;
        sourceTier?: Array<{ value: number; count: number }>;
      };
    };

    const totalDocuments = facetData["@odata.count"] || 0;

    const documentsBySourceType: Record<string, number> = {};
    for (const f of facetData["@search.facets"]?.sourceType || []) {
      documentsBySourceType[f.value] = f.count;
    }

    const documentsByTier: Record<string, number> = {};
    for (const f of facetData["@search.facets"]?.sourceTier || []) {
      documentsByTier[String(f.value)] = f.count;
    }

    // Get last sync timestamps per source type
    const sourceTypes = ["api-game-data", "official-blog", "youtube-transcript", "reddit-post", "ai-generated"];
    const lastSyncTimestamps: Record<string, string | null> = {};

    for (const st of sourceTypes) {
      try {
        const tsResponse = await fetch(
          `${SEARCH_ENDPOINT}/indexes/msf-knowledge/docs/search?api-version=2024-07-01`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json", "api-key": SEARCH_KEY },
            body: JSON.stringify({
              filter: `sourceType eq '${st}'`,
              orderby: "sourceDate desc",
              top: 1,
              select: "sourceDate",
            }),
          }
        );

        if (tsResponse.ok) {
          const tsData = (await tsResponse.json()) as { value?: Array<{ sourceDate?: string }> };
          lastSyncTimestamps[st] = tsData.value?.[0]?.sourceDate || null;
        } else {
          lastSyncTimestamps[st] = null;
        }
      } catch {
        lastSyncTimestamps[st] = null;
      }
    }

    // Count stale documents using the same rules as kbStaleSweep
    let staleDocuments = 0;
    const stalenessRules = [
      { sourceType: "reddit-post", maxAgeDays: 30 },
      { sourceType: "official-blog", maxAgeDays: 90 },
      { sourceType: "ai-generated", maxAgeDays: 14 },
    ];

    for (const rule of stalenessRules) {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - rule.maxAgeDays);
      try {
        const staleResponse = await fetch(
          `${SEARCH_ENDPOINT}/indexes/msf-knowledge/docs/search?api-version=2024-07-01`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json", "api-key": SEARCH_KEY },
            body: JSON.stringify({
              filter: `sourceType eq '${rule.sourceType}' and sourceDate lt ${cutoff.toISOString()}`,
              top: 0,
              count: true,
            }),
          }
        );

        if (staleResponse.ok) {
          const staleData = (await staleResponse.json()) as { "@odata.count"?: number };
          staleDocuments += staleData["@odata.count"] || 0;
        }
      } catch {
        // Skip — non-blocking
      }
    }

    const health: KBHealthResponse = {
      totalDocuments,
      documentsBySourceType,
      documentsByTier,
      lastSyncTimestamps,
      staleDocuments,
    };

    return NextResponse.json(health);
  } catch (err) {
    return NextResponse.json(
      { error: `Search index unreachable: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    );
  }
}
