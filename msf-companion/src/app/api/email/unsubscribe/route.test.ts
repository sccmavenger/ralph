import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockCommanderUpdate = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: { commander: { updateMany: (...args: unknown[]) => mockCommanderUpdate(...args) } },
}));

import { createUnsubscribeToken } from "@/lib/email-token";
import { GET, POST } from "./route";

describe("/api/email/unsubscribe", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("EMAIL_UNSUBSCRIBE_SECRET", "test-secret-with-enough-entropy");
    mockCommanderUpdate.mockResolvedValue({ id: "commander-1" });
  });

  it("GET only renders confirmation and never mutates preferences", async () => {
    const token = createUnsubscribeToken("commander-1", "weeklyDigest");
    const response = await GET(new NextRequest(`http://localhost/api/email/unsubscribe?token=${token}`));
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("Confirm unsubscribe");
    expect(mockCommanderUpdate).not.toHaveBeenCalled();
  });

  it("POST disables only the signed category", async () => {
    const token = createUnsubscribeToken("commander-1", "newCharacters");
    const response = await POST(new NextRequest(`http://localhost/api/email/unsubscribe?token=${token}`, { method: "POST" }));
    expect(response.status).toBe(200);
    expect(mockCommanderUpdate).toHaveBeenCalledWith({
      where: { id: "commander-1" },
      data: { emailNewCharacters: false },
    });
  });

  it("rejects a forged token", async () => {
    const response = await POST(new NextRequest("http://localhost/api/email/unsubscribe?token=forged", { method: "POST" }));
    expect(response.status).toBe(400);
    expect(mockCommanderUpdate).not.toHaveBeenCalled();
  });
});
