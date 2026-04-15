import { InvocationContext } from "@azure/functions";
export interface GapAnalysisDeps {
    fetchFailedQuestions: (since: Date) => Promise<Array<{
        question: string;
        category: string;
    }>>;
    fetchExistingGaps: () => Promise<Array<{
        id: string;
        clusteredQuestion: string;
        category: string;
        frequency: number;
    }>>;
    clusterQuestions: (questions: Array<{
        question: string;
        category: string;
    }>, existingGaps: Array<{
        clusteredQuestion: string;
    }>) => Promise<Array<{
        clusteredQuestion: string;
        category: string;
        gapType: string;
        questions: string[];
    }>>;
    upsertGap: (gap: {
        clusteredQuestion: string;
        category: string;
        gapType: string;
        frequency: number;
        status: string;
        autoResolveAction?: string;
    }) => Promise<void>;
    incrementGapFrequency: (gapId: string, increment: number) => Promise<void>;
}
export declare function analyzeGaps(deps: GapAnalysisDeps, context: InvocationContext): Promise<{
    gapsCreated: number;
    gapsUpdated: number;
}>;
export declare function clusterWithOpenAI(questions: Array<{
    question: string;
    category: string;
}>, existingGaps: Array<{
    clusteredQuestion: string;
}>): Promise<Array<{
    clusteredQuestion: string;
    category: string;
    gapType: string;
    questions: string[];
}>>;
//# sourceMappingURL=gapAnalysis.d.ts.map