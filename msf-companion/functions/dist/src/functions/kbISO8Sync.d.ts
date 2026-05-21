/**
 * Timer-triggered Azure Function: ISO-8 Recommendations KB Sync
 */
import { InvocationContext } from "@azure/functions";
import { ISO8Data, KBDocument } from "../lib/kbGameData.js";
export interface ISO8SyncDeps {
    fetchISO8Data: () => Promise<Array<{
        characterId: string;
        characterName: string;
        isoData: ISO8Data;
    }>>;
    uploadDocuments: (docs: KBDocument[]) => Promise<{
        succeeded: number;
        failed: number;
    }>;
}
export declare function syncISO8(deps: ISO8SyncDeps, context: InvocationContext): Promise<{
    total: number;
    indexed: number;
    filtered: number;
}>;
//# sourceMappingURL=kbISO8Sync.d.ts.map