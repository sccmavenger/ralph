import { describe, expect, it } from "vitest";
import { parseTrackedPagePath } from "./usage-track-validation";

describe("parseTrackedPagePath", () => {
  it.each([
    "/",
    "/dashboard",
    "/dashboard/daily-briefing",
    "/analyze/tower-planner",
    "/heroes/character-123",
  ])("accepts an application pathname: %s", (pathname) => {
    expect(parseTrackedPagePath(pathname)).toBe(pathname);
  });

  it.each([
    ["non-string", 42],
    ["empty", ""],
    ["relative", "dashboard"],
    ["protocol relative", "//example.com/path"],
    ["absolute URL", "https://example.com/dashboard"],
    ["query string", "/dashboard?tab=one"],
    ["fragment", "/dashboard#section"],
    ["backslash", "/dashboard\\admin"],
    ["surrounding whitespace", " /dashboard"],
    ["traversal", "/dashboard/../admin/users"],
    ["encoded traversal", "/dashboard/%2e%2e/admin/users"],
    ["API root", "/api"],
    ["API route", "/api/advisor/chat"],
    ["admin root", "/admin"],
    ["admin route", "/admin/ai-dashboard"],
    ["control character", "/dashboard\nother"],
    ["over limit", `/${"a".repeat(512)}`],
  ])("rejects %s", (_label, value) => {
    expect(parseTrackedPagePath(value)).toBeNull();
  });
});
