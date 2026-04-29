import { describe, it, expect, vi } from "vitest";
import { syncGear, GearSyncDeps } from "../src/functions/kbGearSync.js";
import { InvocationContext } from "@azure/functions";

function mockContext(): InvocationContext {
  return { log: vi.fn(), warn: vi.fn(), error: vi.fn() } as unknown as InvocationContext;
}

describe("kbGearSync", () => {
  it("generates gear documents and uploads them", async () => {
    const deps: GearSyncDeps = {
      fetchGearData: vi.fn().mockResolvedValue([
        {
          tier: 19,
          origin: "Bio",
          items: [
            { name: "Spores", quantity: 12, farmable: true },
            { name: "Alien Goo", quantity: 8, farmable: false },
          ],
        },
        {
          tier: 20,
          origin: "Tech",
          items: [
            { name: "Circuit Board", quantity: 6, farmable: true },
          ],
        },
      ]),
      uploadDocuments: vi.fn().mockResolvedValue({ succeeded: 2, failed: 0 }),
    };

    const result = await syncGear(deps, mockContext());
    expect(result.tiers).toBe(2);
    expect(result.uploaded).toBe(2);
  });

  it("handles empty gear data", async () => {
    const deps: GearSyncDeps = {
      fetchGearData: vi.fn().mockResolvedValue([]),
      uploadDocuments: vi.fn().mockResolvedValue({ succeeded: 0, failed: 0 }),
    };

    const result = await syncGear(deps, mockContext());
    expect(result.tiers).toBe(0);
    expect(result.uploaded).toBe(0);
  });
});
