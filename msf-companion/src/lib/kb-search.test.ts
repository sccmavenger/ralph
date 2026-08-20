import { describe, expect, it } from "vitest";
import { mapSearchDocument } from "./kb-search";

describe("mapSearchDocument", () => {
  it("maps canonical fields and reranker score", () => {
    const result = mapSearchDocument({
      id: "char-spider-man",
      content: "Spider-Man has a complete character kit.",
      sourceCreatorName: "MSF Game Data",
      sourceVideoTitle: "Spider-Man Character Kit",
      sourcePublishedAt: "2026-08-20T00:00:00.000Z",
      sourceTier: 1,
      sourceType: "api-game-data",
      "@search.rerankerScore": 3.2,
    });
    expect(result).toMatchObject({ sourceType: "api-game-data", sourceTier: 1, searchScore: 3.2 });
  });

  it("infers legacy official and AI documents instead of labeling everything YouTube", () => {
    expect(mapSearchDocument({ id: "blog-update", content: "Official update with enough content to search." })?.sourceType)
      .toBe("official-blog");
    expect(mapSearchDocument({ id: "auto-gap", content: "Generated gap answer with enough content to search." })?.sourceType)
      .toBe("ai-generated");
  });

  it("drops empty documents", () => {
    expect(mapSearchDocument({ id: "empty", content: "  " })).toBeNull();
  });
});
