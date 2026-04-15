/**
 * Video discovery logic — extracted for testability.
 */
import { InvocationContext } from "@azure/functions";
import { Container } from "@azure/cosmos";
import { ChannelEntry } from "../config/channelRegistry.js";
import { YouTubeVideo } from "../lib/youtubeClient.js";
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
export declare function discoverVideos(deps: DiscoveryDeps, context: InvocationContext): Promise<DiscoveryResult[]>;
/** Default dependency factory for production. */
export declare function createProductionDeps(videosContainer: Container): DiscoveryDeps;
//# sourceMappingURL=videoDiscovery.d.ts.map