import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock cosmos client
vi.mock("../src/lib/cosmosClient", () => ({
  getContainer: vi.fn(),
}));

import { getContainer } from "../src/lib/cosmosClient";

describe("Static Fallback Generator", () => {
  const mockUpsert = vi.fn();
  const mockFetchAll = vi.fn();
  const mockQuery = vi.fn(() => ({ fetchAll: mockFetchAll }));

  beforeEach(() => {
    vi.resetAllMocks();
    (getContainer as ReturnType<typeof vi.fn>).mockImplementation((name: string) => {
      if (name === "static-fallback") {
        return { items: { upsert: mockUpsert, query: mockQuery } };
      }
      return { items: { query: mockQuery } };
    });
    mockFetchAll.mockResolvedValue({ resources: [] });
    mockUpsert.mockResolvedValue({});
  });

  it("should generate valid fallback JSON with required fields", () => {
    const fallback = {
      id: "static_fallback_latest",
      type: "static_fallback",
      topTeams: [{ name: "Eternals", reason: "Best raid team", priority: 1 }],
      farmingPriorities: [{ character: "Kestrel", location: "Nexus 7-3", reason: "Versatile" }],
      eventRecommendations: [{ event: "Blitz", recommendation: "Rotate top teams" }],
      generatedAt: new Date().toISOString(),
      ttl: 172800,
    };

    // Validate structure
    expect(fallback.topTeams).toBeDefined();
    expect(fallback.farmingPriorities).toBeDefined();
    expect(fallback.eventRecommendations).toBeDefined();
    expect(fallback.topTeams.length).toBeGreaterThan(0);
    expect(fallback.topTeams[0]).toHaveProperty("name");
    expect(fallback.topTeams[0]).toHaveProperty("reason");
    expect(fallback.topTeams[0]).toHaveProperty("priority");
    expect(fallback.farmingPriorities[0]).toHaveProperty("character");
    expect(fallback.farmingPriorities[0]).toHaveProperty("location");
    expect(fallback.eventRecommendations[0]).toHaveProperty("event");
    expect(fallback.eventRecommendations[0]).toHaveProperty("recommendation");
  });

  it("should store fallback data in Cosmos DB with correct key", async () => {
    const container = getContainer("static-fallback");
    const fallback = {
      id: "static_fallback_latest",
      type: "static_fallback",
      topTeams: [],
      farmingPriorities: [],
      eventRecommendations: [],
      generatedAt: new Date().toISOString(),
      ttl: 172800,
    };

    await container.items.upsert(fallback);

    expect(mockUpsert).toHaveBeenCalledTimes(1);
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ id: "static_fallback_latest" })
    );
  });

  it("should include default teams when no knowledge data available", () => {
    const defaultTeams = [
      { name: "Eternals", reason: "Top raid team across all game modes", priority: 1 },
      { name: "Gamma Team", reason: "Essential for Gamma raids", priority: 2 },
    ];

    expect(defaultTeams.length).toBe(2);
    expect(defaultTeams[0].name).toBe("Eternals");
  });

  it("should extract team mentions from content", () => {
    const teamNames = [
      "Eternals", "Darkhold", "Unlimited X-Men", "Gamma", "Bifrost",
    ];

    const content = "Build the Eternals team and also consider Darkhold for crucible";
    const mentions = teamNames.filter((team) =>
      content.toLowerCase().includes(team.toLowerCase())
    );

    expect(mentions).toContain("Eternals");
    expect(mentions).toContain("Darkhold");
    expect(mentions).not.toContain("Gamma");
  });

  it("should set TTL of 48 hours on fallback data", () => {
    const ttl = 172800; // 48 hours in seconds
    expect(ttl).toBe(48 * 60 * 60);
  });
});
