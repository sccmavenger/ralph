"use strict";
/**
 * Azure AI Search index configuration and management for MSF knowledge base.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.VECTOR_SEARCH_CONFIG = exports.INDEX_SCHEMA = exports.INDEX_NAME = void 0;
exports.getIndexDefinition = getIndexDefinition;
exports.getDataSourceDefinition = getDataSourceDefinition;
exports.getIndexerDefinition = getIndexerDefinition;
exports.INDEX_NAME = "msf-knowledge";
/**
 * Schema definition for the msf-knowledge search index.
 */
exports.INDEX_SCHEMA = {
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
exports.VECTOR_SEARCH_CONFIG = {
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
function getIndexDefinition() {
    return {
        name: exports.INDEX_NAME,
        fields: exports.INDEX_SCHEMA.fields,
        vectorSearch: exports.VECTOR_SEARCH_CONFIG,
    };
}
/**
 * Cosmos DB data source configuration for the indexer.
 */
function getDataSourceDefinition(cosmosConnectionString) {
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
function getIndexerDefinition() {
    return {
        name: "cosmos-msf-knowledge-indexer",
        dataSourceName: "cosmos-msf-knowledge",
        targetIndexName: exports.INDEX_NAME,
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
//# sourceMappingURL=searchIndex.js.map