import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getToken, getTier, fetchMsf } = vi.hoisted(() => ({
  getToken: vi.fn(),
  getTier: vi.fn(),
  fetchMsf: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ getValidAccessTokenWithRefresh: getToken }));
vi.mock("@/lib/subscription", () => ({
  getSubscriptionTier: getTier,
  isPremium: (tier: string) => tier === "PREMIUM",
}));
vi.mock("@/lib/msf-api", () => ({ msfApiFetch: fetchMsf }));

import { GET } from "./route";

const pageOfItems = (count: number, offset = 0) =>
  Array.from({ length: count }, (_, index) => ({
    item: { id: `gear-${offset + index}`, name: `Gear ${offset + index}`, tier: 16 },
    quantity: index,
  }));

describe("GET /api/msf/inventory", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    getToken.mockResolvedValue("unit-test-token");
    getTier.mockResolvedValue("PREMIUM");
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => vi.restoreAllMocks());

  it("retains authentication before any inventory fetch", async () => {
    getToken.mockResolvedValue(null);
    const response = await GET();
    expect(response.status).toBe(401);
    expect(getTier).not.toHaveBeenCalled();
    expect(fetchMsf).not.toHaveBeenCalled();
  });

  it("retains the Premium gate", async () => {
    getTier.mockResolvedValue("FREE");
    const response = await GET();
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: "PREMIUM_REQUIRED", retryable: false });
    expect(fetchMsf).not.toHaveBeenCalled();
  });

  it("requests named integer inventory in bounded sequential pages", async () => {
    let firstPageFinished = false;
    fetchMsf.mockImplementation(async ({ params }: { params: { page: string } }) => {
      if (params.page === "1") {
        await Promise.resolve();
        firstPageFinished = true;
        return { data: pageOfItems(50), meta: { page: 1, perPage: 50, perTotal: 53 } };
      }
      expect(firstPageFinished).toBe(true);
      return { data: pageOfItems(3, 50), meta: { page: 2, perPage: 50, perTotal: 53 } };
    });
    const response = await GET();
    expect(response.status).toBe(200);
    expect((await response.json()).data).toHaveLength(53);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(fetchMsf).toHaveBeenNthCalledWith(1, {
      path: "/player/v1/inventory",
      accessToken: "unit-test-token",
      params: { itemFormat: "object", quantityFormat: "int", lang: "en", page: "1", perPage: "50" },
    });
    expect(fetchMsf.mock.calls[1][0].params.page).toBe("2");
  });

  it("continues past a full page when upstream omits pagination metadata", async () => {
    fetchMsf.mockResolvedValueOnce({ data: pageOfItems(50) }).mockResolvedValueOnce({ data: pageOfItems(2, 50) });
    const response = await GET();
    expect(response.status).toBe(200);
    expect((await response.json()).data).toHaveLength(52);
    expect(fetchMsf).toHaveBeenCalledTimes(2);
  });

  it("accepts a genuinely empty inventory", async () => {
    fetchMsf.mockResolvedValue({ data: [], meta: { perTotal: 0 } });
    const response = await GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: [] });
  });

  it("preserves metadata and distinguishes unavailable quantities from explicit zero", async () => {
    fetchMsf.mockResolvedValue({ data: [
      { item: { id: "a", name: "Named item", icon: "https://assets.example.com/a.png" }, quantity: 0 },
      { item: { id: "b" } },
      { item: "c", quantity: null },
    ] });
    const response = await GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: [
      { id: "a", name: "Named item", icon: "https://assets.example.com/a.png", quantity: 0, category: "Other" },
      { id: "b", quantity: null, category: "Other" },
      { id: "c", quantity: null, category: "Other" },
    ] });
  });

  it("keeps real category distinctions and gives ISO metadata priority over a tier", async () => {
    const entries = [
      { id: "Gear", tier: 16 },
      { id: "Shard", characterId: "character" },
      { id: "AbilityMaterial" },
      { id: "TrainingModule" },
      { id: "ISO8Crystal", tier: 3 },
      { id: "Orb", name: "Gold Orb", isOrb: true },
      { id: "SC" },
      { id: "PC" },
      { id: "Unknown" },
    ];
    fetchMsf.mockResolvedValue({ data: entries.map((item) => ({ item, quantity: 1 })) });
    const response = await GET();
    expect(response.status).toBe(200);
    expect((await response.json()).data.map((item: { category: string }) => item.category)).toEqual([
      "Gear", "Shards", "Ability Materials", "Training Materials", "ISO-8 Items", "Orbs", "Currency", "Currency", "Other",
    ]);
  });

  it("does not expose unsafe image schemes", async () => {
    fetchMsf.mockResolvedValue({ data: [{ item: { id: "x", icon: "javascript:alert(1)" }, quantity: 1 }] });
    const response = await GET();
    expect((await response.json()).data[0]).not.toHaveProperty("icon");
  });

  it.each([
    undefined,
    null,
    [],
    "invalid",
    {},
    { data: null },
    { data: [], error: "upstream failure" },
    { data: [{}] },
    { data: [{ item: { name: "No ID" }, quantity: 2 }] },
    { data: [{ item: "", quantity: 2 }] },
    { data: [{ item: "a", quantity: "10" }] },
    { data: [{ item: "a", quantity: -1 }] },
    { data: [{ item: "a", quantity: 1.5 }] },
    { data: [{ item: "a", quantity: Number.NaN }] },
    { data: [{ item: "a", quantity: 1, maxQuantity: 3 }] },
    { data: [{ allOf: [{ item: "a", quantity: 1 }] }] },
    { data: [], meta: { perTotal: "100" } },
    { data: [], meta: { page: 2 } },
    { data: [], meta: { perPage: 10 } },
  ])("fails malformed payloads instead of claiming an empty inventory: %j", async (raw) => {
    fetchMsf.mockResolvedValue(raw);
    const response = await GET();
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: "Failed to load inventory data", code: "MSF_API_ERROR", retryable: true });
  });

  it("does not return a partial inventory when a later page fails", async () => {
    fetchMsf.mockResolvedValueOnce({ data: pageOfItems(50), meta: { perTotal: 51 } }).mockRejectedValueOnce(new Error("upstream unavailable"));
    const response = await GET();
    expect(response.status).toBe(502);
    expect(await response.json()).not.toHaveProperty("data");
  });

  it("rejects an incomplete page that contradicts the upstream total", async () => {
    fetchMsf.mockResolvedValue({ data: pageOfItems(4), meta: { perTotal: 51 } });
    const response = await GET();
    expect(response.status).toBe(502);
    expect(fetchMsf).toHaveBeenCalledTimes(1);
  });

  it("rejects repeated pages rather than double-counting owned items", async () => {
    fetchMsf.mockResolvedValue({ data: pageOfItems(50) });
    const response = await GET();
    expect(response.status).toBe(502);
    expect(fetchMsf).toHaveBeenCalledTimes(2);
  });

  it("rejects a changing total rather than claiming a consistent snapshot", async () => {
    fetchMsf.mockResolvedValueOnce({ data: pageOfItems(50), meta: { perTotal: 51 } }).mockResolvedValueOnce({ data: pageOfItems(2, 50), meta: { perTotal: 52 } });
    const response = await GET();
    expect(response.status).toBe(502);
  });
});
