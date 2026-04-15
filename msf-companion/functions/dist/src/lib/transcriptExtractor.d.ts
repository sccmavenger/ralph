/**
 * Transcript extraction from YouTube videos.
 * Tries official captions API first, falls back to community library.
 */
export interface TranscriptResult {
    transcript: string;
    source: "official" | "community";
}
/**
 * Fetch official captions via YouTube Data API v3.
 * Returns the transcript text or null if unavailable.
 */
export declare function fetchOfficialCaptions(videoId: string, apiKey: string): Promise<string | null>;
/**
 * Strip SRT subtitle formatting, keeping only the text content.
 */
export declare function stripSrtFormatting(srt: string): string;
/**
 * Fetch transcript using community library approach (HTML scraping fallback).
 * This is a simplified implementation that fetches the auto-generated transcript.
 */
export declare function fetchCommunityTranscript(videoId: string): Promise<string | null>;
/**
 * Extract transcript from a YouTube video.
 * Tries official captions first, then community fallback.
 */
export declare function extractTranscript(videoId: string, apiKey: string): Promise<TranscriptResult | null>;
//# sourceMappingURL=transcriptExtractor.d.ts.map