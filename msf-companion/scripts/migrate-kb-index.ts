import { config } from "dotenv";
import { resolve } from "node:path";

config({ path: resolve(__dirname, "../.env") });

const API_VERSION = "2024-07-01";

async function main() {
  const endpoint = (process.env.AZURE_AI_SEARCH_ENDPOINT || "").replace(/\/$/, "");
  const key = process.env.AZURE_AI_SEARCH_KEY || "";
  const indexName = process.env.AZURE_AI_SEARCH_INDEX_NAME || "msf-knowledge";
  if (!endpoint || !key) throw new Error("AZURE_AI_SEARCH_ENDPOINT and AZURE_AI_SEARCH_KEY are required");
  const headers = { "Content-Type": "application/json", "api-key": key };
  const indexUrl = `${endpoint}/indexes/${encodeURIComponent(indexName)}?api-version=${API_VERSION}`;
  const response = await fetch(indexUrl, { headers });
  if (!response.ok) throw new Error(`Unable to read index: ${response.status} ${await response.text()}`);
  const index = await response.json() as Record<string, unknown> & { fields?: Array<Record<string, unknown>>; vectorSearch?: Record<string, unknown> };
  delete index["@odata.etag"];

  const fields = index.fields || [];
  const existing = new Set(fields.map((field) => String(field.name)));
  const additions: Array<Record<string, unknown>> = [
    { name: "sourceId", type: "Edm.String", searchable: false, filterable: true, retrievable: true, sortable: false, facetable: false, key: false, analyzer: null, synonymMaps: [] },
    { name: "sourcePublishedAt", type: "Edm.DateTimeOffset", searchable: false, filterable: true, retrievable: true, sortable: true, facetable: false, key: false, analyzer: null, synonymMaps: [] },
    { name: "ingestedAt", type: "Edm.DateTimeOffset", searchable: false, filterable: true, retrievable: true, sortable: true, facetable: false, key: false, analyzer: null, synonymMaps: [] },
    { name: "contentHash", type: "Edm.String", searchable: false, filterable: true, retrievable: true, sortable: false, facetable: false, key: false, analyzer: null, synonymMaps: [] },
    { name: "pipelineVersion", type: "Edm.String", searchable: false, filterable: true, retrievable: true, sortable: false, facetable: true, key: false, analyzer: null, synonymMaps: [] },
    { name: "lifecycleStatus", type: "Edm.String", searchable: false, filterable: true, retrievable: true, sortable: false, facetable: true, key: false, analyzer: null, synonymMaps: [] },
    { name: "validUntil", type: "Edm.DateTimeOffset", searchable: false, filterable: true, retrievable: true, sortable: true, facetable: false, key: false, analyzer: null, synonymMaps: [] },
    { name: "contentVector", type: "Collection(Edm.Single)", searchable: true, filterable: false, retrievable: false, sortable: false, facetable: false, key: false, dimensions: 1536, vectorSearchProfile: "kb-vector-profile", synonymMaps: [] },
  ];
  index.fields = [...fields, ...additions.filter((field) => !existing.has(String(field.name)))];

  const vectorSearch = index.vectorSearch || {};
  const algorithms = Array.isArray(vectorSearch.algorithms) ? vectorSearch.algorithms as Array<Record<string, unknown>> : [];
  const profiles = Array.isArray(vectorSearch.profiles) ? vectorSearch.profiles as Array<Record<string, unknown>> : [];
  index.vectorSearch = {
    ...vectorSearch,
    algorithms: algorithms.some((algorithm) => algorithm.name === "kb-hnsw")
      ? algorithms
      : [...algorithms, { name: "kb-hnsw", kind: "hnsw", hnswParameters: { metric: "cosine", m: 4, efConstruction: 400, efSearch: 500 } }],
    profiles: profiles.some((profile) => profile.name === "kb-vector-profile")
      ? profiles
      : [...profiles, { name: "kb-vector-profile", algorithm: "kb-hnsw" }],
  };

  const update = await fetch(indexUrl, { method: "PUT", headers, body: JSON.stringify(index) });
  if (!update.ok) throw new Error(`Unable to update index: ${update.status} ${await update.text()}`);
  console.log(`Index schema ready (${additions.filter((field) => !existing.has(String(field.name))).length} fields added).`);

  const { createKnowledgeDocument, inferLegacySourceType } = await import("../src/lib/kb-contract");
  const { uploadKnowledgeDocuments } = await import("../src/lib/kb-search");
  let offset = 0;
  let normalized = 0;
  while (true) {
    const search = await fetch(`${endpoint}/indexes/${encodeURIComponent(indexName)}/docs/search?api-version=${API_VERSION}`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        search: "*",
        top: 1000,
        skip: offset,
        select: "id,content,category,sourceCreatorName,sourceVideoTitle,sourceUrl,sourceDate,sourceTier,sourceType,sourcePublishedAt,lifecycleStatus",
        orderby: "id",
      }),
    });
    if (!search.ok) throw new Error(`Unable to read documents: ${search.status} ${await search.text()}`);
    const payload = await search.json() as { value?: Array<Record<string, unknown>> };
    const rows = payload.value || [];
    if (!rows.length) break;
    const documents = rows.flatMap((row) => {
      const content = String(row.content || "");
      if (content.length < 20 || String(row.category || "") === "system") return [];
      try {
        return [createKnowledgeDocument({
          id: String(row.id || ""),
          content,
          category: String(row.category || "general"),
          sourceCreatorName: String(row.sourceCreatorName || "Unknown source"),
          sourceTitle: String(row.sourceVideoTitle || "Knowledge document"),
          sourceUrl: String(row.sourceUrl || ""),
          sourcePublishedAt: String(row.sourcePublishedAt || row.sourceDate || new Date().toISOString()),
          sourceType: inferLegacySourceType(row),
          sourceId: String(row.id || ""),
          lifecycleStatus: row.lifecycleStatus === "expired" || row.lifecycleStatus === "superseded" ? row.lifecycleStatus : "active",
        })];
      } catch (error) {
        console.warn(`Skipping ${String(row.id)}: ${error instanceof Error ? error.message : String(error)}`);
        return [];
      }
    });
    const result = await uploadKnowledgeDocuments(documents);
    if (result.failed) throw new Error(`Metadata backfill failed for ${result.failed} documents: ${result.errors.join("; ")}`);
    normalized += result.succeeded;
    offset += rows.length;
    if (rows.length < 1000) break;
  }
  console.log(`Canonical metadata backfilled on ${normalized} documents.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
