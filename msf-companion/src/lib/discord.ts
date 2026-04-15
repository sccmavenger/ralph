/**
 * Discord bot utility for posting messages to channels.
 * Uses the Discord REST API directly — no heavy SDK needed.
 */

const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const DISCORD_ANNOUNCEMENT_CHANNEL_ID =
  process.env.DISCORD_ANNOUNCEMENT_CHANNEL_ID;
const DISCORD_API = "https://discord.com/api/v10";

interface DiscordEmbed {
  title?: string;
  description?: string;
  color?: number;
  fields?: { name: string; value: string; inline?: boolean }[];
  footer?: { text: string };
  timestamp?: string;
}

interface PostMessageOptions {
  channelId?: string;
  content?: string;
  embeds?: DiscordEmbed[];
}

/**
 * Post a message to a Discord channel via the bot.
 * Falls back to DISCORD_ANNOUNCEMENT_CHANNEL_ID if no channelId provided.
 */
export async function postToDiscord(
  options: PostMessageOptions
): Promise<{ success: boolean; error?: string }> {
  if (!DISCORD_BOT_TOKEN) {
    console.warn("[Discord] DISCORD_BOT_TOKEN not configured — skipping post");
    return { success: false, error: "DISCORD_BOT_TOKEN not configured" };
  }

  const channelId = options.channelId ?? DISCORD_ANNOUNCEMENT_CHANNEL_ID;
  if (!channelId) {
    return {
      success: false,
      error: "No channel ID provided and DISCORD_ANNOUNCEMENT_CHANNEL_ID not set",
    };
  }

  const body: Record<string, unknown> = {};
  if (options.content) body.content = options.content;
  if (options.embeds) body.embeds = options.embeds;

  const res = await fetch(`${DISCORD_API}/channels/${channelId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error(`[Discord] Failed to post (${res.status}): ${text}`);
    return { success: false, error: `Discord API ${res.status}: ${text}` };
  }

  return { success: true };
}

// Color constants for embed styling
const COLORS = {
  release: 0x5865f2, // Discord blurple
  bugfix: 0x57f287, // Green
  feature: 0xfee75c, // Yellow
  info: 0x5865f2, // Blurple
} as const;

/**
 * Post a formatted release/update announcement.
 */
export async function postAnnouncement(opts: {
  title: string;
  description: string;
  type?: keyof typeof COLORS;
  changes?: string[];
  channelId?: string;
}): Promise<{ success: boolean; error?: string }> {
  const embed: DiscordEmbed = {
    title: opts.title,
    description: opts.description,
    color: COLORS[opts.type ?? "info"],
    timestamp: new Date().toISOString(),
    footer: { text: "MSF Companion" },
  };

  if (opts.changes?.length) {
    embed.fields = [
      {
        name: "Changes",
        value: opts.changes.map((c) => `• ${c}`).join("\n"),
      },
    ];
  }

  return postToDiscord({ channelId: opts.channelId, embeds: [embed] });
}
