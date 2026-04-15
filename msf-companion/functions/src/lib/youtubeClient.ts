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
    id: { videoId: string };
    snippet: {
      title: string;
      description: string;
      channelId: string;
      publishedAt: string;
      thumbnails: {
        high?: { url: string };
        medium?: { url: string };
        default?: { url: string };
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
export async function fetchChannelVideos(
  channelId: string,
  publishedAfter: string,
  apiKey: string
): Promise<YouTubeVideo[]> {
  const videos: YouTubeVideo[] = [];
  let pageToken: string | undefined;

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
    if (pageToken) params.set("pageToken", pageToken);

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

    const data = (await response.json()) as YouTubeSearchResponse;
    if (data.items) {
      for (const item of data.items) {
        const thumb =
          item.snippet.thumbnails.high?.url ||
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

export class YouTubeRateLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "YouTubeRateLimitError";
  }
}

export class YouTubeAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "YouTubeAuthError";
  }
}
