import { InvocationContext } from "@azure/functions";
export interface PremiumCommander {
    id: string;
    email: string | null;
    displayName: string | null;
    lastLoginAt: Date | null;
    stripeCurrentPeriodEnd: Date | null;
    disabled: boolean;
    recentUsageCount: number;
    priorUsageCount: number;
    recentLoginDays: number;
    priorLoginDays: number;
    paymentFailures: number;
    topFeature: string | null;
}
export interface ChurnPreventionDeps {
    fetchPremiumCommanders: () => Promise<PremiumCommander[]>;
    getLastIntervention: (commanderId: string, type: string) => Promise<{
        sentAt: Date;
    } | null>;
    sendEmail: (to: string, subject: string, html: string) => Promise<void>;
    createNotification: (commanderId: string, title: string, message: string, linkUrl: string | null) => Promise<void>;
    logIntervention: (commanderId: string, type: string, channel: string, riskScore: number, scheduledAt?: Date) => Promise<void>;
    fetchScheduledWinBacks: () => Promise<Array<{
        id: string;
        commanderId: string;
        email: string | null;
        displayName: string | null;
    }>>;
    markDelivered: (interventionId: string) => Promise<void>;
    isFeatureEnabled: (key: string) => Promise<boolean>;
}
export declare function calculateRiskScore(commander: PremiumCommander): number;
export declare function buildReEngageEmailHtml(displayName: string, topFeature: string | null): string;
export declare function buildRetentionEmailHtml(displayName: string): string;
export declare function buildDunningEmailHtml(displayName: string): string;
export declare function buildWinBackEmailHtml(displayName: string): string;
export interface ChurnPreventionResult {
    scanned: number;
    nudged: number;
    reEngaged: number;
    retained: number;
    winBacks: number;
    skipped: number;
}
export declare function runChurnPrevention(deps: ChurnPreventionDeps, context: InvocationContext): Promise<ChurnPreventionResult>;
//# sourceMappingURL=churnPrevention.d.ts.map