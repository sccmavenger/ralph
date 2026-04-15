/**
 * Video discovery logic — extracted for testability.
 */

import { InvocationContext } from "@azure/functions";
import { Container } from "@azure/cosmos";
import { ChannelEntry, getEnabledChannels } from "../config/channelRegistry.js";
import { fetchChannelVideos, YouTubeVideo, YouTubeRateLimitError, YouTubeAuthError } from "../lib/youtubeClient.js";
import { isMsfContent } from "../lib/contentFilter.js";

export interface VideoDocument {
  id: string;
  videoId: string;
  title: string;
  description: string;
  channelId: string;
  channelName: string;
  publishedAt: string;
  thumbnailUrl: string;
  status: "discovered";
  discoveredAt: string;
}

export interface DiscoveryResult {
  channelName: string;
  newVideos: number;
  skippedDuplicate: number;
  skippedFilter: number;
  error?: string;
}

export interface DiscoveryDeps {
  getEnabledChannels: () => ChannelEntry[];
  fetchChannelVideos: (channelId: string, publishedAfter: string, apiKey: string) => Promise<YouTubeVideo[]>;
  isMsfContent: (title: string, description: string) => boolean;
  videosContainer: Container;
  apiKey: string;
  publishedAfter: string;
}

/**
 * Run video discovery for all enabled channels.
 */
export async function discoverVideos(
  deps: DiscoveryDeps,
  context: InvocationContext
): Promise<DiscoveryResult[]> {
  const channels = deps.getEnabledChannels();
  const results: DiscoveryResult[] = [];

  for (const channel of channels) {
    const result: DiscoveryResult = {
      channelName: channel.displayName,
      newVideos: 0,
      skippedDuplicate: 0,
      skippedFilter: 0,
    };

    try {
      const videos = await deps.fetchChannelVideos(
        channel.channelId,
        deps.publishedAfter,
        deps.apiKey
      );

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
        } catch (err: unknown) {
          const cosmosErr = err as { code?: number };
          if (cosmosErr.code !== 404) {
            // Unexpected error reading from Cosmos
            context.warn(`Unexpected error checking video ${video.videoId}: ${err}`);
            continue;
          }
          // 404 = not found = new video, proceed to insert
        }

        // Store new video
        const doc: VideoDocument = {
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
    } catch (err) {
      if (err instanceof YouTubeRateLimitError) {
        result.error = "Rate limit exceeded (429)";
        context.warn(`Rate limit hit for channel ${channel.displayName}`);
      } else if (err instanceof YouTubeAuthError) {
        result.error = "Auth error (403)";
        context.error(`Auth error for channel ${channel.displayName}: ${err.message}`);
      } else {
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
export function createProductionDeps(videosContainer: Container): DiscoveryDeps {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) throw new Error("YOUTUBE_API_KEY is not configured");

  // Default: look back 24 hours
  const publishedAfter = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  return {
    getEnabledChannels,
    fetchChannelVideos,
    isMsfContent,
    videosContainer,
    apiKey,
    publishedAfter,
  };
}
