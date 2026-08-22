import { beforeEach, describe, expect, it } from "vitest";
import {
  clearCache,
  clearCacheByPrefix,
  getCached,
  setCache,
} from "@/lib/planner-cache";

describe("planner cache prefix invalidation", () => {
  beforeEach(clearCache);

  it("clears only entries belonging to the changed data family", () => {
    setCache("dd:list", ["old"]);
    setCache("dd:detail:dd7", { old: true });
    setCache("events:list", ["keep"]);

    clearCacheByPrefix("dd:");

    expect(getCached("dd:list")).toBeNull();
    expect(getCached("dd:detail:dd7")).toBeNull();
    expect(getCached("events:list")).toEqual(["keep"]);
  });
});
