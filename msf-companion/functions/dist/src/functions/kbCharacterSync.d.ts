/**
 * Timer-triggered Azure Function: Character Kits KB Sync
 * Fetches character kit data from the MSF API and indexes it in Azure AI Search.
 */
import { InvocationContext } from "@azure/functions";
import { CharacterData, KBDocument } from "../lib/kbGameData.js";
export interface CharacterSyncDeps {
    fetchCharacters: () => Promise<CharacterData[]>;
    uploadDocuments: (docs: KBDocument[]) => Promise<{
        succeeded: number;
        failed: number;
    }>;
}
export declare function syncCharacterKits(deps: CharacterSyncDeps, context: InvocationContext): Promise<{
    total: number;
    uploaded: number;
    errors: number;
}>;
//# sourceMappingURL=kbCharacterSync.d.ts.map