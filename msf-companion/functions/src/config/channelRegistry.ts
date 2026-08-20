/** Verified YouTube channels monitored by the MSF intelligence pipeline. */
export interface ChannelEntry {
  channelId: string;
  handle: string;
  displayName: string;
  msfOnly: boolean;
  enabled: boolean;
}

/**
 * IDs were resolved through YouTube's channels API on 2026-08-20. Inactive
 * creators remain documented but disabled so stale feeds are not polled.
 */
export const channelRegistry: ChannelEntry[] = [
  { channelId: "UCS-lJoP-GG2g0-nZMQCn_cQ", handle: "@ValleyFlyin", displayName: "ValleyFlyin", msfOnly: true, enabled: true },
  { channelId: "UC7lNaBgwLVbXIwUTy9tRg3w", handle: "@Boilon", displayName: "Boilon", msfOnly: true, enabled: true },
  { channelId: "UCWnlPyy93myHvmFmD533BGg", handle: "@OhEmGee", displayName: "MobileGamer365", msfOnly: false, enabled: true },
  { channelId: "UC8euToXgUPWnGf1vr8tGrSg", handle: "@DorkyDadMSF", displayName: "Dorky Dad", msfOnly: true, enabled: true },
  { channelId: "UCo15CZ9KB4LScjewK1i9qRA", handle: "@BendableStraws", displayName: "Bendable Straws", msfOnly: true, enabled: true },
  { channelId: "UCgxjUmfQES2AQuJfOWC8n6w", handle: "@OGDiamondDave", displayName: "OGDiamondDave", msfOnly: true, enabled: true },
  { channelId: "UCZC6Ktr3VbvA2vcsQ2ZGtsg", handle: "@ZerokoolGamer", displayName: "ZeroKoolGamer", msfOnly: true, enabled: true },
  { channelId: "UCiE8MZbg-N86vNTUWSh9nnA", handle: "@gideonxl660", displayName: "GideonXL", msfOnly: true, enabled: true },
  { channelId: "UCCvr7HICGSsXQUHztHyVq9g", handle: "@dulomishere", displayName: "DulomIsHere", msfOnly: false, enabled: true },
  { channelId: "UCDOMZQ_j7k2Mp8KZkGqnwaw", handle: "@DacierGaming", displayName: "DacierGaming", msfOnly: false, enabled: true },
  { channelId: "UCxGkB3brWRiw4ZGF1NOYfcA", handle: "@CanekGaming", displayName: "Canek Gaming", msfOnly: true, enabled: true },
  { channelId: "UCuHM3BHONp2T8BEhunLfRDw", handle: "@remanx", displayName: "Remanx", msfOnly: true, enabled: false },
  { channelId: "UCIVkaRV4NzHTbvSLBf8JOYg", handle: "@vynora897", displayName: "Vynora", msfOnly: true, enabled: false },
  { channelId: "UCzZGUeIz4SiJS3NIYUQ9A6w", handle: "@PhilosopherMSF", displayName: "Philosopher", msfOnly: true, enabled: false },
  { channelId: "UCL0TW4o82JHYWRDHbgFAqFw", handle: "@TonyScungili", displayName: "Tony Scungili", msfOnly: true, enabled: false },
];

export function getEnabledChannels(): ChannelEntry[] {
  return channelRegistry.filter((channel) => channel.enabled);
}

export function getMsfOnlyChannels(): ChannelEntry[] {
  return channelRegistry.filter((channel) => channel.msfOnly);
}
