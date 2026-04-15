"use strict";
/**
 * Transcript extraction pipeline — processes discovered videos.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.processVideoTranscript = processVideoTranscript;
exports.createTranscriptDeps = createTranscriptDeps;
const transcriptExtractor_js_1 = require("./transcriptExtractor.js");
/**
 * Process a single video: extract transcript and update status.
 */
async function processVideoTranscript(videoId, channelId, deps, context) {
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
    }
    catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        try {
            await deps.videosContainer
                .item(videoId, channelId)
                .patch([
                { op: "set", path: "/status", value: "transcript_failed" },
                { op: "set", path: "/transcriptError", value: errorMsg },
            ]);
        }
        catch {
            context.warn(`Failed to update status for video ${videoId}`);
        }
        context.error(`Transcript extraction error for video ${videoId}: ${errorMsg}`);
        return { videoId, status: "transcript_failed", error: errorMsg };
    }
}
/** Create production dependencies. */
function createTranscriptDeps(videosContainer) {
    const apiKey = process.env.YOUTUBE_API_KEY;
    if (!apiKey)
        throw new Error("YOUTUBE_API_KEY is not configured");
    return {
        videosContainer,
        extractTranscript: transcriptExtractor_js_1.extractTranscript,
        apiKey,
    };
}
//# sourceMappingURL=transcriptPipeline.js.map