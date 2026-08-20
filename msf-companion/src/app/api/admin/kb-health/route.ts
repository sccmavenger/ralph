import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth";
import { getKnowledgeSearchConfig } from "@/lib/kb-search";
import { getSourceFreshness, KB_SOURCE_TYPES, type KBSourceType } from "@/lib/kb-contract";

interface SearchPayload {
  "@odata.count"?: number;
  "@search.facets"?: Record<string, Array<{ value: string | number; count: number }>>;
  value?: Array<Record<string, unknown>>;
}

interface SourceHealth {
  count: number;
  newestSourceDate: string | null;
  status: "healthy" | "stale" | "missing";
  ageHours: number | null;
  maxAgeHours: number;
}

async function search(body: Record<string, unknown>): Promise<SearchPayload> {
  const { endpoint, key, indexName, apiVersion } = getKnowledgeSearchConfig();
  const response = await fetch(`${endpoint}/indexes/${encodeURIComponent(indexName)}/docs/search?api-version=${apiVersion}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "api-key": key },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Search returned ${response.status}`);
  return response.json() as Promise<SearchPayload>;
}

export async function GET() {
  const authError = await requireAdminSession();
  if (authError) return authError;
  const { endpoint, key } = getKnowledgeSearchConfig();
  if (!endpoint || !key) return NextResponse.json({ error: "Azure AI Search is not configured" }, { status: 500 });

  try {
    const facets = await search({
      search: "*",
      filter: "category ne 'system'",
      top: 0,
      count: true,
      facets: ["sourceType,count:20", "sourceTier,count:10", "lifecycleStatus,count:10", "pipelineVersion,count:10"],
    });
    const totalDocuments = facets["@odata.count"] || 0;
    const facetMap = (name: string) => Object.fromEntries((facets["@search.facets"]?.[name] || []).map((item) => [String(item.value), item.count]));

    const sourceEntries: Array<[KBSourceType, SourceHealth]> = await Promise.all(KB_SOURCE_TYPES.map(async (sourceType): Promise<[KBSourceType, SourceHealth]> => {
      const newest = await search({
        search: "*",
        filter: `category ne 'system' and sourceType eq '${sourceType}' and lifecycleStatus eq 'active'`,
        orderby: "sourcePublishedAt desc",
        top: 1,
        count: true,
        select: "sourcePublishedAt",
      });
      const newestDate = typeof newest.value?.[0]?.sourcePublishedAt === "string" ? newest.value[0].sourcePublishedAt : null;
      return [sourceType, {
        count: newest["@odata.count"] || 0,
        newestSourceDate: newestDate,
        ...getSourceFreshness(sourceType as KBSourceType, newestDate),
      }];
    }));
    const sources: Record<KBSourceType, SourceHealth> = Object.fromEntries(sourceEntries) as Record<KBSourceType, SourceHealth>;

    const metadata = await search({
      search: "*",
      filter: "category ne 'system' and sourcePublishedAt ne null and ingestedAt ne null and contentHash ne null and lifecycleStatus ne null",
      top: 0,
      count: true,
    });
    const completeMetadata = metadata["@odata.count"] || 0;
    const staleSources = Object.entries(sources).filter(([, source]) => source.status !== "healthy").map(([name]) => name);
    const metadataCoverage = totalDocuments ? Math.round(completeMetadata / totalDocuments * 100) : 0;
    const warnings = [
      ...staleSources.map((source) => `${source} is stale or missing`),
      ...(metadataCoverage < 100 ? [`${totalDocuments - completeMetadata} documents are missing canonical metadata`] : []),
    ];

    return NextResponse.json({
      overallStatus: warnings.length ? "degraded" : "healthy",
      totalDocuments,
      documentsBySourceType: facetMap("sourceType"),
      documentsByTier: facetMap("sourceTier"),
      documentsByLifecycle: facetMap("lifecycleStatus"),
      documentsByPipelineVersion: facetMap("pipelineVersion"),
      metadataCoverage,
      sources,
      staleDocuments: Object.values(sources).filter((source) => source.status === "stale").reduce((total, source) => total + source.count, 0),
      warnings,
    });
  } catch (error) {
    return NextResponse.json({ error: `Search index unreachable: ${error instanceof Error ? error.message : String(error)}` }, { status: 500 });
  }
}
