import { describe, it, expect, vi } from "vitest";
import { syncDDNodes, DDSyncDeps } from "../src/functions/kbDDSync.js";
import { InvocationContext } from "@azure/functions";

function mockContext(): InvocationContext {
  return { log: vi.fn(), warn: vi.fn(), error: vi.fn() } as unknown as InvocationContext;
}

describe("kbDDSync", () => {
  it("generates documents for DD nodes", async () => {
    const deps: DDSyncDeps = {
      fetchDDData: vi.fn().mockResolvedValue([
        {
          dd: { id: "dd7", name: "Dark Dimension 7" },
          nodes: [
            {
              id: "node-1",
              nodeNumber: 1,
              section: "Cosmic",
              requiredTraits: ["Cosmic"],
              enemies: [{ name: "Thanos", power: 500000 }],
            },
            {
              id: "node-2",
              nodeNumber: 2,
              section: "City",
              requiredTraits: ["City"],
              enemies: [{ name: "Kingpin", power: 400000 }],
            },
          ],
        },
      ]),
      uploadDocuments: vi.fn().mockResolvedValue({ succeeded: 2, failed: 0 }),
    };

    const result = await syncDDNodes(deps, mockContext());
    expect(result.dds).toBe(1);
    expect(result.nodes).toBe(2);
    expect(result.uploaded).toBe(2);
    expect(result.skipped).toBe(0);
  });

  it("skips nodes with incomplete data", async () => {
    const deps: DDSyncDeps = {
      fetchDDData: vi.fn().mockResolvedValue([
        {
          dd: { id: "dd5", name: "Dark Dimension 5" },
          nodes: [
            { id: "node-1", nodeNumber: 1, section: "Global", requiredTraits: [], enemies: [{ name: "Enemy" }] },
            { id: "", nodeNumber: 2, section: "Global", requiredTraits: [], enemies: [] },
          ],
        },
      ]),
      uploadDocuments: vi.fn().mockResolvedValue({ succeeded: 1, failed: 0 }),
    };

    const result = await syncDDNodes(deps, mockContext());
    expect(result.nodes).toBe(1);
    expect(result.skipped).toBe(1);
  });
});
