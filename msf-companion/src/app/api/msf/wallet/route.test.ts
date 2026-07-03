import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetScopelyId = vi.fn();
const mockCommanderFindUnique = vi.fn();
const mockCommanderUpsert = vi.fn();
const mockGetWalletByCommanderId = vi.fn();
const mockUpsertWallet = vi.fn();

vi.mock("@/lib/scopely-id", () => ({
  getScopelyId: () => mockGetScopelyId(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    commander: {
      findUnique: (...args: unknown[]) => mockCommanderFindUnique(...args),
      upsert: (...args: unknown[]) => mockCommanderUpsert(...args),
    },
  },
}));

// Reuse the real validation logic; only mock persistence.
vi.mock("@/lib/wallet", async () => {
  const actual = await vi.importActual<typeof import("@/lib/wallet")>(
    "@/lib/wallet",
  );
  return {
    ...actual,
    getWalletByCommanderId: (...args: unknown[]) =>
      mockGetWalletByCommanderId(...args),
    upsertWallet: (...args: unknown[]) => mockUpsertWallet(...args),
  };
});

import { GET, PUT } from "./route";

function putRequest(body: unknown): Request {
  return new Request("http://localhost/api/msf/wallet", {
    method: "PUT",
    body: typeof body === "string" ? body : JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

describe("/api/msf/wallet", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // TC-002.1
  it("GET returns 401 when unauthenticated", async () => {
    mockGetScopelyId.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
    expect(mockGetWalletByCommanderId).not.toHaveBeenCalled();
  });

  // TC-002.2
  it("GET returns an explicit empty state (200) when no wallet exists", async () => {
    mockGetScopelyId.mockResolvedValue("scopely-a");
    mockCommanderFindUnique.mockResolvedValue({ id: "cmd-a" });
    mockGetWalletByCommanderId.mockResolvedValue(null);

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.exists).toBe(false);
    expect(body.gold).toBeNull();
    expect(body.cores).toBeNull();
  });

  it("GET returns empty state when the commander row does not exist yet", async () => {
    mockGetScopelyId.mockResolvedValue("scopely-new");
    mockCommanderFindUnique.mockResolvedValue(null);

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.exists).toBe(false);
    expect(mockGetWalletByCommanderId).not.toHaveBeenCalled();
  });

  // TC-002.3 (route half of the round-trip)
  it("GET returns the saved wallet values", async () => {
    mockGetScopelyId.mockResolvedValue("scopely-a");
    mockCommanderFindUnique.mockResolvedValue({ id: "cmd-a" });
    mockGetWalletByCommanderId.mockResolvedValue({
      commanderId: "cmd-a",
      gold: 1840000,
      cores: 6120,
      confirmedAt: new Date("2026-01-01T00:00:00.000Z"),
    });

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      exists: true,
      gold: 1840000,
      cores: 6120,
      confirmedAt: "2026-01-01T00:00:00.000Z",
    });
  });

  // TC-002.4
  it("PUT returns 401 when unauthenticated and persists nothing", async () => {
    mockGetScopelyId.mockResolvedValue(null);
    const res = await PUT(putRequest({ gold: 1, cores: 1 }));
    expect(res.status).toBe(401);
    expect(mockUpsertWallet).not.toHaveBeenCalled();
    expect(mockCommanderUpsert).not.toHaveBeenCalled();
  });

  // TC-002.3 (PUT half): returns 200 with saved values and a fresh confirmedAt
  it("PUT persists valid input and returns the saved wallet", async () => {
    mockGetScopelyId.mockResolvedValue("scopely-a");
    mockCommanderUpsert.mockResolvedValue({ id: "cmd-a" });
    const confirmedAt = new Date();
    mockUpsertWallet.mockResolvedValue({
      commanderId: "cmd-a",
      gold: 1840000,
      cores: 6120,
      confirmedAt,
    });

    const res = await PUT(putRequest({ gold: 1840000, cores: 6120 }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ exists: true, gold: 1840000, cores: 6120 });
    expect(body.confirmedAt).toBe(confirmedAt.toISOString());
    expect(mockUpsertWallet).toHaveBeenCalledWith("cmd-a", {
      gold: 1840000,
      cores: 6120,
    });
  });

  // TC-002.5
  it("PUT returns 400 on invalid input and does not touch persistence", async () => {
    mockGetScopelyId.mockResolvedValue("scopely-a");

    const res = await PUT(putRequest({ gold: -5, cores: "abc" }));
    expect(res.status).toBe(400);
    expect(mockUpsertWallet).not.toHaveBeenCalled();
    expect(mockCommanderUpsert).not.toHaveBeenCalled();
  });

  it("PUT returns 400 on malformed JSON body", async () => {
    mockGetScopelyId.mockResolvedValue("scopely-a");

    const res = await PUT(putRequest("{ not json"));
    expect(res.status).toBe(400);
    expect(mockUpsertWallet).not.toHaveBeenCalled();
  });

  // TC-002.6
  it("PUT/GET are scoped to the authenticated account only", async () => {
    // Account B authenticates and writes — must only touch B's own row.
    mockGetScopelyId.mockResolvedValue("scopely-b");
    mockCommanderUpsert.mockResolvedValue({ id: "cmd-b" });
    mockUpsertWallet.mockResolvedValue({
      commanderId: "cmd-b",
      gold: 10,
      cores: 20,
      confirmedAt: new Date(),
    });

    await PUT(putRequest({ gold: 10, cores: 20 }));

    expect(mockCommanderUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { scopelyId: "scopely-b" } }),
    );
    expect(mockUpsertWallet).toHaveBeenCalledWith("cmd-b", {
      gold: 10,
      cores: 20,
    });
    // Never resolves another account's commander.
    expect(mockUpsertWallet).not.toHaveBeenCalledWith(
      "cmd-a",
      expect.anything(),
    );
  });
});
