import { describe, it, expect } from "vitest";
import {
  channelRegistry,
  getEnabledChannels,
  getMsfOnlyChannels,
} from "./channelRegistry.js";

describe("channelRegistry", () => {
  it("exports an array of 18 channel objects with required fields", () => {
    expect(channelRegistry).toHaveLength(18);
    for (const ch of channelRegistry) {
      expect(ch).toHaveProperty("channelId");
      expect(ch).toHaveProperty("handle");
      expect(ch).toHaveProperty("displayName");
      expect(ch).toHaveProperty("msfOnly");
      expect(ch).toHaveProperty("enabled");
    }
  });

  it("each channel has a non-empty channelId and handle", () => {
    for (const ch of channelRegistry) {
      expect(ch.channelId.length).toBeGreaterThan(0);
      expect(ch.handle.length).toBeGreaterThan(0);
    }
  });

  it("filtering by enabled: true returns only enabled channels", () => {
    const enabled = getEnabledChannels();
    expect(enabled.length).toBeGreaterThan(0);
    for (const ch of enabled) {
      expect(ch.enabled).toBe(true);
    }
    // all enabled channels from registry should appear
    const registryEnabled = channelRegistry.filter((ch) => ch.enabled);
    expect(enabled).toHaveLength(registryEnabled.length);
  });

  it("filtering by msfOnly: true returns correct subset", () => {
    const msfOnly = getMsfOnlyChannels();
    expect(msfOnly.length).toBeGreaterThan(0);
    for (const ch of msfOnly) {
      expect(ch.msfOnly).toBe(true);
    }
    // non-msfOnly channels should NOT appear
    const registryMsfOnly = channelRegistry.filter((ch) => ch.msfOnly);
    expect(msfOnly).toHaveLength(registryMsfOnly.length);

    // verify known non-msfOnly channels are excluded
    const nonMsfOnlyNames = channelRegistry
      .filter((ch) => !ch.msfOnly)
      .map((ch) => ch.displayName);
    expect(nonMsfOnlyNames.length).toBeGreaterThan(0);
    for (const name of nonMsfOnlyNames) {
      expect(msfOnly.find((ch) => ch.displayName === name)).toBeUndefined();
    }
  });

  it("contains all 18 expected creator display names", () => {
    const names = channelRegistry.map((ch) => ch.displayName);
    const expected = [
      "DorkyDad",
      "MobileGamer",
      "ValleyFlyin",
      "BendableStraws",
      "Boilon",
      "OGDiamondDave",
      "Dulom",
      "Philosopher",
      "Dacier",
      "Updog",
      "ZeroKoolGamer",
      "Vynora",
      "Canek",
      "Gideon",
      "NOOCH2GUD",
      "Challenger5050",
      "Remanx",
      "SSBadger",
    ];
    for (const name of expected) {
      expect(names).toContain(name);
    }
  });
});
