/**
 * Transcript extraction pipeline — processes discovered videos.
 */
import { InvocationContext } from "@azure/functions";
import { Container } from "@azure/cosmos";
import { TranscriptResult } from "./transcriptExtractor.js";
export interface TranscriptDeps {
    videosContainer: Container;
    extractTranscript: (videoId: string, apiKey: string) => Promise<TranscriptResult | null>;
    apiKey: string;
}
export interface TranscriptProcessResult {
    videoId: string;
    status: "transcribed" | "transcript_failed";
    source?: "official" | "community";
    error?: string;
}
/**
 * Process a single video: extract transcript and update status.
 */
export declare function processVideoTranscript(videoId: string, channelId: string, deps: TranscriptDeps, context: InvocationContext): Promise<TranscriptProcessResult>;
/** Create production dependencies. */
export declare function createTranscriptDeps(videosContainer: Container): TranscriptDeps;
//# sourceMappingURL=transcriptPipeline.d.ts.map