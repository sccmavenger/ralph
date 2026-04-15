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
export declare const INDEX_NAME = "msf-knowledge";
/**
 * Schema definition for the msf-knowledge search index.
 */
export declare const INDEX_SCHEMA: {
    fields: SearchIndexField[];
};
/**
 * Vector search configuration for the index.
 */
export declare const VECTOR_SEARCH_CONFIG: {
    algorithms: {
        name: string;
        kind: string;
        parameters: {
            metric: string;
            m: number;
            efConstruction: number;
            efSearch: number;
        };
    }[];
    profiles: {
        name: string;
        algorithmConfigurationName: string;
    }[];
};
/**
 * Full index definition for creating/updating the index.
 */
export declare function getIndexDefinition(): {
    name: string;
    fields: SearchIndexField[];
    vectorSearch: {
        algorithms: {
            name: string;
            kind: string;
            parameters: {
                metric: string;
                m: number;
                efConstruction: number;
                efSearch: number;
            };
        }[];
        profiles: {
            name: string;
            algorithmConfigurationName: string;
        }[];
    };
};
/**
 * Cosmos DB data source configuration for the indexer.
 */
export declare function getDataSourceDefinition(cosmosConnectionString: string): {
    name: string;
    type: string;
    credentials: {
        connectionString: string;
    };
    container: {
        name: string;
    };
    dataChangeDetectionPolicy: {
        "@odata.type": string;
        highWaterMarkColumnName: string;
    };
};
/**
 * Indexer configuration that syncs Cosmos DB to the search index.
 */
export declare function getIndexerDefinition(): {
    name: string;
    dataSourceName: string;
    targetIndexName: string;
    schedule: {
        interval: string;
    };
    fieldMappings: {
        sourceFieldName: string;
        targetFieldName: string;
    }[];
};
//# sourceMappingURL=searchIndex.d.ts.map