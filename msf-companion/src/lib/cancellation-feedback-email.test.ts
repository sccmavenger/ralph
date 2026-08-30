import { describe, expect, it } from "vitest";
import {
  CANCELLATION_FEEDBACK_REASONS,
  type CancellationFeedbackReason,
} from "./cancellation-feedback";
import {
  CANCELLATION_FEEDBACK_EMAIL_SUBJECT,
  buildCancellationFeedbackEmailHtml,
} from "./cancellation-feedback-email";

function reasonUrls(): Record<CancellationFeedbackReason, string> {
  return Object.fromEntries(
    CANCELLATION_FEEDBACK_REASONS.map(({ id }) => [
      id,
      `https://example.test/feedback/cancellation?token=${id}&source=email`,
    ])
  ) as Record<CancellationFeedbackReason, string>;
}

describe("cancellation feedback email", () => {
  it("renders the approved, reply-friendly copy and all six linked reasons", () => {
    const html = buildCancellationFeedbackEmailHtml({
      displayName: "Ironman2733",
      reasonUrls: reasonUrls(),
    });

    expect(CANCELLATION_FEEDBACK_EMAIL_SUBJECT)
      .toBe("What could The MSF Toolkit do better?");
    expect(html).toContain("Hey Ironman2733,");
    expect(html).toContain("Just hit Reply and tell me in your own words");
    expect(html).toContain("One sentence is plenty");
    expect(html).toContain("reply with a number");
    expect(html).toContain("I’m not writing to pitch you or ask you to reconsider");
    expect(html).not.toContain("resubscribe");
    expect(html).not.toContain("Review Premium");

    for (const { id, number, label } of CANCELLATION_FEEDBACK_REASONS) {
      expect(html).toContain(`>${number}</td>`);
      expect(html).toContain(label);
      expect(html).toContain(`token=${id}&amp;source=email`);
    }
  });

  it("escapes the commander name and every generated link", () => {
    const urls = reasonUrls();
    urls.something_else = 'https://example.test/feedback?token=" onmouseover="alert(1)';
    const html = buildCancellationFeedbackEmailHtml({
      displayName: '<img src=x onerror="alert(1)">',
      reasonUrls: urls,
    });

    expect(html).not.toContain("<img src=x");
    expect(html).not.toContain('href="https://example.test/feedback?token=" onmouseover=');
    expect(html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
    expect(html).toContain("token=&quot; onmouseover=&quot;alert(1)");
  });
});
