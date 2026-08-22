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
        powerChange: 2_400_000,
        rosterChange: 1,
        topCharacters: [{ name: "Iron Man", power: 1_200_000 }],
        isStale: false,
      },
      officialUpdates: [],
      notifications: [],
      advisorQuestions: 0,
    });
    expect(html).toContain("188.2M");
    expect(html).toContain("368");
    expect(html).toContain("+2.4M collection power");
    expect(html).toContain("Iron Man (1.2M)");
    expect(html).toContain("Open your dashboard");
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
