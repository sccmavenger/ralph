import { describe, expect, it } from "vitest";
import { appendMarketingFooter, emailHtmlToText, escapeEmailHtml } from "./email-content";
import { buildWeeklyDigestHtml } from "./email-templates";

describe("email content safety", () => {
  it("escapes untrusted commander and content values", () => {
    const html = buildWeeklyDigestHtml({
      displayName: '<img src=x onerror="alert(1)">',
      roster: null,
      officialUpdates: [{
        title: "Invest <wisely>",
        url: "https://marvelstrikeforce.com/en/updates/a&b",
        publishedAt: "2026-08-22T00:00:00Z",
      }],
      notifications: [{ type: "test", title: "<script>x</script>", message: 'Use "care"' }],
      advisorQuestions: 2,
    });
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;wisely&gt;");
    expect(html).toContain("a&amp;b");
    expect(html).toContain("You asked 2 questions");
  });

  it("renders substantive roster progress instead of an empty shell", () => {
    const html = buildWeeklyDigestHtml({
      displayName: "Ironman2733",
      roster: {
        rosterSize: 368,
        totalPower: 188_200_000,
        averagePower: 511_500,
        sevenStarCharacters: 265,
        snapshotAt: "2026-08-22T00:00:00Z",
        weekChange: {
          powerChange: 84,
          rosterChange: 1,
          baselineAt: "2026-08-10T00:00:00Z",
          elapsedDays: 12,
        },
        monthChange: {
          powerChange: 1_434_183,
          rosterChange: 1,
          baselineAt: "2026-07-08T00:00:00Z",
          elapsedDays: 45,
        },
        progress: [
          { snapshotAt: "2026-07-08T00:00:00Z", totalPower: 186_765_817, rosterSize: 367 },
          { snapshotAt: "2026-08-10T00:00:00Z", totalPower: 188_199_916, rosterSize: 367 },
          { snapshotAt: "2026-08-22T00:00:00Z", totalPower: 188_200_000, rosterSize: 368 },
        ],
        topCharacters: [{ name: "Iron Man", power: 1_200_000 }],
        isStale: false,
      },
      officialUpdates: [],
      notifications: [],
      advisorQuestions: 0,
    });
    expect(html).toContain("188.2M");
    expect(html).toContain("368");
    expect(html).toContain("7+ day change");
    expect(html).toContain("+84 collection power");
    expect(html).toContain("30+ day change");
    expect(html).toContain("+1.4M collection power");
    expect(html).toContain("Collection power progression");
    expect(html).toContain("Bars use a relative scale");
    expect(html).toContain("Help shape MSF Companion");
    expect(html).toContain("feedback, praise, a feature suggestion");
    expect(html).toContain("https://discord.gg/2ptFQ2Vefk");
    expect(html).toContain("Join the Discord");
    expect(html).not.toContain("Since your previous snapshot");
    expect(html).toContain("Iron Man (1.2M)");
    expect(html).toContain("Open your dashboard");
  });

  it("describes a flat baseline clearly instead of emitting a cryptic zero delta", () => {
    const html = buildWeeklyDigestHtml({
      displayName: "Commander",
      roster: {
        rosterSize: 368,
        totalPower: 188_219_378,
        averagePower: 511_465,
        sevenStarCharacters: 265,
        snapshotAt: "2026-08-22T00:00:00Z",
        weekChange: {
          powerChange: 0,
          rosterChange: 0,
          baselineAt: "2026-08-15T00:00:00Z",
          elapsedDays: 7,
        },
        monthChange: null,
        progress: [],
        topCharacters: [],
        isStale: false,
      },
      officialUpdates: [],
      notifications: [],
      advisorQuestions: 0,
    });

    expect(html).toContain("No collection-power or roster-size change recorded");
    expect(html).not.toContain("0 collection power");
  });

  it("adds a category-specific management link and a readable text fallback", () => {
    const html = appendMarketingFooter(
      "<html><body><h1>Hello</h1><p>Roster update</p></body></html>",
      "https://example.test/unsubscribe",
      "weeklyDigest"
    );
    expect(html).toContain("Manage weekly digest");
    expect(html).toContain("https://example.test/unsubscribe");
    expect(emailHtmlToText(html)).toContain("Roster update");
    expect(escapeEmailHtml("A&B")).toBe("A&amp;B");
  });
});
