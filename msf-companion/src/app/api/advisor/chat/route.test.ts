import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { getSession } from "@/lib/session";
import { getScopelyId } from "@/lib/scopely-id";
import { getSubscriptionTier } from "@/lib/subscription";
import { prisma } from "@/lib/prisma";
import { POST } from "./route";

vi.mock("@/lib/session", () => ({ getSession: vi.fn() }));
vi.mock("@/lib/scopely-id", () => ({ getScopelyId: vi.fn() }));
vi.mock("@/lib/subscription", () => ({ getSubscriptionTier: vi.fn() }));
vi.mock("@/lib/usage-tracking", () => ({ trackUsageEvent: vi.fn(() => Promise.resolve()) }));
vi.mock("@/lib/response-cache", () => ({
  getCachedResponse: vi.fn(() => Promise.resolve(null)),
  trackQuestionForCaching: vi.fn(() => Promise.resolve()),
}));
vi.mock("@/lib/advisor-classification", () => ({ classifyQuestion: vi.fn() }));
vi.mock("@/lib/question-router", () => ({
  classifyComplexity: vi.fn(),
  getModelForComplexity: vi.fn(),
}));
vi.mock("@/lib/gap-resolver", () => ({ checkAndResolveGaps: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getValidAccessTokenWithRefresh: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    commander: { findUnique: vi.fn(), updateMany: vi.fn() },
    advisorConversation: { findFirst: vi.fn() },
    dailyTokenUsage: { findUnique: vi.fn() },
  },
}));

function chatRequest(body: string) {
  return new NextRequest("http://localhost/api/advisor/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
}

describe("Advisor chat API access controls", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getSession).mockResolvedValue({ accessToken: "token" } as never);
    vi.mocked(getScopelyId).mockResolvedValue("scopely-1");
    vi.mocked(getSubscriptionTier).mockResolvedValue("PREMIUM");
    vi.mocked(prisma.commander.findUnique).mockResolvedValue({
      id: "commander-1",
      advisorQuestionsToday: 0,
      advisorQuestionsResetAt: null,
    } as never);
  });

  it("rejects a conversation that is not owned by the signed-in commander", async () => {
    vi.mocked(prisma.advisorConversation.findFirst).mockResolvedValue(null);

    const response = await POST(chatRequest(JSON.stringify({
      question: "What should I build?",
      conversationId: "someone-elses-conversation",
    })));

    expect(response.status).toBe(404);
    expect(prisma.advisorConversation.findFirst).toHaveBeenCalledWith({
      where: {
        id: "someone-elses-conversation",
        commanderId: "commander-1",
      },
      select: { id: true },
    });
  });

  it("does not let free users attach messages to any conversation ID", async () => {
    vi.mocked(getSubscriptionTier).mockResolvedValue("FREE");

    const response = await POST(chatRequest(JSON.stringify({
      question: "What should I build?",
      conversationId: "conversation-1",
    })));

    expect(response.status).toBe(403);
    expect(prisma.advisorConversation.findFirst).not.toHaveBeenCalled();
  });

  it("treats a null conversation ID as a fresh conversation", async () => {
    vi.mocked(prisma.dailyTokenUsage.findUnique).mockResolvedValue({
      tokensUsed: 50_000,
    } as never);

    const response = await POST(chatRequest(JSON.stringify({
      question: "What should I build?",
      conversationId: null,
    })));

    // Reaching the budget check proves the request passed ID validation. A
    // fresh chat must not perform an ownership lookup for an existing thread.
    expect(response.status).toBe(429);
    expect(prisma.advisorConversation.findFirst).not.toHaveBeenCalled();
  });

  it("returns 400 for malformed JSON and oversized questions", async () => {
    const malformed = await POST(chatRequest("{"));
    expect(malformed.status).toBe(400);

    const oversized = await POST(chatRequest(JSON.stringify({ question: "x".repeat(2001) })));
    expect(oversized.status).toBe(400);
    expect(getSubscriptionTier).not.toHaveBeenCalled();
  });
});
