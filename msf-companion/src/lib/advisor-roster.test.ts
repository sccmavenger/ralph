import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchAdvisorRoster, normalizeAdvisorRosterSnapshot } from "./advisor-roster";
import { msfApiFetch } from "@/lib/msf-api";

vi.mock("@/lib/msf-api", () => ({ msfApiFetch: vi.fn() }));

describe("advisor roster", () => {
  beforeEach(() => vi.clearAllMocks());

  it("normalizes old and new snapshot formats", () => {
    expect(
      normalizeAdvisorRosterSnapshot([
        { name: "Vahl", power: 123, gearTier: 18, yellowStars: 7 },
        { power: 50 },
      ])
    ).toEqual([{ name: "Vahl", power: 123, gearTier: 18, yellowStars: 7 }]);

    expect(
      normalizeAdvisorRosterSnapshot({
        data: [
          {
            power: 456,
            gearTier: 19,
            activeYellow: 6,
            activeRed: 5,
            info: { name: "Mephisto" },
          },
        ],
      })
    ).toEqual([
      {
        name: "Mephisto",
        power: 456,
        gearTier: 19,
        yellowStars: 6,
        redStars: 5,
      },
    ]);
  });

  it("fetches the complete live roster in safe sequential pages", async () => {
    vi.mocked(msfApiFetch)
      .mockResolvedValueOnce({
        data: [{ info: { name: "One" }, power: 10 }],
        meta: { perTotal: 51 },
      })
      .mockResolvedValueOnce({ data: [{ info: { name: "Two" }, power: 20 }] })
      .mockResolvedValueOnce({ data: [{ info: { name: "Three" }, power: 30 }] });

    const result = await fetchAdvisorRoster("token");

    expect(result.map((character) => character.name)).toEqual(["One", "Two", "Three"]);
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
