import { InvocationContext } from "@azure/functions";
export interface EventAlertDeps {
    fetchRecentBlogPosts: (since: Date) => Promise<Array<{
        id: string;
        title: string;
        type: string;
        eventDates?: string;
        publishedAt: string;
    }>>;
    fetchRecentKnowledge: (since: Date) => Promise<Array<{
        sourceCreatorName: string;
        content: string;
        category: string;
    }>>;
    fetchAllCommanderIds: () => Promise<string[]>;
    createNotification: (commanderId: string, notification: {
        type: string;
        title: string;
        message: string;
        linkUrl?: string;
    }) => Promise<void>;
}
export interface MetaShift {
    teamName: string;
    creatorCount: number;
    creators: string[];
}
export declare function detectEventAlerts(deps: EventAlertDeps, context: InvocationContext): Promise<{
    eventAlerts: number;
    metaShiftAlerts: number;
}>;
export declare function detectMetaShifts(knowledge: Array<{
    sourceCreatorName: string;
    content: string;
    category: string;
}>): MetaShift[];
//# sourceMappingURL=eventAlerts.d.ts.map