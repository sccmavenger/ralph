import {
  inferLegacySourceType,
  type KnowledgeDocument,
  type KBSourceType,
} from "@/lib/kb-contract";

const SEARCH_API_VERSION = "2024-07-01";
const OPENAI_API_VERSION = "2024-10-21";
const DEFAULT_INDEX_NAME = "msf-knowledge";
const REQUEST_TIMEOUT_MS = 15_000;

export interface KnowledgeSearchResult {
  id: string;
  content: string;
  sourceCreatorName: string;
  sourceVideoTitle: string;
  sourceUrl: string;
  sourceDate: string;
  sourcePublishedAt: string;
  sourceTier: number;
  sourceType: KBSourceType;
  searchScore: number;
}

function getSearchConfig() {
  return {
    endpoint: (process.env.AZURE_AI_SEARCH_ENDPOINT || "").replace(/\/$/, ""),
    key: process.env.AZURE_AI_SEARCH_KEY || "",
    indexName: process.env.AZURE_AI_SEARCH_INDEX_NAME || DEFAULT_INDEX_NAME,
  };
}

function retryDelay(response: Response | null, attempt: number): number {
  const header = response?.headers.get("retry-after");
  const seconds = header ? Number(header) : Number.NaN;
  return Number.isFinite(seconds) ? seconds * 1_000 : Math.min(4_000, 400 * 2 ** attempt);
}

async function fetchWithRetry(url: string, init: RequestInit, attempts = 3): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    let response: Response | null = null;
    try {
      response = await fetch(url, {
        ...init,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (response.ok || ![408, 429, 500, 502, 503, 504].includes(response.status)) {
        return response;
      }
      lastError = new Error(`Request failed with status ${response.status}`);
    } catch (error) {
      lastError = error;
    }

    if (attempt < attempts - 1) {
      await new Promise((resolve) => setTimeout(resolve, retryDelay(response, attempt)));
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Request failed after retries");
}

async function createEmbedding(text: string): Promise<number[] | null> {
  const endpoint = (process.env.AZURE_OPENAI_ENDPOINT || "").replace(/\/$/, "");
  const key = process.env.AZURE_OPENAI_KEY || "";
  const deployment = process.env.AZURE_OPENAI_EMBEDDING_DEPLOYMENT || "";
  if (!endpoint || !key || !deployment) return null;

  const response = await fetchWithRetry(
    `${endpoint}/openai/deployments/${encodeURIComponent(deployment)}/embeddings?api-version=${OPENAI_API_VERSION}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "api-key": key },
      body: JSON.stringify({ input: text }),
    }
  );
  if (!response.ok) return null;
  const payload = (await response.json()) as { data?: Array<{ embedding?: number[] }> };
  return payload.data?.[0]?.embedding || null;
}

export function mapSearchDocument(doc: Record<string, unknown>): KnowledgeSearchResult | null {
  const content = typeof doc.content === "string" ? doc.content.trim() : "";
  if (!content) return null;
  const sourceType = inferLegacySourceType(doc);
  const sourceDate = typeof doc.sourcePublishedAt === "string"
    ? doc.sourcePublishedAt
    : typeof doc.sourceDate === "string" ? doc.sourceDate : "";

  return {
    id: typeof doc.id === "string" ? doc.id : "",
    content,
    sourceCreatorName: typeof doc.sourceCreatorName === "string" ? doc.sourceCreatorName : "",
    sourceVideoTitle: typeof doc.sourceVideoTitle === "string" ? doc.sourceVideoTitle : "",
    sourceUrl: typeof doc.sourceUrl === "string" ? doc.sourceUrl : "",
    sourceDate,
    sourcePublishedAt: sourceDate,
    sourceTier: Number(doc.sourceTier) || (sourceType === "api-game-data" ? 1 : sourceType === "official-blog" ? 2 : 3),
    sourceType,
    searchScore: Number(doc["@search.rerankerScore"] || doc["@search.score"]) || 0,
  };
}

async function executeSearch(query: string, canonical: boolean): Promise<Response> {
  const { endpoint, key, indexName } = getSearchConfig();
  if (!endpoint || !key) throw new Error("Azure AI Search is not configured");

  const embedding = canonical ? await createEmbedding(query).catch(() => null) : null;
  const body: Record<string, unknown> = {
    search: query,
    top: 10,
    select: canonical
      ? "id,content,sourceCreatorName,sourceVideoTitle,sourceUrl,sourceDate,sourcePublishedAt,sourceTier,sourceType"
      : "id,content,sourceCreatorName,sourceVideoTitle,sourceUrl,sourceDate,sourceTier,sourceType",
  };
  if (canonical) body.filter = "category ne 'system' and lifecycleStatus eq 'active'";
  if (embedding) {
    body.vectorQueries = [{ kind: "vector", vector: embedding, fields: "contentVector", k: 10 }];
  }

  return fetchWithRetry(
    `${endpoint}/indexes/${encodeURIComponent(indexName)}/docs/search?api-version=${SEARCH_API_VERSION}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "api-key": key },
      body: JSON.stringify(body),
    }
  );
}

/** Hybrid search when embeddings are configured, keyword search otherwise. */
export async function searchKnowledgeDocuments(query: string): Promise<KnowledgeSearchResult[]> {
  let response = await executeSearch(query, true);
  // A legacy index may not have the canonical metadata/vector fields yet. Keep
  // Advisor available during migration by retrying against the old schema.
  if (!response.ok) response = await executeSearch(query, false);
  if (!response.ok) return [];

  const payload = (await response.json()) as { value?: Array<Record<string, unknown>> };
  return (payload.value || [])
    .map(mapSearchDocument)
    .filter((doc): doc is KnowledgeSearchResult => Boolean(doc))
    .sort((a, b) => b.searchScore - a.searchScore || a.sourceTier - b.sourceTier);
}

export async function uploadKnowledgeDocuments(
  documents: KnowledgeDocument[]
): Promise<{ succeeded: number; failed: number; errors: string[] }> {
  if (documents.length === 0) return { succeeded: 0, failed: 0, errors: [] };
  const { endpoint, key, indexName } = getSearchConfig();
  if (!endpoint || !key) throw new Error("Azure AI Search is not configured");

  let succeeded = 0;
  let failed = 0;
  const errors: string[] = [];
  for (let index = 0; index < documents.length; index += 100) {
    const batch = documents.slice(index, index + 100);
    const enriched = await Promise.all(batch.map(async (doc) => {
      const vector = await createEmbedding(doc.content).catch(() => null);
      return { "@search.action": "mergeOrUpload", ...doc, ...(vector ? { contentVector: vector } : {}) };
    }));
    const response = await fetchWithRetry(
      `${endpoint}/indexes/${encodeURIComponent(indexName)}/docs/index?api-version=${SEARCH_API_VERSION}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "api-key": key },
        body: JSON.stringify({ value: enriched }),
      }
    );
    if (!response.ok) {
      failed += batch.length;
      errors.push(`Search upload failed with status ${response.status}`);
      continue;
    }
    const payload = (await response.json()) as {
      value?: Array<{ key?: string; status?: boolean; errorMessage?: string }>;
    };
    for (const item of payload.value || []) {
      if (item.status) succeeded++;
      else {
        failed++;
        errors.push(`${item.key || "document"}: ${item.errorMessage || "upload failed"}`);
      }
    }
  }
  return { succeeded, failed, errors };
}

export function getKnowledgeSearchConfig() {
  return { ...getSearchConfig(), apiVersion: SEARCH_API_VERSION };
}
