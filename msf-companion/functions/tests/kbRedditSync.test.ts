import { describe, it, expect, vi } from "vitest";
import { syncReddit, RedditSyncDeps } from "../src/functions/kbRedditSync.js";
import { InvocationContext } from "@azure/functions";

function mockContext(): InvocationContext {
  return { log: vi.fn(), warn: vi.fn(), error: vi.fn() } as unknown as InvocationContext;
}

describe("kbRedditSync", () => {
  it("fetches, filters, and indexes new Reddit posts", async () => {
    const deps: RedditSyncDeps = {
      fetchTopPosts: vi.fn().mockResolvedValue([
        {
          id: "abc123",
          title: "Best teams for war",
          selftext: "Here are my recommendations based on extensive testing...",
          score: 150,
          num_comments: 42,
          link_flair_text: "Strategy",
          created_utc: Date.now() / 1000,
          permalink: "/r/MarvelStrikeForce/comments/abc123/",
        },
      ]),
      getIndexedPostIds: vi.fn().mockResolvedValue(new Set()),
      uploadDocuments: vi.fn().mockResolvedValue({ succeeded: 1, failed: 0 }),
      deleteStaleDocuments: vi.fn().mockResolvedValue(0),
    };

    const result = await syncReddit(deps, mockContext());
    expect(result.fetched).toBe(1);
    expect(result.indexed).toBe(1);
  });

  it("skips already-indexed posts", async () => {
    const deps: RedditSyncDeps = {
      fetchTopPosts: vi.fn().mockResolvedValue([
        {
          id: "existing",
          title: "Old post",
          selftext: "Already indexed content about team building strategies...",
          score: 100,
          num_comments: 20,
          link_flair_text: "Guide",
          created_utc: Date.now() / 1000,
          permalink: "/r/MarvelStrikeForce/comments/existing/",
        },
      ]),
      getIndexedPostIds: vi.fn().mockResolvedValue(new Set(["reddit-existing"])),
      uploadDocuments: vi.fn().mockResolvedValue({ succeeded: 0, failed: 0 }),
      deleteStaleDocuments: vi.fn().mockResolvedValue(0),
    };

    const result = await syncReddit(deps, mockContext());
    expect(result.indexed).toBe(0);
  });

  it("handles Reddit API errors gracefully", async () => {
    const deps: RedditSyncDeps = {
      fetchTopPosts: vi.fn().mockRejectedValue(new Error("503 Service Unavailable")),
      getIndexedPostIds: vi.fn().mockResolvedValue(new Set()),
      uploadDocuments: vi.fn().mockResolvedValue({ succeeded: 0, failed: 0 }),
      deleteStaleDocuments: vi.fn().mockResolvedValue(0),
    };

    const result = await syncReddit(deps, mockContext());
    expect(result.fetched).toBe(0);
    expect(result.indexed).toBe(0);
    // Should not throw
  });
});
