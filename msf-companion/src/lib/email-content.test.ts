import { describe, expect, it } from "vitest";
import { appendMarketingFooter, emailHtmlToText, escapeEmailHtml } from "./email-content";
import { buildWeeklyDigestHtml } from "./email-templates";

describe("email content safety", () => {
  it("escapes untrusted commander and content values", () => {
    const html = buildWeeklyDigestHtml({
      displayName: '<img src=x onerror="alert(1)">',
      tips: [{ content: "Invest <wisely>", sourceCreatorName: "A & B" }],
      notifications: [{ type: "test", title: "<script>x</script>", message: 'Use "care"' }],
    });
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;wisely&gt;");
    expect(html).toContain("A &amp; B");
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
