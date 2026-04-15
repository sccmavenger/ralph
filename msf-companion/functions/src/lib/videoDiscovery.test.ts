import { describe, it, expect, vi, beforeEach } from "vitest";
import { discoverVideos, DiscoveryDeps, VideoDocument } from "./videoDiscovery.js";
import { YouTubeVideo, YouTubeRateLimitError, YouTubeAuthError } from "./youtubeClient.js";
import { ChannelEntry } from "../config/channelRegistry.js";
import { InvocationContext } from "@azure/functions";

function createMockContext(): InvocationContext {
  return {
    log: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  } as unknown as InvocationContext;
}

function createMockChannel(overrides: Partial<ChannelEntry> = {}): ChannelEntry {
  return {
    channelId: "UC_test_channel",
    handle: "@TestChannel",
    displayName: "TestChannel",
    msfOnly: true,
    enabled: true,
    ...overrides,
  };
}

function createMockVideo(overrides: Partial<YouTubeVideo> = {}): YouTubeVideo {
  return {
    videoId: "vid_001",
    title: "MSF New Character Review",
    description: "Testing MSF content",
    channelId: "UC_test_channel",
    publishedAt: "2026-04-07T00:00:00Z",
    thumbnailUrl: "https://img.youtube.com/vi/vid_001/hqdefault.jpg",
    ...overrides,
  };
}

describe("videoDiscovery", () => {
  let storedDocs: Map<string, VideoDocument>;
  let mockContainer: DiscoveryDeps["videosContainer"];
  let baseDeps: DiscoveryDeps;

  beforeEach(() => {
    storedDocs = new Map();
    mockContainer = {
      item: (id: string, partitionKey: string) => ({
        read: async () => {
          const key = `${partitionKey}:${id}`;
          if (storedDocs.has(key)) {
            return { resource: storedDocs.get(key) };
          }
          throw { code: 404 };
        },
      }),
      items: {
        create: async (doc: VideoDocument) => {
          storedDocs.set(`${doc.channelId}:${doc.id}`, doc);
          return { resource: doc };
        },
      },
    } as unknown as DiscoveryDeps["videosContainer"];

    baseDeps = {
      getEnabledChannels: () => [createMockChannel()],
      fetchChannelVideos: vi.fn().mockResolvedValue([createMockVideo()]),
      isMsfContent: () => true,
      videosContainer: mockContainer,
      apiKey: "test-api-key",
      publishedAfter: "2026-04-06T00:00:00Z",
    };
  });

  it("discovers and stores new MSF videos", async () => {
    const context = createMockContext();
    const results = await discoverVideos(baseDeps, context);

    expect(results).toHaveLength(1);
    expect(results[0].newVideos).toBe(1);
    expect(results[0].skippedDuplicate).toBe(0);
    expect(results[0].skippedFilter).toBe(0);
    expect(storedDocs.size).toBe(1);

    const stored = storedDocs.get("UC_test_channel:vid_001");
    expect(stored).toBeDefined();
    expect(stored?.status).toBe("discovered");
    expect(stored?.title).toBe("MSF New Character Review");
  });

  it("skips duplicate videos already in the database", async () => {
    // Pre-populate the mock DB
    storedDocs.set("UC_test_channel:vid_001", {
      id: "vid_001",
      videoId: "vid_001",
    } as VideoDocument);

    const context = createMockContext();
    const results = await discoverVideos(baseDeps, context);

    expect(results[0].newVideos).toBe(0);
    expect(results[0].skippedDuplicate).toBe(1);
    expect(storedDocs.size).toBe(1); // no new docs added
  });

  it("skips videos that fail MSF content filter", async () => {
    baseDeps.isMsfContent = () => false;

    const context = createMockContext();
    const results = await discoverVideos(baseDeps, context);

    expect(results[0].newVideos).toBe(0);
    expect(results[0].skippedFilter).toBe(1);
    expect(storedDocs.size).toBe(0);
  });

  it("handles YouTube API rate limit errors (429) without crashing", async () => {
    baseDeps.fetchChannelVideos = vi
      .fn()
      .mockRejectedValue(new YouTubeRateLimitError("Rate limit"));

    const context = createMockContext();
    const results = await discoverVideos(baseDeps, context);

    expect(results).toHaveLength(1);
    expect(results[0].error).toContain("Rate limit");
    expect(results[0].newVideos).toBe(0);
  });

  it("handles YouTube API auth errors (403) and logs meaningful error", async () => {
    baseDeps.fetchChannelVideos = vi
      .fn()
      .mockRejectedValue(new YouTubeAuthError("Forbidden"));

    const context = createMockContext();
    const results = await discoverVideos(baseDeps, context);

    expect(results).toHaveLength(1);
    expect(results[0].error).toContain("Auth error");
    expect(context.error).toHaveBeenCalled();
  });

  it("processes multiple channels", async () => {
    baseDeps.getEnabledChannels = () => [
      createMockChannel({ channelId: "UC_ch1", displayName: "Channel1" }),
      createMockChannel({ channelId: "UC_ch2", displayName: "Channel2" }),
    ];
    baseDeps.fetchChannelVideos = vi.fn()
      .mockResolvedValueOnce([createMockVideo({ videoId: "vid_a", channelId: "UC_ch1" })])
      .mockResolvedValueOnce([createMockVideo({ videoId: "vid_b", channelId: "UC_ch2" })]);

    const context = createMockContext();
    const results = await discoverVideos(baseDeps, context);

    expect(results).toHaveLength(2);
    expect(results[0].newVideos).toBe(1);
    expect(results[1].newVideos).toBe(1);
    expect(storedDocs.size).toBe(2);
  });

  it("integration: full pipeline from discovery to storage", async () => {
    const videos = [
      createMockVideo({ videoId: "v1", title: "MSF Arena Guide" }),
      createMockVideo({ videoId: "v2", title: "Random Gaming Video" }),
      createMockVideo({ videoId: "v3", title: "Marvel Strike Force Tier List" }),
    ];

    // Pre-populate v3 as already discovered
    storedDocs.set("UC_test_channel:v3", { id: "v3", videoId: "v3" } as VideoDocument);

    baseDeps.fetchChannelVideos = vi.fn().mockResolvedValue(videos);
    baseDeps.isMsfContent = (title: string, _desc: string) =>
      title.toLowerCase().includes("msf") ||
      title.toLowerCase().includes("marvel strike force");

    const context = createMockContext();
    const results = await discoverVideos(baseDeps, context);

    expect(results[0].newVideos).toBe(1); // only v1 is new + MSF
    expect(results[0].skippedDuplicate).toBe(1); // v3 exists
    expect(results[0].skippedFilter).toBe(1); // v2 filtered out
  });
});
