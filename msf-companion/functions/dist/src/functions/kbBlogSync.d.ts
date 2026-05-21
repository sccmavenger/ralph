/**
 * Timer-triggered Azure Function: Blog KB Sync
 * Checks for new Scopely blog posts daily and indexes them as KB documents.
 */
import { InvocationContext } from "@azure/functions";
import type { KBDocument } from "../lib/kbGameData.js";
export interface BlogSyncDeps {
    fetchBlogList: () => Promise<Array<{
        url: string;
        title: string;
        date: string;
    }>>;
    fetchBlogContent: (url: string) => Promise<string | null>;
    getIndexedBlogIds: () => Promise<Set<string>>;
    uploadDocuments: (docs: KBDocument[]) => Promise<{
        succeeded: number;
        failed: number;
    }>;
    trackSyncedUrl: (url: string) => Promise<void>;
}
export declare function syncBlogs(deps: BlogSyncDeps, context: InvocationContext): Promise<{
    newPosts: number;
    docsUploaded: number;
    errors: number;
}>;
//# sourceMappingURL=kbBlogSync.d.ts.map