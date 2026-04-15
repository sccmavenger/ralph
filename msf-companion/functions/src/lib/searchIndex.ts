/**
 * Azure AI Search index configuration and management for MSF knowledge base.
 */

export interface SearchIndexField {
  name: string;
  type: string;
  searchable?: boolean;
  filterable?: boolean;
  sortable?: boolean;
  facetable?: boolean;
  key?: boolean;
  dimensions?: number;
  vectorSearchProfile?: string;
}

export const INDEX_NAME = "msf-knowledge";

/**
 * Schema definition for the msf-knowledge search index.
 */
export const INDEX_SCHEMA: { fields: SearchIndexField[] } = {
  fields: [
    { name: "id", type: "Edm.String", key: true, filterable: true },
    { name: "category", type: "Edm.String", searchable: true, filterable: true, facetable: true },
    { name: "content", type: "Edm.String", searchable: true },
    { name: "sourceCreatorName", type: "Edm.String", searchable: true, filterable: true, facetable: true },
    { name: "sourceVideoTitle", type: "Edm.String", searchable: true },
    { name: "sourceUrl", type: "Edm.String", filterable: true },
    { name: "sourceDate", type: "Edm.DateTimeOffset", filterable: true, sortable: true },
    { name: "extractedAt", type: "Edm.DateTimeOffset", filterable: true, sortable: true },
    {
      name: "contentVector",
      type: "Collection(Edm.Single)",
      searchable: true,
      dimensions: 1536,
      vectorSearchProfile: "msf-vector-profile",
    },
  ],
};

/**
 * Vector search configuration for the index.
 */
export const VECTOR_SEARCH_CONFIG = {
  algorithms: [
    {
      name: "msf-hnsw",
      kind: "hnsw",
      parameters: {
        metric: "cosine",
        m: 4,
        efConstruction: 400,
        efSearch: 500,
      },
    },
  ],
  profiles: [
    {
      name: "msf-vector-profile",
      algorithmConfigurationName: "msf-hnsw",
    },
  ],
};

/**
 * Full index definition for creating/updating the index.
 */
export function getIndexDefinition() {
  return {
    name: INDEX_NAME,
    fields: INDEX_SCHEMA.fields,
    vectorSearch: VECTOR_SEARCH_CONFIG,
  };
}

/**
 * Cosmos DB data source configuration for the indexer.
 */
export function getDataSourceDefinition(cosmosConnectionString: string) {
  return {
    name: "cosmos-msf-knowledge",
    type: "cosmosdb",
    credentials: { connectionString: cosmosConnectionString },
    container: { name: "knowledge" },
    dataChangeDetectionPolicy: {
      "@odata.type": "#Microsoft.Azure.Search.HighWaterMarkChangeDetectionPolicy",
      highWaterMarkColumnName: "_ts",
    },
  };
}

/**
 * Indexer configuration that syncs Cosmos DB to the search index.
 */
export function getIndexerDefinition() {
  return {
    name: "cosmos-msf-knowledge-indexer",
    dataSourceName: "cosmos-msf-knowledge",
    targetIndexName: INDEX_NAME,
    schedule: { interval: "PT1H" },
    fieldMappings: [
      { sourceFieldName: "id", targetFieldName: "id" },
      { sourceFieldName: "category", targetFieldName: "category" },
      { sourceFieldName: "sourceCreatorName", targetFieldName: "sourceCreatorName" },
      { sourceFieldName: "sourceVideoTitle", targetFieldName: "sourceVideoTitle" },
      { sourceFieldName: "sourceUrl", targetFieldName: "sourceUrl" },
      { sourceFieldName: "sourceDate", targetFieldName: "sourceDate" },
      { sourceFieldName: "extractedAt", targetFieldName: "extractedAt" },
    ],
  };
}
