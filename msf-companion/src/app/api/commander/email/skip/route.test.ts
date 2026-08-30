import { beforeEach, describe, expect, it, vi } from "vitest";
import { getSession } from "@/lib/session";
import { getScopelyId } from "@/lib/scopely-id";
import { prisma } from "@/lib/prisma";
import { POST } from "./route";

vi.mock("@/lib/session", () => ({ getSession: vi.fn() }));
vi.mock("@/lib/scopely-id", () => ({ getScopelyId: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    commander: { upsert: vi.fn() },
  },
}));

describe("POST /api/commander/email/skip", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects unauthenticated requests without changing prompt state", async () => {
    const save = vi.fn();
    vi.mocked(getScopelyId).mockResolvedValue(null);
    vi.mocked(getSession).mockResolvedValue({ save } as never);

    const response = await POST();

    expect(response.status).toBe(401);
    expect(prisma.commander.upsert).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  });

  it("dismisses the prompt only for the current authenticated session", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const session = {
      accessToken: "token",
      scopelyId: "scopely-1",
      emailPromptRequired: true,
      save,
    };
    vi.mocked(getScopelyId).mockResolvedValue("scopely-1");
    vi.mocked(getSession).mockResolvedValue(session as never);
    vi.mocked(prisma.commander.upsert).mockResolvedValue({} as never);

    const response = await POST();

    expect(response.status).toBe(200);
    expect(prisma.commander.upsert).toHaveBeenCalledWith({
      where: { scopelyId: "scopely-1" },
      create: {
        scopelyId: "scopely-1",
        emailPromptSkippedAt: expect.any(Date),
      },
      update: { emailPromptSkippedAt: expect.any(Date) },
    });
    expect(session.emailPromptRequired).toBe(false);
    expect(save).toHaveBeenCalledOnce();
  });
});
