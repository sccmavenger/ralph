import { describe, expect, it } from "vitest";
import { getEnabledMSFCreators, isRelevantCreatorVideo, MSF_CREATORS } from "./kb-creators";

describe("MSF creator registry", () => {
  it("contains unique, syntactically valid verified channel IDs", () => {
    const ids = MSF_CREATORS.map((creator) => creator.channelId);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => /^UC[A-Za-z0-9_-]{22}$/.test(id))).toBe(true);
    expect(getEnabledMSFCreators().length).toBeGreaterThanOrEqual(8);
  });

  it("filters mixed-game channels while retaining dedicated MSF channels", () => {
    expect(isRelevantCreatorVideo("RAID fusion guide", { msfOnly: false })).toBe(false);
    expect(isRelevantCreatorVideo("Cosmic Crucible counters", { msfOnly: false })).toBe(true);
    expect(isRelevantCreatorVideo("A strategy update", { msfOnly: true })).toBe(true);
  });
});
