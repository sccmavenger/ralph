/**
 * Timer-triggered Azure Function: KB Stale Document Sweep
 * Removes documents past their expected freshness lifecycle.
 */
import { InvocationContext } from "@azure/functions";
export interface StaleSweepDeps {
    queryStaleDocuments: (sourceType: string, olderThan: Date) => Promise<string[]>;
    deleteDocuments: (docIds: string[]) => Promise<number>;
}
export declare function sweepStaleDocuments(deps: StaleSweepDeps, context: InvocationContext): Promise<{
    totalRemoved: number;
    byType: Record<string, number>;
}>;
//# sourceMappingURL=kbStaleSweep.d.ts.map