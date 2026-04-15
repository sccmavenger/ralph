import { InvocationContext } from "@azure/functions";
export interface GapReport {
    high: Array<{
        question: string;
        frequency: number;
        gapType: string;
    }>;
    medium: Array<{
        question: string;
        frequency: number;
        gapType: string;
    }>;
    autoResolved: Array<{
        question: string;
        gapType: string;
    }>;
    featureRequests: Array<{
        question: string;
        frequency: number;
    }>;
}
export interface NotificationDeps {
    fetchGapReport: () => Promise<GapReport>;
    sendDiscordWebhook: (report: GapReport) => Promise<void>;
    sendEmailDigest: (report: GapReport) => Promise<void>;
}
export declare function sendGapNotifications(deps: NotificationDeps, context: InvocationContext): Promise<{
    sent: boolean;
}>;
export declare function formatDiscordEmbed(report: GapReport): object;
export declare function formatEmailHtml(report: GapReport): string;
//# sourceMappingURL=gapNotification.d.ts.map