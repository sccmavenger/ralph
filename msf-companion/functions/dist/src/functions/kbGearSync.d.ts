/**
 * Timer-triggered Azure Function: Gear Upgrade Requirements KB Sync
 */
import { InvocationContext } from "@azure/functions";
import { GearItem, KBDocument } from "../lib/kbGameData.js";
export interface GearSyncDeps {
    fetchGearData: () => Promise<Array<{
        tier: number;
        origin: string;
        items: GearItem[];
    }>>;
    uploadDocuments: (docs: KBDocument[]) => Promise<{
        succeeded: number;
        failed: number;
    }>;
}
export declare function syncGear(deps: GearSyncDeps, context: InvocationContext): Promise<{
    tiers: number;
    uploaded: number;
}>;
//# sourceMappingURL=kbGearSync.d.ts.map