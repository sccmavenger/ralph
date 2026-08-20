export interface MSFCreator {
  name: string;
  channelId: string;
  handle: string;
  msfOnly: boolean;
  enabled: boolean;
}

/**
 * Canonical creator registry. Channel IDs were resolved through YouTube's
 * channels API on 2026-08-20; do not replace these with format-only placeholders.
 */
export const MSF_CREATORS: MSFCreator[] = [
  { name: "ValleyFlyin", channelId: "UCS-lJoP-GG2g0-nZMQCn_cQ", handle: "@ValleyFlyin", msfOnly: true, enabled: true },
  { name: "Boilon", channelId: "UC7lNaBgwLVbXIwUTy9tRg3w", handle: "@Boilon", msfOnly: true, enabled: true },
  { name: "MobileGamer365", channelId: "UCWnlPyy93myHvmFmD533BGg", handle: "@OhEmGee", msfOnly: false, enabled: true },
  { name: "Dorky Dad", channelId: "UC8euToXgUPWnGf1vr8tGrSg", handle: "@DorkyDadMSF", msfOnly: true, enabled: true },
  { name: "Bendable Straws", channelId: "UCo15CZ9KB4LScjewK1i9qRA", handle: "@BendableStraws", msfOnly: true, enabled: true },
  { name: "OGDiamondDave", channelId: "UCgxjUmfQES2AQuJfOWC8n6w", handle: "@OGDiamondDave", msfOnly: true, enabled: true },
  { name: "ZeroKoolGamer", channelId: "UCZC6Ktr3VbvA2vcsQ2ZGtsg", handle: "@ZerokoolGamer", msfOnly: true, enabled: true },
  { name: "GideonXL", channelId: "UCiE8MZbg-N86vNTUWSh9nnA", handle: "@gideonxl660", msfOnly: true, enabled: true },
  { name: "DulomIsHere", channelId: "UCCvr7HICGSsXQUHztHyVq9g", handle: "@dulomishere", msfOnly: false, enabled: true },
  { name: "DacierGaming", channelId: "UCDOMZQ_j7k2Mp8KZkGqnwaw", handle: "@DacierGaming", msfOnly: false, enabled: true },
  { name: "Canek Gaming", channelId: "UCxGkB3brWRiw4ZGF1NOYfcA", handle: "@CanekGaming", msfOnly: true, enabled: true },
  { name: "Remanx", channelId: "UCuHM3BHONp2T8BEhunLfRDw", handle: "@remanx", msfOnly: true, enabled: false },
  { name: "Vynora", channelId: "UCIVkaRV4NzHTbvSLBf8JOYg", handle: "@vynora897", msfOnly: true, enabled: false },
  { name: "Philosopher", channelId: "UCzZGUeIz4SiJS3NIYUQ9A6w", handle: "@PhilosopherMSF", msfOnly: true, enabled: false },
  { name: "Tony Scungili", channelId: "UCL0TW4o82JHYWRDHbgFAqFw", handle: "@TonyScungili", msfOnly: true, enabled: false },
];

export function getEnabledMSFCreators(): MSFCreator[] {
  return MSF_CREATORS.filter((creator) => creator.enabled);
}

const MSF_TITLE_TERMS = [
  "msf",
  "marvel strike force",
  "strike force",
  "cosmic crucible",
  "dark dimension",
  "battleworld",
  "spider-man tower",
];

export function isRelevantCreatorVideo(title: string, creator: Pick<MSFCreator, "msfOnly">): boolean {
  if (creator.msfOnly) return true;
  const normalized = title.toLowerCase();
  return MSF_TITLE_TERMS.some((term) => normalized.includes(term));
}
