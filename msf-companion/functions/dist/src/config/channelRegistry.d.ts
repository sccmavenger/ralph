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
export declare const channelRegistry: ChannelEntry[];
/** Returns only channels that are currently enabled for monitoring. */
export declare function getEnabledChannels(): ChannelEntry[];
/** Returns only channels that cover MSF exclusively. */
export declare function getMsfOnlyChannels(): ChannelEntry[];
//# sourceMappingURL=channelRegistry.d.ts.map