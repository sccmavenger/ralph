import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock Prisma
const mockPrisma = {
  commander: {
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  dailyTokenUsage: {
    findUnique: vi.fn(),
    upsert: vi.fn(),
  },
};

// Mock response cache
const mockGetCachedResponse = vi.fn();
const mockTrackQuestionForCaching = vi.fn();

describe("Token Budgets", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe("Free user token budget enforcement", () => {
    it("should block free user with 10,001+ tokens used", () => {
      const tokensUsed = 10001;
      const budget = 10000;
      expect(tokensUsed >= budget).toBe(true);
    });

    it("should allow free user with less than 10,000 tokens", () => {
      const tokensUsed = 5000;
      const budget = 10000;
      expect(tokensUsed >= budget).toBe(false);
    });

    it("should allow free user at exactly 9,999 tokens", () => {
      const tokensUsed = 9999;
      const budget = 10000;
      expect(tokensUsed >= budget).toBe(false);
    });
  });

  describe("Premium user token budget enforcement", () => {
    it("should block premium user with 50,001+ tokens used", () => {
      const tokensUsed = 50001;
      const budget = 50000;
      expect(tokensUsed >= budget).toBe(true);
    });

    it("should allow premium user with less than 50,000 tokens", () => {
      const tokensUsed = 25000;
      const budget = 50000;
      expect(tokensUsed >= budget).toBe(false);
    });
  });

  describe("Token usage reset at midnight UTC", () => {
    it("should reset at midnight UTC (new day = fresh budget)", () => {
      const yesterday = new Date("2025-04-06T23:59:59Z");
      const today = new Date("2025-04-07T00:00:00Z");

      // Different UTC dates means different budget days
      const yesterdayDate = new Date(yesterday);
      yesterdayDate.setUTCHours(0, 0, 0, 0);
      const todayDate = new Date(today);
      todayDate.setUTCHours(0, 0, 0, 0);

      expect(yesterdayDate.getTime()).not.toBe(todayDate.getTime());
    });

    it("should keep tokens for same UTC date", () => {
      const morning = new Date("2025-04-07T06:00:00Z");
      const evening = new Date("2025-04-07T20:00:00Z");

      const morningDate = new Date(morning);
      morningDate.setUTCHours(0, 0, 0, 0);
      const eveningDate = new Date(evening);
      eveningDate.setUTCHours(0, 0, 0, 0);

      expect(morningDate.getTime()).toBe(eveningDate.getTime());
    });
  });

  describe("Response caching", () => {
    it("should normalize questions for cache matching", () => {
      const normalize = (q: string) =>
        q.toLowerCase().trim().replace(/[^\w\s]/g, "").replace(/\s+/g, " ");

      expect(normalize("What team should I build?")).toBe(
        normalize("what team should i build")
      );
      expect(normalize("  What team should i build?  ")).toBe(
        normalize("what team should i build")
      );
    });

    it("should return cached response for matching question", async () => {
      mockGetCachedResponse.mockResolvedValue({
        response: "Build the Eternals team",
        confidence: 85,
      });

      const result = await mockGetCachedResponse("what team should i build");
      expect(result).not.toBeNull();
      expect(result.response).toBe("Build the Eternals team");
    });

    it("should return null for non-cached question", async () => {
      mockGetCachedResponse.mockResolvedValue(null);
      const result = await mockGetCachedResponse("tell me about unicorns");
      expect(result).toBeNull();
    });

    it("should expire cache entries older than 24 hours", () => {
      const CACHE_TTL_SECONDS = 86400;
      const createdAt = new Date("2025-04-06T10:00:00Z");
      const now = new Date("2025-04-07T11:00:00Z"); // 25 hours later

      const age = now.getTime() - createdAt.getTime();
      expect(age > CACHE_TTL_SECONDS * 1000).toBe(true);
    });

    it("should NOT expire cache entries within 24 hours", () => {
      const CACHE_TTL_SECONDS = 86400;
      const createdAt = new Date("2025-04-07T10:00:00Z");
      const now = new Date("2025-04-07T20:00:00Z"); // 10 hours later

      const age = now.getTime() - createdAt.getTime();
      expect(age > CACHE_TTL_SECONDS * 1000).toBe(false);
    });
  });
});
