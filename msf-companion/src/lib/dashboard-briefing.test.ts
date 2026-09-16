import { describe, expect, it } from "vitest";
import { expiryLabel, parseDashboardBriefing, summarizeDashboardBriefing } from "./dashboard-briefing";

const now = 1_800_000_000;
const offer = (id: string, expiration: number | null = now + 3600, remainingPurchases = 1) => ({ id, name: id, expiration, remainingPurchases, rewards: [{ itemName: "Gold", quantity: 1000 }] });
const summarize = (freeOffers: unknown[], milestones: unknown[] = []) => summarizeDashboardBriefing(parseDashboardBriefing({ freeOffers, milestones }), now * 1000);

describe("dashboard reward briefing", () => {
  it("removes expired/exhausted offers and deduplicates opportunities", () => {
    const result = summarize([offer("live"), offer("live"), offer("expired", now), offer("used", now + 1000, 0)]);
    expect(result.count).toBe(1);
    expect(result.offers.map(o => o.id)).toEqual(["live"]);
  });
  it("sorts by expiry and never invents a deadline for unknown expirations", () => {
    const result = summarize([offer("unknown", null), offer("later", now + 90000), offer("soon", now + 60)]);
    expect(result.offers.map(o => o.id)).toEqual(["soon", "later", "unknown"]);
    expect(result.nextExpiry?.id).toBe("soon");
    expect(result.endingSoon).toBe(1);
    expect(summarize([offer("unknown", null)]).nextExpiry).toBeNull();
  });
  it("counts claimable milestone events, not tiers or event end times", () => {
    const milestone = { id: "event", name: "Event", endTime: now - 100, brackets: [{ claimableTiers: [1, 2] }, { claimableTiers: [3] }] };
    const result = summarize([], [milestone, milestone, { id: "empty", name: "Empty", brackets: [{ claimableTiers: [] }] }]);
    expect(result.count).toBe(1);
    expect(result.nextExpiry).toBeNull();
    expect(result.endingSoon).toBe(0);
  });
  it("preserves valid sources while reporting incomplete data", () => {
    const data = parseDashboardBriefing({ freeOffers: [offer("valid")], milestonesError: "Offline", milestones: [] });
    expect(summarizeDashboardBriefing(data, now * 1000)).toMatchObject({ count: 1, partial: true });
    expect(parseDashboardBriefing({ freeOffers: [], milestones: [] })).toMatchObject({ offersError: false, milestonesError: false });
  });
  it("does not turn missing or malformed source data into a complete zero", () => {
    for (const payload of [{}, { freeOffers: [{}], milestones: [] }, { freeOffers: [], milestones: [{ id: "bad", name: "Bad", brackets: [{}] }] }]) {
      expect(summarizeDashboardBriefing(parseDashboardBriefing(payload), now * 1000).partial).toBe(true);
    }
    expect(() => parseDashboardBriefing(null)).toThrow();
  });
  it("discards source data when the source reports an error", () => {
    expect(parseDashboardBriefing({ freeOffers: [offer("stale")], offersError: "Offline", milestones: [] }).freeOffers).toEqual([]);
  });
  it("filters invalid rewards and treats invalid expirations as unknown", () => {
    const data = parseDashboardBriefing({ freeOffers: [{ ...offer("bad", NaN), rewards: [{ itemName: "Gold", quantity: Infinity }, { itemName: "Cores", quantity: 50 }] }], milestones: [] });
    expect(data.freeOffers[0]).toMatchObject({ expiration: null, rewards: [{ itemName: "Cores", quantity: 50 }] });
  });
  it("updates count at the exact deadline without another network response", () => {
    const data = parseDashboardBriefing({ freeOffers: [offer("live", now + 60)], milestones: [] });
    expect(summarizeDashboardBriefing(data, (now + 59) * 1000).count).toBe(1);
    expect(summarizeDashboardBriefing(data, (now + 60) * 1000).count).toBe(0);
  });
  it("formats countdowns without rounding a live offer down to expired", () => {
    expect(expiryLabel(now + 1, now * 1000)).toBe("1m left");
    expect(expiryLabel(now + 3660, now * 1000)).toBe("1h 1m left");
    expect(expiryLabel(now + 90000, now * 1000)).toBe("1d 1h left");
    expect(expiryLabel(now, now * 1000)).toBe("Expired");
  });
});
