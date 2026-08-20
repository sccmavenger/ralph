import { beforeEach, describe, expect, it, vi } from "vitest";
import { getSession } from "@/lib/session";
import { getScopelyId } from "@/lib/scopely-id";
import { getSubscriptionTier } from "@/lib/subscription";
import { prisma } from "@/lib/prisma";
import { GET } from "./route";

vi.mock("@/lib/session", () => ({ getSession: vi.fn() }));
vi.mock("@/lib/scopely-id", () => ({ getScopelyId: vi.fn() }));
vi.mock("@/lib/subscription", () => ({ getSubscriptionTier: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    commander: { findUnique: vi.fn() },
    advisorConversation: { findFirst: vi.fn() },
  },
}));

describe("Advisor conversation detail API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getSession).mockResolvedValue({ accessToken: "token" } as never);
    vi.mocked(getScopelyId).mockResolvedValue("scopely-1");
    vi.mocked(getSubscriptionTier).mockResolvedValue("PREMIUM");
    vi.mocked(prisma.commander.findUnique).mockResolvedValue({ id: "commander-1" } as never);
  });

  it("scopes a lookup to the signed-in commander", async () => {
    vi.mocked(prisma.advisorConversation.findFirst).mockResolvedValue(null);

    const response = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ id: "someone-elses-conversation" }),
    });

    expect(response.status).toBe(404);
    expect(prisma.advisorConversation.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: "someone-elses-conversation",
          commanderId: "commander-1",
        },
      })
    );
  });

  it("rejects free-tier access even when a conversation ID is known", async () => {
    vi.mocked(getSubscriptionTier).mockResolvedValue("FREE");

    const response = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ id: "conversation-1" }),
    });

    expect(response.status).toBe(403);
    expect(prisma.advisorConversation.findFirst).not.toHaveBeenCalled();
  });
});
