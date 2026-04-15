"use strict";
/**
 * YouTube Data API v3 client for video discovery.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.YouTubeAuthError = exports.YouTubeRateLimitError = void 0;
exports.fetchChannelVideos = fetchChannelVideos;
/**
 * Fetch recent videos from a YouTube channel using the Search API.
 * @param channelId - YouTube channel ID
 * @param publishedAfter - ISO 8601 date to filter videos published after
 * @param apiKey - YouTube Data API v3 key
 * @returns Array of video metadata
 * @throws Error with code 429 for rate limits, 403 for auth errors
 */
async function fetchChannelVideos(channelId, publishedAfter, apiKey) {
    const videos = [];
    let pageToken;
    do {
        const params = new URLSearchParams({
            part: "snippet",
            channelId,
            publishedAfter,
            type: "video",
            order: "date",
            maxResults: "50",
            key: apiKey,
        });
        if (pageToken)
            params.set("pageToken", pageToken);
        const url = `https://www.googleapis.com/youtube/v3/search?${params}`;
        const response = await fetch(url);
        if (response.status === 429) {
            throw new YouTubeRateLimitError("YouTube API rate limit exceeded (429)");
        }
        if (response.status === 403) {
            const body = await response.text();
            throw new YouTubeAuthError(`YouTube API auth error (403): ${body}`);
        }
        if (!response.ok) {
            throw new Error(`YouTube API error: ${response.status} ${response.statusText}`);
        }
        const data = (await response.json());
        if (data.items) {
            for (const item of data.items) {
                const thumb = item.snippet.thumbnails.high?.url ||
                    item.snippet.thumbnails.medium?.url ||
                    item.snippet.thumbnails.default?.url ||
                    "";
                videos.push({
                    videoId: item.id.videoId,
                    title: item.snippet.title,
                    description: item.snippet.description,
                    channelId: item.snippet.channelId,
                    publishedAt: item.snippet.publishedAt,
                    thumbnailUrl: thumb,
                });
            }
        }
        pageToken = data.nextPageToken;
    } while (pageToken);
    return videos;
}
class YouTubeRateLimitError extends Error {
    constructor(message) {
        super(message);
        this.name = "YouTubeRateLimitError";
    }
}
exports.YouTubeRateLimitError = YouTubeRateLimitError;
class YouTubeAuthError extends Error {
    constructor(message) {
        super(message);
        this.name = "YouTubeAuthError";
    }
}
exports.YouTubeAuthError = YouTubeAuthError;
//# sourceMappingURL=youtubeClient.js.map