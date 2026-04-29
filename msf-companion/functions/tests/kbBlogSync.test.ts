import { describe, it, expect, vi } from "vitest";
import { syncBlogs, BlogSyncDeps } from "../src/functions/kbBlogSync.js";
import { InvocationContext } from "@azure/functions";

function mockContext(): InvocationContext {
  return { log: vi.fn(), warn: vi.fn(), error: vi.fn() } as unknown as InvocationContext;
}

describe("kbBlogSync", () => {
  it("indexes new blog posts and skips already-indexed ones", async () => {
    const deps: BlogSyncDeps = {
      fetchBlogList: vi.fn().mockResolvedValue([
        { url: "https://msf.com/new-post", title: "New Post", date: "2026-04-29" },
        { url: "https://msf.com/old-post", title: "Old Post", date: "2026-04-20" },
      ]),
      fetchBlogContent: vi.fn().mockResolvedValue("This is a blog post about game changes."),
      getIndexedBlogIds: vi.fn().mockResolvedValue(new Set(["blog-old-post-0"])),
      uploadDocuments: vi.fn().mockResolvedValue({ succeeded: 1, failed: 0 }),
      trackSyncedUrl: vi.fn(),
    };

    const result = await syncBlogs(deps, mockContext());
    expect(result.newPosts).toBe(1);
    expect(result.docsUploaded).toBe(1);
    expect(deps.fetchBlogContent).toHaveBeenCalledTimes(1);
    expect(deps.trackSyncedUrl).toHaveBeenCalledWith("https://msf.com/new-post");
  });

  it("handles fetch errors for individual posts gracefully", async () => {
    const deps: BlogSyncDeps = {
      fetchBlogList: vi.fn().mockResolvedValue([
        { url: "https://msf.com/broken", title: "Broken Post", date: "2026-04-29" },
      ]),
      fetchBlogContent: vi.fn().mockResolvedValue(null),
      getIndexedBlogIds: vi.fn().mockResolvedValue(new Set()),
      uploadDocuments: vi.fn().mockResolvedValue({ succeeded: 0, failed: 0 }),
      trackSyncedUrl: vi.fn(),
    };

    const result = await syncBlogs(deps, mockContext());
    expect(result.errors).toBe(1);
    expect(result.newPosts).toBe(0);
  });

  it("handles empty blog list", async () => {
    const deps: BlogSyncDeps = {
      fetchBlogList: vi.fn().mockResolvedValue([]),
      fetchBlogContent: vi.fn(),
      getIndexedBlogIds: vi.fn().mockResolvedValue(new Set()),
      uploadDocuments: vi.fn().mockResolvedValue({ succeeded: 0, failed: 0 }),
      trackSyncedUrl: vi.fn(),
    };

    const result = await syncBlogs(deps, mockContext());
    expect(result.newPosts).toBe(0);
    expect(result.docsUploaded).toBe(0);
  });
});
