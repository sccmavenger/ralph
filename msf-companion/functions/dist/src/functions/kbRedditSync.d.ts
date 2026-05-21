/**
 * Timer-triggered Azure Function: Reddit KB Sync
 * Fetches top Reddit posts daily and indexes relevant ones as KB documents.
 */
import { InvocationContext } from "@azure/functions";
import { RedditPost } from "../lib/redditFetcher.js";
import type { KBDocument } from "../lib/kbGameData.js";
export interface RedditSyncDeps {
    fetchTopPosts: () => Promise<RedditPost[]>;
    getIndexedPostIds: () => Promise<Set<string>>;
    uploadDocuments: (docs: KBDocument[]) => Promise<{
        succeeded: number;
        failed: number;
    }>;
    deleteStaleDocuments: (docIds: string[]) => Promise<number>;
}
export declare function syncReddit(deps: RedditSyncDeps, context: InvocationContext): Promise<{
    fetched: number;
    filtered: number;
    indexed: number;
    staleRemoved: number;
}>;
//# sourceMappingURL=kbRedditSync.d.ts.map