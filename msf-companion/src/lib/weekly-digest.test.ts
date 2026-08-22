import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getFreshOfficialUpdates,
  hasUsefulWeeklyDigestContent,
  isUsefulDigestNotification,
  summarizeDigestRoster,
} from "./weekly-digest";

describe("weekly digest content", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses dated weekly and monthly baselines instead of an identical prior login", () => {
    const summary = summarizeDigestRoster(
      [
        {
          createdAt: "2026-08-22T12:00:00Z",
          snapshotData: [
            { name: "Iron Man", power: 1_200_000, yellowStars: 7 },
            { name: "Rescue", power: 800_000, yellowStars: 6 },
          ],
        },
        {
          createdAt: "2026-08-20T12:00:00Z",
          snapshotData: [
            { name: "Iron Man", power: 1_200_000, yellowStars: 7 },
            { name: "Rescue", power: 800_000, yellowStars: 6 },
          ],
        },
        {
          createdAt: "2026-08-15T10:00:00Z",
          snapshotData: [{ name: "Iron Man", power: 1_000_000, yellowStars: 7 }],
        },
        {
          createdAt: "2026-07-20T12:00:00Z",
          snapshotData: [{ name: "Iron Man", power: 800_000, yellowStars: 6 }],
        },
      ],
      new Date("2026-08-22T18:00:00Z")
    );

    expect(summary).toMatchObject({
      rosterSize: 2,
      totalPower: 2_000_000,
      averagePower: 1_000_000,
      sevenStarCharacters: 1,
      weekChange: {
        powerChange: 1_000_000,
        rosterChange: 1,
        baselineAt: "2026-08-15T10:00:00.000Z",
        elapsedDays: 7,
      },
      monthChange: {
        powerChange: 1_200_000,
        rosterChange: 1,
        baselineAt: "2026-07-20T12:00:00.000Z",
        elapsedDays: 33,
      },
      isStale: false,
    });
    expect(summary?.progress).toHaveLength(4);
    expect(summary?.progress.at(-1)).toMatchObject({
      snapshotAt: "2026-08-22T12:00:00.000Z",
      totalPower: 2_000_000,
    });
    expect(summary?.topCharacters[0]).toEqual({ name: "Iron Man", power: 1_200_000 });
  });

  it("rejects verification infrastructure as commander content", () => {
    const verification = {
      type: "test",
      title: "Email delivery verification",
      message: "This temporary alert verifies the weekly email delivery pipeline.",
    };
    expect(isUsefulDigestNotification(verification)).toBe(false);
    expect(
      hasUsefulWeeklyDigestContent({
        roster: null,
        officialUpdates: [],
        notifications: [verification].filter(isUsefulDigestNotification),
        advisorQuestions: 0,
      })
    ).toBe(false);
  });

  it("deduplicates and limits official updates to safe links", async () => {
    const originalEndpoint = process.env.AZURE_AI_SEARCH_ENDPOINT;
    const originalKey = process.env.AZURE_AI_SEARCH_KEY;
    process.env.AZURE_AI_SEARCH_ENDPOINT = "https://search.example.test";
    process.env.AZURE_AI_SEARCH_KEY = "test-key";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      value: [
        { sourceId: "1", sourceVideoTitle: "Weekly Blog", sourceUrl: "https://marvelstrikeforce.com/update/1", sourcePublishedAt: "2026-08-21T00:00:00Z" },
        { sourceId: "1", sourceVideoTitle: "Weekly Blog", sourceUrl: "https://marvelstrikeforce.com/update/1", sourcePublishedAt: "2026-08-21T00:00:00Z" },
        { sourceId: "2", sourceVideoTitle: "Unsafe", sourceUrl: "javascript:alert(1)", sourcePublishedAt: "2026-08-21T00:00:00Z" },
        { sourceId: "3", sourceVideoTitle: "Release Notes", sourceUrl: "https://marvelstrikeforce.com/update/3", sourcePublishedAt: "2026-08-20T00:00:00Z" },
      ],
    }), { status: 200 })));

    try {
      await expect(getFreshOfficialUpdates(new Date("2026-08-22T00:00:00Z"))).resolves.toEqual([
        { title: "Weekly Blog", url: "https://marvelstrikeforce.com/update/1", publishedAt: "2026-08-21T00:00:00.000Z" },
        { title: "Release Notes", url: "https://marvelstrikeforce.com/update/3", publishedAt: "2026-08-20T00:00:00.000Z" },
      ]);
      const requestBody = JSON.parse(String((vi.mocked(fetch).mock.calls[0][1] as RequestInit).body));
      expect(requestBody.filter).toContain("sourceType eq 'official-blog'");
      expect(requestBody.filter).toContain("sourcePublishedAt ge 2026-08-15T00:00:00.000Z");
    } finally {
      process.env.AZURE_AI_SEARCH_ENDPOINT = originalEndpoint;
      process.env.AZURE_AI_SEARCH_KEY = originalKey;
    }
  });
});
