/**
 * AI transcript processing — sends transcripts to Azure OpenAI for structured extraction.
 */

export const INTEL_CATEGORIES = [
  "team_composition",
  "character_ranking",
  "counter_matchup",
  "farming_priority",
  "event_strategy",
  "dark_dimension",
  "cosmic_crucible",
  "iso8_recommendation",
] as const;

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
  tokensUsed: { classification: number; extraction: number };
}

export interface OpenAIClient {
  classify(transcript: string): Promise<{ result: ClassificationResult; tokensUsed: number }>;
  extract(transcript: string, categories: IntelCategory[]): Promise<{ items: Array<{ category: IntelCategory; content: Record<string, unknown> }>; tokensUsed: number }>;
}

/**
 * Classification system prompt for GPT-4o-mini.
 */
export const CLASSIFICATION_PROMPT = `You are an MSF (Marvel Strike Force) content classifier. Given a video transcript, identify which knowledge categories are discussed. Return a JSON object with:
- categories: array of category strings from: team_composition, character_ranking, counter_matchup, farming_priority, event_strategy, dark_dimension, cosmic_crucible, iso8_recommendation
- confidence: number 0-100 indicating how confident you are this is MSF content

Only include categories that have substantial discussion (not just passing mentions).
Return valid JSON only, no markdown.`;

/**
 * Extraction system prompt for GPT-4o.
 */
export const EXTRACTION_PROMPT = `You are an MSF (Marvel Strike Force) meta knowledge extractor. Given a video transcript and a list of categories to extract, produce structured knowledge items.

For each category found, return a JSON object with:
- category: the category string
- content: structured data relevant to the category

Content schemas by category:
- team_composition: { teamName, characters[], mode, notes }
- character_ranking: { tier, characters[], mode, notes }
- counter_matchup: { attacker, defender, mode, winRate, notes }
- farming_priority: { characters[], reasoning, priority }
- event_strategy: { eventName, requirements, strategy, tips[] }
- dark_dimension: { ddNumber, node, team[], tips[] }
- cosmic_crucible: { roomType, team[], counters[], tips[] }
- iso8_recommendation: { character, isoClass, reasoning }

Return a JSON array of these objects. Return valid JSON only, no markdown.`;

/**
 * Process a transcript through the AI pipeline.
 */
export async function processTranscript(
  transcript: string,
  videoMetadata: {
    videoId: string;
    channelId: string;
    creatorName: string;
    videoTitle: string;
    publishedAt: string;
  },
  client: OpenAIClient
): Promise<ExtractionResult> {
  // Step 1: Classify with GPT-4o-mini
  const classification = await client.classify(transcript);

  if (classification.result.categories.length === 0 || classification.result.confidence < 30) {
    return {
      items: [],
      tokensUsed: { classification: classification.tokensUsed, extraction: 0 },
    };
  }

  // Step 2: Extract with GPT-4o
  const extraction = await client.extract(transcript, classification.result.categories);

  const now = new Date().toISOString();
  const items: KnowledgeItem[] = extraction.items.map((item, idx) => ({
    id: `${videoMetadata.videoId}_${item.category}_${idx}`,
    category: item.category,
    content: item.content,
    sourceVideoId: videoMetadata.videoId,
    sourceChannelId: videoMetadata.channelId,
    sourceCreatorName: videoMetadata.creatorName,
    sourceVideoTitle: videoMetadata.videoTitle,
    sourceVideoUrl: `https://www.youtube.com/watch?v=${videoMetadata.videoId}`,
    sourceDate: videoMetadata.publishedAt,
    extractedAt: now,
  }));

  return {
    items,
    tokensUsed: {
      classification: classification.tokensUsed,
      extraction: extraction.tokensUsed,
    },
  };
}
