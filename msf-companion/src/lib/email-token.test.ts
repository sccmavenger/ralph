import { afterEach, describe, expect, it, vi } from "vitest";
import { createUnsubscribeToken, unsubscribeUrl, verifyUnsubscribeToken } from "./email-token";

describe("signed email unsubscribe tokens", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("round-trips an authorized category without exposing an email address", () => {
    vi.stubEnv("EMAIL_UNSUBSCRIBE_SECRET", "test-secret-with-enough-entropy");
    const token = createUnsubscribeToken("commander-123", "weeklyDigest");
    expect(verifyUnsubscribeToken(token)).toEqual({
      v: 1,
      commanderId: "commander-123",
      preference: "weeklyDigest",
    });
    expect(token).not.toContain("commander@example.com");
  });

  it("rejects a tampered token", () => {
    vi.stubEnv("EMAIL_UNSUBSCRIBE_SECRET", "test-secret-with-enough-entropy");
    const token = createUnsubscribeToken("commander-123", "all");
    expect(verifyUnsubscribeToken(`${token.slice(0, -1)}x`)).toBeNull();
  });

  it("builds a URL on the configured application origin", () => {
    vi.stubEnv("EMAIL_UNSUBSCRIBE_SECRET", "test-secret-with-enough-entropy");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://example.test");
    expect(unsubscribeUrl("commander-123", "announcements")).toMatch(
      /^https:\/\/example\.test\/api\/email\/unsubscribe\?token=/
    );
  });
});
