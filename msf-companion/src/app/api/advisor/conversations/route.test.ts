import { beforeEach, describe, expect, it, vi } from "vitest";
import { getSession } from "@/lib/session";
import { getScopelyId } from "@/lib/scopely-id";
import { getSubscriptionTier } from "@/lib/subscription";
import { prisma } from "@/lib/prisma";
import { GET, POST } from "./route";

vi.mock("@/lib/session", () => ({ getSession: vi.fn() }));
vi.mock("@/lib/scopely-id", () => ({ getScopelyId: vi.fn() }));
vi.mock("@/lib/subscription", () => ({ getSubscriptionTier: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    commander: { findUnique: vi.fn() },
    advisorConversation: { findMany: vi.fn(), create: vi.fn() },
  },
}));

describe("Advisor conversations API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getSession).mockResolvedValue({ accessToken: "token" } as never);
    vi.mocked(getScopelyId).mockResolvedValue("scopely-1");
    vi.mocked(getSubscriptionTier).mockResolvedValue("PREMIUM");
    vi.mocked(prisma.commander.findUnique).mockResolvedValue({ id: "commander-1" } as never);
  });

  it("rejects direct conversation-memory access from a free account", async () => {
    vi.mocked(getSubscriptionTier).mockResolvedValue("FREE");

    const response = await GET();

    expect(response.status).toBe(403);
    expect(prisma.advisorConversation.findMany).not.toHaveBeenCalled();
  });

  it("lists only the signed-in commander's conversations", async () => {
    vi.mocked(prisma.advisorConversation.findMany).mockResolvedValue([]);

    const response = await GET();

    expect(response.status).toBe(200);
    expect(prisma.advisorConversation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { commanderId: "commander-1" } })
    );
  });

  it("validates and caps conversation titles", async () => {
    vi.mocked(prisma.advisorConversation.create).mockResolvedValue({
      id: "conversation-1",
      title: "x".repeat(80),
      createdAt: new Date(),
    } as never);

    const response = await POST(
      new Request("http://localhost/api/advisor/conversations", {
        method: "POST",
        body: JSON.stringify({ title: `  ${"x".repeat(100)}  ` }),
      })
    );

    expect(response.status).toBe(201);
    expect(prisma.advisorConversation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { commanderId: "commander-1", title: "x".repeat(80) },
      })
    );
  });
});
