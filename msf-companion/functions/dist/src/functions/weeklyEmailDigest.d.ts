import { InvocationContext } from "@azure/functions";
export interface EmailDigestDeps {
    fetchEligibleCommanders: () => Promise<Array<{
        id: string;
        email: string;
        displayName: string;
    }>>;
    fetchWeeklyTips: (commanderId: string) => Promise<Array<{
        content: string;
        sourceCreatorName?: string;
    }>>;
    fetchUnreadNotifications: (commanderId: string) => Promise<Array<{
        type: string;
        title: string;
        message: string;
    }>>;
    sendEmail: (to: string, subject: string, html: string) => Promise<void>;
}
export interface DigestData {
    displayName: string;
    tips: Array<{
        content: string;
        sourceCreatorName?: string;
    }>;
    notifications: Array<{
        type: string;
        title: string;
        message: string;
    }>;
}
export declare function sendWeeklyDigests(deps: EmailDigestDeps, context: InvocationContext): Promise<{
    sent: number;
    skipped: number;
}>;
export declare function formatDigestEmail(data: DigestData): string;
//# sourceMappingURL=weeklyEmailDigest.d.ts.map