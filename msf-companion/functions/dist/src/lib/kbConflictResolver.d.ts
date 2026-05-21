/**
 * KB Conflict Resolver — removes Tier 4 (AI auto-generated) documents
 * when authoritative higher-tier data becomes available for the same topic.
 */
import type { KBDocument } from "./kbGameData.js";
export interface ConflictResolverDeps {
    searchDocuments: (filter: string, select: string) => Promise<Array<{
        id: string;
        category: string;
        content: string;
        sourceTier: number;
    }>>;
    deleteDocuments: (docIds: string[]) => Promise<void>;
}
/**
 * Find Tier 4 (AI auto-generated) documents that overlap with a new higher-tier document.
 */
export declare function findConflictingTier4Docs(newDoc: KBDocument, deps: ConflictResolverDeps): Promise<string[]>;
/**
 * Remove documents from the Azure AI Search index by ID.
 */
export declare function removeDocuments(docIds: string[], deps?: ConflictResolverDeps): Promise<void>;
//# sourceMappingURL=kbConflictResolver.d.ts.map