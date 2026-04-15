/**
 * Azure AI Search client utilities for querying and managing the MSF knowledge index.
 */
export interface SearchResult {
    id: string;
    category: string;
    content: string;
    sourceCreatorName: string;
    sourceVideoTitle: string;
    sourceUrl: string;
    sourceDate: string;
    score: number;
}
export interface SearchDeps {
    searchEndpoint: string;
    searchKey: string;
    openAiEndpoint: string;
    openAiKey: string;
    embeddingDeployment: string;
}
/**
 * Generate an embedding vector for a text query using Azure OpenAI.
 */
export declare function generateEmbedding(text: string, deps: SearchDeps): Promise<number[]>;
/**
 * Perform a keyword search against the MSF knowledge index.
 */
export declare function keywordSearch(query: string, deps: SearchDeps, top?: number): Promise<SearchResult[]>;
/**
 * Perform a semantic/vector search against the MSF knowledge index.
 */
export declare function vectorSearch(query: string, deps: SearchDeps, top?: number): Promise<SearchResult[]>;
/**
 * Perform a hybrid search (keyword + vector) for best results.
 */
export declare function hybridSearch(query: string, deps: SearchDeps, top?: number): Promise<SearchResult[]>;
//# sourceMappingURL=searchClient.d.ts.map