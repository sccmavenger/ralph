import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { getSession } from "@/lib/session";
import { getScopelyId } from "@/lib/scopely-id";
import { prisma } from "@/lib/prisma";
import { PATCH } from "./route";

vi.mock("@/lib/session", () => ({ getSession: vi.fn() }));
vi.mock("@/lib/scopely-id", () => ({ getScopelyId: vi.fn() }));
vi.mock("@/lib/gap-resolver", () => ({ processNegativeFeedback: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    commander: { findUnique: vi.fn() },
    advisorMessage: {
      findUnique: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));

function feedbackRequest(body: unknown) {
  return new NextRequest("http://localhost/api/advisor/feedback", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("Advisor feedback API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getSession).mockResolvedValue({ accessToken: "token" } as never);
    vi.mocked(getScopelyId).mockResolvedValue("scopely-1");
    vi.mocked(prisma.commander.findUnique).mockResolvedValue({ id: "commander-1" } as never);
  });

  it("does not expose or update another commander's message", async () => {
    vi.mocked(prisma.advisorMessage.findUnique).mockResolvedValue({
      id: "message-1",
      role: "assistant",
      conversation: { commanderId: "commander-2" },
    } as never);

    const response = await PATCH(feedbackRequest({ messageId: "message-1", rating: "positive" }));

    expect(response.status).toBe(404);
    expect(prisma.advisorMessage.update).not.toHaveBeenCalled();
  });

  it("trims and caps feedback comments", async () => {
    vi.mocked(prisma.advisorMessage.findUnique).mockResolvedValue({
      id: "message-1",
      role: "assistant",
      conversationId: "conversation-1",
      createdAt: new Date(),
      conversation: { commanderId: "commander-1" },
    } as never);
    vi.mocked(prisma.advisorMessage.update).mockResolvedValue({
      id: "message-1",
      feedback: "positive",
      feedbackComment: "x".repeat(1000),
    } as never);

    const response = await PATCH(feedbackRequest({
      messageId: "message-1",
      rating: "positive",
      comment: `  ${"x".repeat(1100)}  `,
    }));

    expect(response.status).toBe(200);
    expect(prisma.advisorMessage.update).toHaveBeenCalledWith({
      where: { id: "message-1" },
      data: { feedback: "positive", feedbackComment: "x".repeat(1000) },
    });
  });
});
