/**
 * Timer-triggered Azure Function: War & Crucible Meta KB Sync
 * Fetches war offense/defense and crucible meta data and indexes it.
 */
import { InvocationContext } from "@azure/functions";
import { KBDocument } from "../lib/kbGameData.js";
export interface MetaSyncDeps {
    fetchCharacterNames: () => Promise<Map<string, string>>;
    fetchMetaTeams: (mode: string, endpoint: string) => Promise<Array<{
        characters: string[];
        total: number;
        wins: number;
        rank: number;
    }>>;
    uploadDocuments: (docs: KBDocument[]) => Promise<{
        succeeded: number;
        failed: number;
    }>;
}
export declare function syncMeta(deps: MetaSyncDeps, context: InvocationContext): Promise<{
    modes: number;
    totalDocs: number;
    errors: number;
}>;
//# sourceMappingURL=kbMetaSync.d.ts.map