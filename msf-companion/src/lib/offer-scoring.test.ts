import { describe, it, expect } from "vitest";
import { offerCoresCost, formatOfferCoresCost } from "@/lib/offer-scoring";
import { CORE_ITEM_ID } from "@/lib/cost-bundle";

describe("offerCoresCost (US-010 cost-in-cores view)", () => {
  // TC-010.1 — Percent-of-cores shown. wallet cores 6120; offer costs 340 cores.
  it("computes rounded percent of cores balance", () => {
    const result = offerCoresCost({ itemId: CORE_ITEM_ID, quantity: 340 }, 6120);
    expect(result).toEqual({ cores: 340, percent: 6 }); // round(340/6120*100)=round(5.56)=6
  });

  it("formats the display string per TC-010.1", () => {
    expect(
      formatOfferCoresCost({ itemId: CORE_ITEM_ID, quantity: 340 }, 6120)
    ).toBe("costs 340 cores (~6% of your balance)");
  });

  it("rounds to nearest whole percent (down)", () => {
    // 100/6120 = 1.63% -> rounds to 2
    expect(offerCoresCost({ itemId: CORE_ITEM_ID, quantity: 100 }, 6120)?.percent).toBe(2);
    // 30/6120 = 0.49% -> rounds to 0
    expect(offerCoresCost({ itemId: CORE_ITEM_ID, quantity: 30 }, 6120)?.percent).toBe(0);
  });

  // TC-010.2 — Non-cores offer: no cores percentage shown.
  it("returns null when the offer cost is not in cores", () => {
    expect(offerCoresCost({ itemId: "SC", quantity: 500000 }, 6120)).toBeNull();
    expect(formatOfferCoresCost({ itemId: "SC", quantity: 500000 }, 6120)).toBeNull();
  });

  // TC-010.3 — No wallet: no cores percentage anywhere.
  it("returns null when no wallet (cores null/undefined)", () => {
    expect(offerCoresCost({ itemId: CORE_ITEM_ID, quantity: 340 }, null)).toBeNull();
    expect(offerCoresCost({ itemId: CORE_ITEM_ID, quantity: 340 }, undefined)).toBeNull();
    expect(formatOfferCoresCost({ itemId: CORE_ITEM_ID, quantity: 340 }, null)).toBeNull();
  });

  it("returns null when cost is missing or wallet cores non-positive", () => {
    expect(offerCoresCost(null, 6120)).toBeNull();
    expect(offerCoresCost(undefined, 6120)).toBeNull();
    expect(offerCoresCost({ itemId: CORE_ITEM_ID, quantity: 340 }, 0)).toBeNull();
    expect(offerCoresCost({ itemId: CORE_ITEM_ID, quantity: 340 }, -10)).toBeNull();
  });

  it("is pure: does not mutate its inputs", () => {
    const cost = { itemId: CORE_ITEM_ID, quantity: 340 };
    const frozen = Object.freeze({ ...cost });
    expect(() => offerCoresCost(frozen, 6120)).not.toThrow();
    expect(cost).toEqual({ itemId: CORE_ITEM_ID, quantity: 340 });
  });
});
