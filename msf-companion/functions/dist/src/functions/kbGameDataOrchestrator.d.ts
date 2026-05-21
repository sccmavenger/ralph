/**
 * Timer-triggered Azure Function: Game Data KB Orchestrator
 * Runs all game data KB syncs in sequence daily at 05:00 UTC.
 */
import { InvocationContext } from "@azure/functions";
export interface SyncResult {
    name: string;
    success: boolean;
    docsUploaded: number;
    error?: string;
}
export interface OrchestratorDeps {
    syncCharacters: () => Promise<{
        uploaded: number;
    }>;
    syncMeta: () => Promise<{
        totalDocs: number;
    }>;
    syncDD: () => Promise<{
        uploaded: number;
    }>;
    syncISO8: () => Promise<{
        indexed: number;
    }>;
    syncGear: () => Promise<{
        uploaded: number;
    }>;
}
export declare function orchestrateGameDataSync(deps: OrchestratorDeps, context: InvocationContext): Promise<{
    results: SyncResult[];
    totalDocs: number;
}>;
//# sourceMappingURL=kbGameDataOrchestrator.d.ts.map