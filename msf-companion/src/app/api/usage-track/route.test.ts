import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetSession = vi.fn();
const mockTrackUsageEvent = vi.fn();

vi.mock("@/lib/session", () => ({
  getSession: () => mockGetSession(),
}));

vi.mock("@/lib/usage-tracking", () => ({
  trackUsageEvent: (...args: unknown[]) => mockTrackUsageEvent(...args),
}));

import { POST } from "./route";

function request(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/usage-track", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/usage-track", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue({ scopelyId: "scopely-1" });
    mockTrackUsageEvent.mockResolvedValue(undefined);
  });

  it("records a strictly validated page view", async () => {
    const response = await POST(request({ page: "/analyze/tower-planner" }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(mockTrackUsageEvent).toHaveBeenCalledWith(
      "scopely-1",
      "page_view",
      "/analyze/tower-planner",
    );
  });

  it("retains feature tracking and metadata", async () => {
    const metadata = { source: "planner", count: 2 };
    await POST(request({ feature: "team_builder_use", metadata }));

    expect(mockTrackUsageEvent).toHaveBeenCalledWith(
      "scopely-1",
      "feature_use",
      "team_builder_use",
      metadata,
    );
  });

  it.each([
    "/dashboard?tab=offers",
    "//example.com/dashboard",
    "/api/advisor/chat",
    "/admin/ai-dashboard",
    "/dashboard/../admin",
  ])("silently ignores an invalid page pathname: %s", async (page) => {
    const response = await POST(request({ page }));

    expect(response.status).toBe(200);
    expect(mockTrackUsageEvent).not.toHaveBeenCalled();
  });

  it("ignores an ambiguous page and feature payload", async () => {
    await POST(request({ page: "/dashboard", feature: "spoofed" }));

    expect(mockTrackUsageEvent).not.toHaveBeenCalled();
  });

  it("silently ignores unauthenticated requests", async () => {
    mockGetSession.mockResolvedValue({});

    await POST(request({ page: "/dashboard" }));

    expect(mockTrackUsageEvent).not.toHaveBeenCalled();
  });

  it("silently ignores malformed JSON", async () => {
    const malformed = new NextRequest("http://localhost/api/usage-track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{",
    });

    const response = await POST(malformed);

    expect(response.status).toBe(200);
    expect(mockTrackUsageEvent).not.toHaveBeenCalled();
  });
});
