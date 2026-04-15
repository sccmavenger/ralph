/**
 * YouTube Channel Registry for MSF Intelligence Pipeline.
 *
 * Each entry represents a monitored MSF content creator.
 * To add or remove a channel, edit this array — no code changes required.
 */

export interface ChannelEntry {
  /** YouTube channel ID (UC...) */
  channelId: string;
  /** YouTube handle (e.g., @DorkyDadMSF) */
  handle: string;
  /** Human-readable display name */
  displayName: string;
  /** True if this channel covers MSF exclusively (no other games) */
  msfOnly: boolean;
  /** True if this channel should be actively monitored */
  enabled: boolean;
}

export const channelRegistry: ChannelEntry[] = [
  {
    channelId: "UCVkBn-MiOJEGRmGkCRSFXaA",
    handle: "@DorkyDadMSF",
    displayName: "DorkyDad",
    msfOnly: true,
    enabled: true,
  },
  {
    channelId: "UCjS-wVbMRO8ynQ0LZESqR3A",
    handle: "@OhEmGee",
    displayName: "MobileGamer",
    msfOnly: false,
    enabled: true,
  },
  {
    channelId: "UCH5qI5ZnPbQd7MnrlJVlrwQ",
    handle: "@valleyflyin",
    displayName: "ValleyFlyin",
    msfOnly: false,
    enabled: true,
  },
  {
    channelId: "UCrWtqNq5yXn6kPp1igp8dbQ",
    handle: "@BendableStraws",
    displayName: "BendableStraws",
    msfOnly: true,
    enabled: true,
  },
  {
    channelId: "UC8bGCkndEBKsFvtJQxo-g2w",
    handle: "@BoilonMSF",
    displayName: "Boilon",
    msfOnly: true,
    enabled: true,
  },
  {
    channelId: "UCi0e4Ix36g8MbyD8NP9m4jQ",
    handle: "@OGDiamondDave",
    displayName: "OGDiamondDave",
    msfOnly: true,
    enabled: true,
  },
  {
    channelId: "UCw8B6IxYt9DYqcIZ9DnPJqw",
    handle: "@dulomishere",
    displayName: "Dulom",
    msfOnly: true,
    enabled: true,
  },
  {
    channelId: "UC3t3KMJV-54GZsjmGLkYJzw",
    handle: "@PhilosopherMSF",
    displayName: "Philosopher",
    msfOnly: true,
    enabled: true,
  },
  {
    channelId: "UCIqj7FDrJkGPq6MEhPb5DOQ",
    handle: "@DacierGaming",
    displayName: "Dacier",
    msfOnly: true,
    enabled: true,
  },
  {
    channelId: "UCbF1OqZ18DNGKiFm_bS3msg",
    handle: "@updog",
    displayName: "Updog",
    msfOnly: true,
    enabled: true,
  },
  {
    channelId: "UCEh5F6fXLpx8suKfcUqXILQ",
    handle: "@ZerokoolGamer",
    displayName: "ZeroKoolGamer",
    msfOnly: true,
    enabled: true,
  },
  {
    channelId: "UCzPb1Jh6r6q0nXaGiZOGY1Q",
    handle: "@vynora897",
    displayName: "Vynora",
    msfOnly: true,
    enabled: true,
  },
  {
    channelId: "UC32x9e6eMpNR3J20C_17CbA",
    handle: "@CanekGaming",
    displayName: "Canek",
    msfOnly: true,
    enabled: true,
  },
  {
    channelId: "UCykGGnKJO1F4bQ4v3jUqVeQ",
    handle: "@gideonxl660",
    displayName: "Gideon",
    msfOnly: true,
    enabled: true,
  },
  {
    channelId: "UCfJBmq5rC8p-dEPnb4c7P3A",
    handle: "@NOOCH2GUD",
    displayName: "NOOCH2GUD",
    msfOnly: true,
    enabled: true,
  },
  {
    channelId: "UCXP59aPm-h3oM3er1FGh-gA",
    handle: "@Challenger5050",
    displayName: "Challenger5050",
    msfOnly: true,
    enabled: true,
  },
  {
    channelId: "UCi_NLQZ4sCJpBsUlE4P_83g",
    handle: "@Remanx",
    displayName: "Remanx",
    msfOnly: false,
    enabled: true,
  },
  {
    channelId: "UCqnH_82QA6cFiJtO1X-Jh_Q",
    handle: "@SSBadger",
    displayName: "SSBadger",
    msfOnly: true,
    enabled: true,
  },
];

/** Returns only channels that are currently enabled for monitoring. */
export function getEnabledChannels(): ChannelEntry[] {
  return channelRegistry.filter((ch) => ch.enabled);
}

/** Returns only channels that cover MSF exclusively. */
export function getMsfOnlyChannels(): ChannelEntry[] {
  return channelRegistry.filter((ch) => ch.msfOnly);
}
