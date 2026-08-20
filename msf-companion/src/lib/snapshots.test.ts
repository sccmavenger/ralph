import { beforeEach, describe, expect, it, vi } from "vitest";
import { msfApiFetch } from "@/lib/msf-api";
import { fetchFullRoster } from "./snapshots";

vi.mock("@/lib/msf-api", () => ({ msfApiFetch: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));

describe("login roster snapshots", () => {
  beforeEach(() => vi.clearAllMocks());

  it("loads detailed roster data in safe sequential pages", async () => {
    vi.mocked(msfApiFetch)
      .mockResolvedValueOnce({
        data: [{ id: "one", info: { name: "One" } }],
        meta: { perTotal: 51 },
      })
      .mockResolvedValueOnce({ data: [{ id: "two", info: { name: "Two" } }] })
      .mockResolvedValueOnce({ data: [{ id: "three", info: { name: "Three" } }] });

    const roster = await fetchFullRoster("token");

    expect(roster).toHaveLength(3);
    expect(msfApiFetch).toHaveBeenNthCalledWith(1, {
      path: "/player/v1/roster?charInfo=full&traitFormat=id&page=1&perPage=25",
      accessToken: "token",
    });
    expect(msfApiFetch).toHaveBeenNthCalledWith(3, {
      path: "/player/v1/roster?charInfo=full&traitFormat=id&page=3&perPage=25",
      accessToken: "token",
    });
  });
});
