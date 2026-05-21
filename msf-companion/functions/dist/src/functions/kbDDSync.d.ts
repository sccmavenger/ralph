/**
 * Timer-triggered Azure Function: Dark Dimension Node Requirements KB Sync
 */
import { InvocationContext } from "@azure/functions";
import { DDData, NodeData, KBDocument } from "../lib/kbGameData.js";
export interface DDSyncDeps {
    fetchDDData: () => Promise<Array<{
        dd: DDData;
        nodes: NodeData[];
    }>>;
    uploadDocuments: (docs: KBDocument[]) => Promise<{
        succeeded: number;
        failed: number;
    }>;
}
export declare function syncDDNodes(deps: DDSyncDeps, context: InvocationContext): Promise<{
    dds: number;
    nodes: number;
    skipped: number;
    uploaded: number;
}>;
//# sourceMappingURL=kbDDSync.d.ts.map