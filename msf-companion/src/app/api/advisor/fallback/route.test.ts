import { describe, expect, it } from "vitest";
import { getDefaultFallback } from "./route";

describe("Advisor default fallback", () => {
  it("is honest general guidance rather than fabricated current meta data", () => {
    const fallback = getDefaultFallback();
    const serialized = JSON.stringify(fallback);

    expect(fallback.isDefault).toBe(true);
    expect(fallback.notice).toContain("general planning guardrails");
    expect(serialized).not.toContain("Eternals");
    expect(serialized).not.toContain("Nexus Campaign");
    expect(serialized).not.toContain("today's");
  });
});
