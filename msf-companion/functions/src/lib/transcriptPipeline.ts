/**
 * Transcript extraction pipeline — processes discovered videos.
 */

import { InvocationContext } from "@azure/functions";
import { Container } from "@azure/cosmos";
import { extractTranscript, TranscriptResult } from "./transcriptExtractor.js";

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
export async function processVideoTranscript(
  videoId: string,
  channelId: string,
  deps: TranscriptDeps,
  context: InvocationContext
): Promise<TranscriptProcessResult> {
  try {
    const result = await deps.extractTranscript(videoId, deps.apiKey);

    if (!result) {
      // Both methods failed
      await deps.videosContainer
        .item(videoId, channelId)
        .patch([
          { op: "set", path: "/status", value: "transcript_failed" },
          { op: "set", path: "/transcriptError", value: "No transcript available from official or community sources" },
        ]);

      context.warn(`Transcript extraction failed for video ${videoId}: no transcript available`);
      return { videoId, status: "transcript_failed", error: "No transcript available" };
    }

    // Store transcript and update status
    await deps.videosContainer
      .item(videoId, channelId)
      .patch([
        { op: "set", path: "/status", value: "transcribed" },
        { op: "set", path: "/transcript", value: result.transcript },
        { op: "set", path: "/transcriptSource", value: result.source },
        { op: "set", path: "/transcribedAt", value: new Date().toISOString() },
      ]);

    context.log(`Transcribed video ${videoId} via ${result.source} (${result.transcript.length} chars)`);
    return { videoId, status: "transcribed", source: result.source };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);

    try {
      await deps.videosContainer
        .item(videoId, channelId)
        .patch([
          { op: "set", path: "/status", value: "transcript_failed" },
          { op: "set", path: "/transcriptError", value: errorMsg },
        ]);
    } catch {
      context.warn(`Failed to update status for video ${videoId}`);
    }

    context.error(`Transcript extraction error for video ${videoId}: ${errorMsg}`);
    return { videoId, status: "transcript_failed", error: errorMsg };
  }
}

/** Create production dependencies. */
export function createTranscriptDeps(videosContainer: Container): TranscriptDeps {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) throw new Error("YOUTUBE_API_KEY is not configured");

  return {
    videosContainer,
    extractTranscript,
    apiKey,
  };
}
