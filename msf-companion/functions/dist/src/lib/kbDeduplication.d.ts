/**
 * KB Deduplication utility — generates deterministic document IDs
 * and provides deduplication filtering for sync pipelines.
 */
import type { KBDocument } from "./kbGameData.js";
/**
 * Generate a deterministic document ID from source type and identifiers.
 */
export declare function generateDocId(sourceType: string, ...identifiers: string[]): string;
/**
 * Check which document IDs already exist in the search index.
 */
export declare function checkExistingDocs(docIds: string[]): Promise<Set<string>>;
/**
 * Filter out documents that already exist in the index.
 */
export declare function filterNewDocs(docs: KBDocument[], existingIds: Set<string>): KBDocument[];
//# sourceMappingURL=kbDeduplication.d.ts.map