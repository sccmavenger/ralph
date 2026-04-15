/**
 * AI transcript processing — sends transcripts to Azure OpenAI for structured extraction.
 */
export declare const INTEL_CATEGORIES: readonly ["team_composition", "character_ranking", "counter_matchup", "farming_priority", "event_strategy", "dark_dimension", "cosmic_crucible", "iso8_recommendation"];
export type IntelCategory = (typeof INTEL_CATEGORIES)[number];
export interface KnowledgeItem {
    id: string;
    category: IntelCategory;
    content: Record<string, unknown>;
    sourceVideoId: string;
    sourceChannelId: string;
    sourceCreatorName: string;
    sourceVideoTitle: string;
    sourceVideoUrl: string;
    sourceDate: string;
    extractedAt: string;
}
export interface ClassificationResult {
    categories: IntelCategory[];
    confidence: number;
}
export interface ExtractionResult {
    items: KnowledgeItem[];
    tokensUsed: {
        classification: number;
        extraction: number;
    };
}
export interface OpenAIClient {
    classify(transcript: string): Promise<{
        result: ClassificationResult;
        tokensUsed: number;
    }>;
    extract(transcript: string, categories: IntelCategory[]): Promise<{
        items: Array<{
            category: IntelCategory;
            content: Record<string, unknown>;
        }>;
        tokensUsed: number;
    }>;
}
/**
 * Classification system prompt for GPT-4o-mini.
 */
export declare const CLASSIFICATION_PROMPT = "You are an MSF (Marvel Strike Force) content classifier. Given a video transcript, identify which knowledge categories are discussed. Return a JSON object with:\n- categories: array of category strings from: team_composition, character_ranking, counter_matchup, farming_priority, event_strategy, dark_dimension, cosmic_crucible, iso8_recommendation\n- confidence: number 0-100 indicating how confident you are this is MSF content\n\nOnly include categories that have substantial discussion (not just passing mentions).\nReturn valid JSON only, no markdown.";
/**
 * Extraction system prompt for GPT-4o.
 */
export declare const EXTRACTION_PROMPT = "You are an MSF (Marvel Strike Force) meta knowledge extractor. Given a video transcript and a list of categories to extract, produce structured knowledge items.\n\nFor each category found, return a JSON object with:\n- category: the category string\n- content: structured data relevant to the category\n\nContent schemas by category:\n- team_composition: { teamName, characters[], mode, notes }\n- character_ranking: { tier, characters[], mode, notes }\n- counter_matchup: { attacker, defender, mode, winRate, notes }\n- farming_priority: { characters[], reasoning, priority }\n- event_strategy: { eventName, requirements, strategy, tips[] }\n- dark_dimension: { ddNumber, node, team[], tips[] }\n- cosmic_crucible: { roomType, team[], counters[], tips[] }\n- iso8_recommendation: { character, isoClass, reasoning }\n\nReturn a JSON array of these objects. Return valid JSON only, no markdown.";
/**
 * Process a transcript through the AI pipeline.
 */
export declare function processTranscript(transcript: string, videoMetadata: {
    videoId: string;
    channelId: string;
    creatorName: string;
    videoTitle: string;
    publishedAt: string;
}, client: OpenAIClient): Promise<ExtractionResult>;
//# sourceMappingURL=aiProcessor.d.ts.map