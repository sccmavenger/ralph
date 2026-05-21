/**
 * Timer-triggered Azure Function: Gap Auto-Resolution
 * Picks up knowledge gaps with status 'auto_resolving' and attempts to
 * resolve them by searching YouTube for relevant content, indexing it,
 * and marking the gap as resolved.
 * Runs daily at 03:30 UTC (after gap analysis at 03:00).
 */
import { InvocationContext } from "@azure/functions";
export interface GapRecord {
    id: string;
    clusteredQuestion: string;
    category: string;
    gapType: string;
    autoResolveAction: string | null;
}
export interface GapResolveDeps {
    fetchAutoResolvingGaps: () => Promise<GapRecord[]>;
    searchYouTube: (query: string) => Promise<Array<{
        videoId: string;
        title: string;
        description: string;
        channelTitle: string;
        publishedAt: string;
    }>>;
    uploadDocuments: (docs: Array<{
        id: string;
        content: string;
        category: string;
        sourceCreatorName: string;
        sourceVideoTitle: string;
        sourceUrl: string;
        sourceDate: string;
        sourceTier: number;
        sourceType: string;
    }>) => Promise<{
        succeeded: number;
        failed: number;
    }>;
    markGapResolved: (gapId: string) => Promise<void>;
    markGapFailed: (gapId: string) => Promise<void>;
}
export declare function resolveGaps(deps: GapResolveDeps, context: InvocationContext): Promise<{
    resolved: number;
    failed: number;
    skipped: number;
}>;
//# sourceMappingURL=gapAutoResolve.d.ts.map