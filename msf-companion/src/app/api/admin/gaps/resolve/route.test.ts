import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockGetAdminSession = vi.fn();
const mockGapFindUnique = vi.fn();
const mockGapUpdate = vi.fn();
const mockActionUpdateMany = vi.fn();
const mockTransaction = vi.fn();

vi.mock("@/lib/admin-session", () => ({
  getAdminSession: () => mockGetAdminSession(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    knowledgeGap: {
      findUnique: (...args: unknown[]) => mockGapFindUnique(...args),
      update: (...args: unknown[]) => mockGapUpdate(...args),
    },
    aiActionItem: {
      updateMany: (...args: unknown[]) => mockActionUpdateMany(...args),
    },
    $transaction: (...args: unknown[]) => mockTransaction(...args),
  },
}));

import { POST } from "./route";

function request(body: unknown) {
  return new NextRequest("http://localhost/api/admin/gaps/resolve", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/admin/gaps/resolve", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGapUpdate.mockReturnValue(Promise.resolve({ id: "gap-1", status: "resolved" }));
    mockActionUpdateMany.mockReturnValue(Promise.resolve({ count: 1 }));
    mockTransaction.mockResolvedValue([
      { id: "gap-1", status: "resolved" },
      { count: 1 },
    ]);
  });

  it("requires an admin session", async () => {
    mockGetAdminSession.mockResolvedValue({ isAdmin: false });

    const response = await POST(request({ gapId: "gap-1" }));

    expect(response.status).toBe(401);
    expect(mockGapFindUnique).not.toHaveBeenCalled();
  });

  it("rejects a missing gap id", async () => {
    mockGetAdminSession.mockResolvedValue({ isAdmin: true });

    const response = await POST(request({}));

    expect(response.status).toBe(400);
    expect(mockGapFindUnique).not.toHaveBeenCalled();
  });

  it("rejects missing and already-resolved gaps", async () => {
    mockGetAdminSession.mockResolvedValue({ isAdmin: true });
    mockGapFindUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({
      id: "gap-1",
      status: "resolved",
    });

    const missing = await POST(request({ gapId: "missing" }));
    const resolved = await POST(request({ gapId: "gap-1" }));

    expect(missing.status).toBe(404);
    expect(resolved.status).toBe(400);
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("atomically resolves the gap and completes its active action", async () => {
    mockGetAdminSession.mockResolvedValue({ isAdmin: true });
    mockGapFindUnique.mockResolvedValue({ id: "gap-1", status: "open" });

    const response = await POST(request({ gapId: "gap-1" }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      gap: { id: "gap-1", status: "resolved" },
      completedActionCount: 1,
    });
    expect(mockGapUpdate).toHaveBeenCalledWith({
      where: { id: "gap-1" },
      data: expect.objectContaining({
        status: "resolved",
        autoResolveAction: "Manually resolved by admin",
        resolvedAt: expect.any(Date),
      }),
    });
    expect(mockActionUpdateMany).toHaveBeenCalledWith({
      where: {
        sourceType: "knowledge_gap",
        sourceId: "gap-1",
        status: { in: ["open", "investigating", "planned"] },
      },
      data: {
        status: "completed",
        completedAt: expect.any(Date),
      },
    });
  });
});
