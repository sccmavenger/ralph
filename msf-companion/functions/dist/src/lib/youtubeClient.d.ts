/**
 * YouTube Data API v3 client for video discovery.
 */
export interface YouTubeVideo {
    videoId: string;
    title: string;
    description: string;
    channelId: string;
    publishedAt: string;
    thumbnailUrl: string;
}
export interface YouTubeApiError {
    code: number;
    message: string;
}
export interface YouTubeSearchResponse {
    items?: Array<{
        id: {
            videoId: string;
        };
        snippet: {
            title: string;
            description: string;
            channelId: string;
            publishedAt: string;
            thumbnails: {
                high?: {
                    url: string;
                };
                medium?: {
                    url: string;
                };
                default?: {
                    url: string;
                };
            };
        };
    }>;
    nextPageToken?: string;
    error?: YouTubeApiError;
}
/**
 * Fetch recent videos from a YouTube channel using the Search API.
 * @param channelId - YouTube channel ID
 * @param publishedAfter - ISO 8601 date to filter videos published after
 * @param apiKey - YouTube Data API v3 key
 * @returns Array of video metadata
 * @throws Error with code 429 for rate limits, 403 for auth errors
 */
export declare function fetchChannelVideos(channelId: string, publishedAfter: string, apiKey: string): Promise<YouTubeVideo[]>;
export declare class YouTubeRateLimitError extends Error {
    constructor(message: string);
}
export declare class YouTubeAuthError extends Error {
    constructor(message: string);
}
//# sourceMappingURL=youtubeClient.d.ts.map