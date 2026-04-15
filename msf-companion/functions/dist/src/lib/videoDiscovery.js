"use strict";
/**
 * Video discovery logic — extracted for testability.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.discoverVideos = discoverVideos;
exports.createProductionDeps = createProductionDeps;
const channelRegistry_js_1 = require("../config/channelRegistry.js");
const youtubeClient_js_1 = require("../lib/youtubeClient.js");
const contentFilter_js_1 = require("../lib/contentFilter.js");
/**
 * Run video discovery for all enabled channels.
 */
async function discoverVideos(deps, context) {
    const channels = deps.getEnabledChannels();
    const results = [];
    for (const channel of channels) {
        const result = {
            channelName: channel.displayName,
            newVideos: 0,
            skippedDuplicate: 0,
            skippedFilter: 0,
        };
        try {
            const videos = await deps.fetchChannelVideos(channel.channelId, deps.publishedAfter, deps.apiKey);
            for (const video of videos) {
                // MSF content filter
                if (!deps.isMsfContent(video.title, video.description)) {
                    result.skippedFilter++;
                    continue;
                }
                // Deduplication: check if video already exists
                try {
                    await deps.videosContainer.item(video.videoId, video.channelId).read();
                    // If we get here, it already exists
                    result.skippedDuplicate++;
                    continue;
                }
                catch (err) {
                    const cosmosErr = err;
                    if (cosmosErr.code !== 404) {
                        // Unexpected error reading from Cosmos
                        context.warn(`Unexpected error checking video ${video.videoId}: ${err}`);
                        continue;
                    }
                    // 404 = not found = new video, proceed to insert
                }
                // Store new video
                const doc = {
                    id: video.videoId,
                    videoId: video.videoId,
                    title: video.title,
                    description: video.description,
                    channelId: video.channelId,
                    channelName: channel.displayName,
                    publishedAt: video.publishedAt,
                    thumbnailUrl: video.thumbnailUrl,
                    status: "discovered",
                    discoveredAt: new Date().toISOString(),
                };
                await deps.videosContainer.items.create(doc);
                result.newVideos++;
            }
        }
        catch (err) {
            if (err instanceof youtubeClient_js_1.YouTubeRateLimitError) {
                result.error = "Rate limit exceeded (429)";
                context.warn(`Rate limit hit for channel ${channel.displayName}`);
            }
            else if (err instanceof youtubeClient_js_1.YouTubeAuthError) {
                result.error = "Auth error (403)";
                context.error(`Auth error for channel ${channel.displayName}: ${err.message}`);
            }
            else {
                result.error = `Error: ${err}`;
                context.error(`Error discovering videos for ${channel.displayName}: ${err}`);
            }
        }
        context.log(`${channel.displayName}: ${result.newVideos} new, ${result.skippedDuplicate} duplicates, ${result.skippedFilter} filtered`);
        results.push(result);
    }
    return results;
}
/** Default dependency factory for production. */
function createProductionDeps(videosContainer) {
    const apiKey = process.env.YOUTUBE_API_KEY;
    if (!apiKey)
        throw new Error("YOUTUBE_API_KEY is not configured");
    // Default: look back 24 hours
    const publishedAfter = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    return {
        getEnabledChannels: channelRegistry_js_1.getEnabledChannels,
        fetchChannelVideos: youtubeClient_js_1.fetchChannelVideos,
        isMsfContent: contentFilter_js_1.isMsfContent,
        videosContainer,
        apiKey,
        publishedAfter,
    };
}
//# sourceMappingURL=videoDiscovery.js.map