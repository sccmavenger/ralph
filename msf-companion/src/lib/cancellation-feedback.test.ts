import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CANCELLATION_FEEDBACK_REASONS,
  CANCELLATION_FEEDBACK_TOKEN_TTL_SECONDS,
  cancellationFeedbackUrl,
  createCancellationFeedbackToken,
  verifyCancellationFeedbackToken,
} from "./cancellation-feedback";

const NOW = new Date("2026-08-30T12:00:00.000Z");

describe("signed cancellation feedback tokens", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("round-trips a case and preselected reason with a default 30-day expiry", () => {
    vi.stubEnv("EMAIL_FEEDBACK_SECRET", "test-feedback-secret-with-enough-entropy");
    const token = createCancellationFeedbackToken({
      commanderId: "commander-123",
      caseId: "case-456",
      reason: "missing_something",
    }, NOW);

    expect(verifyCancellationFeedbackToken(token, NOW)).toEqual({
      v: 1,
      commanderId: "commander-123",
      caseId: "case-456",
      reason: "missing_something",
      exp: Math.floor(NOW.getTime() / 1000) + CANCELLATION_FEEDBACK_TOKEN_TTL_SECONDS,
    });
    expect(token).not.toContain("commander@example.com");
  });

  it("rejects tampered, expired, malformed, and unknown-reason tokens", () => {
    vi.stubEnv("EMAIL_FEEDBACK_SECRET", "test-feedback-secret-with-enough-entropy");
    const expiresAt = new Date("2026-08-30T12:01:00.000Z");
    const token = createCancellationFeedbackToken({
      commanderId: "commander-123",
      caseId: "case-456",
      expiresAt,
    }, NOW);

    expect(verifyCancellationFeedbackToken(`${token.slice(0, -1)}x`, NOW)).toBeNull();
    expect(verifyCancellationFeedbackToken(token, expiresAt)).toBeNull();
    expect(verifyCancellationFeedbackToken("malformed", NOW)).toBeNull();
    expect(() => createCancellationFeedbackToken({
      commanderId: "commander-123",
      caseId: "case-456",
      reason: "unknown" as never,
    }, NOW)).toThrow("reason is invalid");
  });

  it("uses the unsubscribe secret as a safe fallback and fails closed without a secret", () => {
    vi.stubEnv("EMAIL_FEEDBACK_SECRET", "");
    vi.stubEnv("EMAIL_UNSUBSCRIBE_SECRET", "shared-email-secret-with-enough-entropy");
    vi.stubEnv("SESSION_SECRET", "");
    const token = createCancellationFeedbackToken({
      commanderId: "commander-123",
      caseId: "case-456",
    }, NOW);
    expect(verifyCancellationFeedbackToken(token, NOW)?.caseId).toBe("case-456");

    vi.stubEnv("EMAIL_UNSUBSCRIBE_SECRET", "");
    expect(() => createCancellationFeedbackToken({
      commanderId: "commander-123",
      caseId: "case-456",
    }, NOW)).toThrow("must be configured");
  });

  it("builds a GET-only preselection URL on the configured application origin", () => {
    vi.stubEnv("EMAIL_FEEDBACK_SECRET", "test-feedback-secret-with-enough-entropy");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://example.test/base");
    const url = new URL(cancellationFeedbackUrl({
      commanderId: "commander-123",
      caseId: "case-456",
      reason: "confusing_or_broken",
    }, NOW));

    expect(url.origin).toBe("https://example.test");
    expect(url.pathname).toBe("/feedback/cancellation");
    expect([...url.searchParams.keys()]).toEqual(["token"]);
    expect(verifyCancellationFeedbackToken(url.searchParams.get("token")!, NOW)?.reason)
      .toBe("confusing_or_broken");
  });

  it("publishes the approved six reusable reason labels", () => {
    expect(CANCELLATION_FEEDBACK_REASONS.map(({ number, label }) => `${number} — ${label}`))
      .toEqual([
        "1 — I wasn’t using it enough",
        "2 — The price didn’t match the value",
        "3 — It was missing something I needed",
        "4 — Something was confusing or didn’t work well",
        "5 — My needs changed",
        "6 — Something else",
      ]);
  });
});
