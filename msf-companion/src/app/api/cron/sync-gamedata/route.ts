import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";

const SEARCH_ENDPOINT = process.env.AZURE_AI_SEARCH_ENDPOINT || "";
const SEARCH_KEY = process.env.AZURE_AI_SEARCH_KEY || "";
const MSF_API_KEY = process.env.MSF_API_KEY || "";
const MSF_API_BASE = "https://api.marvelstrikeforce.com";
const HYDRA_TOKEN_URL =
  "https://hydra-public.prod.m3.scopelypv.com/oauth2/token";

// Module-level cached token for the duration of a single cron run
let cachedMsfToken: string | null = null;

async function getMsfBearerToken(): Promise<string> {
  if (cachedMsfToken) return cachedMsfToken;

  const clientId = process.env.SCOPELY_CLIENT_ID;
  const clientSecret = process.env.SCOPELY_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("SCOPELY_CLIENT_ID or SCOPELY_CLIENT_SECRET not configured");
  }

  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const response = await fetch(HYDRA_TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basicAuth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "Unknown error");
    throw new Error(`Failed to obtain MSF API token: ${response.status} ${text}`);
  }

  const data = (await response.json()) as { access_token: string; expires_in: number };
  cachedMsfToken = data.access_token;
  return cachedMsfToken;
}

function msfHeaders(bearerToken: string): Record<string, string> {
  return {
    "x-api-key": MSF_API_KEY,
    "User-Agent": "APIClient/1.0 (Server)",
    Authorization: `Bearer ${bearerToken}`,
    Accept: "application/json",
  };
}

interface SyncResult {
  name: string;
  success: boolean;
  docsUploaded: number;
  error?: string;
}

async function uploadToSearch(docs: Array<Record<string, unknown>>): Promise<{ succeeded: number; failed: number }> {
  if (docs.length === 0) return { succeeded: 0, failed: 0 };
  const batchSize = 100;
  let succeeded = 0;
  let failed = 0;
  for (let i = 0; i < docs.length; i += batchSize) {
    const batch = docs.slice(i, i + batchSize);
    const response = await fetch(
      `${SEARCH_ENDPOINT}/indexes/msf-knowledge/docs/index?api-version=2024-07-01`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "api-key": SEARCH_KEY },
        body: JSON.stringify({
          value: batch.map((doc) => ({ "@search.action": "mergeOrUpload", ...doc })),
        }),
      }
    );
    if (response.ok) succeeded += batch.length;
    else failed += batch.length;
  }
  return { succeeded, failed };
}

// Shared character data populated by syncCharacters, consumed by detectNewCharacters
let lastFetchedCharacters: Array<{ id: string; name: string; traits: string[]; abilities: Array<{ name: string; description: string }>; teams: string[] }> = [];

async function syncCharacters(): Promise<SyncResult> {
  const bearerToken = await getMsfBearerToken();
  const characters: Array<{ id: string; name: string; traits: string[]; abilities: Array<{ name: string; description: string }>; teams: string[] }> = [];
  let page = 1;
  while (true) {
    const response = await fetch(
      `${MSF_API_BASE}/game/v1/characters?lang=en&page=${page}&perPage=200`,
      { headers: msfHeaders(bearerToken) }
    );
    if (!response.ok) break;
    const data = (await response.json()) as { data?: Array<{ id: string; name?: string; traits?: string[]; abilities?: Array<{ name: string; description: string }>; teams?: string[] }>; meta?: { page?: number; perPage?: number; perTotal?: number } };
    for (const c of data.data || []) {
      characters.push({
        id: c.id,
        name: c.name || c.id,
        traits: c.traits || [],
        abilities: (c.abilities || []).map((a) => ({ name: a.name || "", description: a.description || "" })),
        teams: c.teams || [],
      });
    }
    const perTotal = data.meta?.perTotal || 0;
    const perPage = data.meta?.perPage || 200;
    const totalPages = Math.ceil(perTotal / perPage) || 1;
    if (page >= totalPages) break;
    page++;
  }

  // Store for detectNewCharacters
  lastFetchedCharacters = characters.map((c) => ({ id: c.id, name: c.name, traits: c.traits, abilities: c.abilities, teams: c.teams }));

  const today = new Date().toISOString().split("T")[0];
  const docs = characters.map((char) => {
    const traits = char.traits.join(", ");
    const teams = char.teams.length > 0 ? char.teams.join(", ") : "No specific team";
    const abilities = char.abilities.map((a) => `${a.name}: ${a.description}`).join(". ");
    return {
      id: `char-${char.id}`,
      content: `${char.name} is a Marvel Strike Force character with the following traits: ${traits}. Team affiliations: ${teams}. Abilities: ${abilities}`,
      category: "character-kits",
      sourceCreatorName: "MSF Game Data",
      sourceVideoTitle: `${char.name} Character Kit`,
      sourceUrl: `https://marvelstrikeforce.com/en/characters/${char.id}`,
      sourceDate: today,
    };
  });

  const result = await uploadToSearch(docs);
  return { name: "characters", success: result.succeeded > 0, docsUploaded: result.succeeded };
}

async function syncMeta(): Promise<SyncResult> {
  const bearerToken = await getMsfBearerToken();
  const charNames = new Map<string, string>();
  const charResponse = await fetch(
    `${MSF_API_BASE}/game/v1/characters?lang=en&page=1&perPage=500`,
    { headers: msfHeaders(bearerToken) }
  );
  if (charResponse.ok) {
    const charData = (await charResponse.json()) as { data?: Array<{ id: string; name?: string }> };
    for (const c of charData.data || []) {
      if (c.name) charNames.set(c.id, c.name);
    }
  }

  const modes = [
    { name: "war-offense", endpoint: "/game/v1/analysis/war/offense" },
    { name: "war-defense", endpoint: "/game/v1/analysis/war/defense" },
    { name: "crucible-defense", endpoint: "/game/v1/analysis/crucible/defense" },
  ];

  const today = new Date().toISOString().split("T")[0];
  const allDocs: Array<Record<string, unknown>> = [];

  for (const mode of modes) {
    const response = await fetch(
      `${MSF_API_BASE}${mode.endpoint}?page=1&perPage=50`,
      { headers: msfHeaders(bearerToken) }
    );
    if (!response.ok) continue;
    const data = (await response.json()) as { data?: Array<{ characters?: string[]; total?: number; wins?: number; defends?: number; defeats?: number }> };
    const teams = (data.data || []).slice(0, 50);

    for (let i = 0; i < teams.length; i++) {
      const team = teams[i];
      const resolvedNames = (team.characters || []).map((id) => charNames.get(id) || id);
      const total = team.total || team.defends || 0;
      const wins = team.wins || team.defeats || 0;
      const winRate = total > 0 ? Math.round((wins / total) * 100) : 0;

      allDocs.push({
        id: `meta-${mode.name}-${i}`,
        content: `${mode.name.replace(/-/g, " ")} team rank #${i + 1}: ${resolvedNames.join(", ")}. Win rate: ${winRate}% (${wins}/${total} battles).`,
        category: mode.name.includes("war") ? "war-meta" : "crucible",
        sourceCreatorName: "MSF Game Data",
        sourceVideoTitle: `${mode.name} Meta Team #${i + 1}`,
        sourceUrl: "https://marvelstrikeforce.com",
        sourceDate: today,
      });
    }
  }

  const result = await uploadToSearch(allDocs);
  return { name: "meta", success: result.succeeded > 0, docsUploaded: result.succeeded };
}

async function syncReddit(): Promise<SyncResult> {
  const response = await fetch(
    "https://www.reddit.com/r/MarvelStrikeForce/top.json?t=day&limit=50",
    { headers: { "User-Agent": "MSFCompanion/1.0 (KB Sync)" } }
  );
  if (!response.ok) return { name: "reddit", success: false, docsUploaded: 0, error: `Reddit API: ${response.status}` };

  const data = (await response.json()) as { data?: { children?: Array<{ data: { id: string; title: string; selftext: string; score: number; is_self: boolean; link_flair_text: string | null; permalink: string; created_utc: number } }> } };
  const posts = (data.data?.children || [])
    .filter((c) => c.data.is_self && c.data.score >= 30 && c.data.selftext.trim().length > 0)
    .filter((c) => {
      const flair = (c.data.link_flair_text || "").toLowerCase();
      return !["humor", "meme", "shitpost", "fan art"].some((f) => flair.includes(f));
    });

  if (posts.length === 0) return { name: "reddit", success: true, docsUploaded: 0 };

  // Check existing
  let existingIds = new Set<string>();
  try {
    const checkResponse = await fetch(
      `${SEARCH_ENDPOINT}/indexes/msf-knowledge/docs?api-version=2024-07-01&$filter=sourceCreatorName eq 'Reddit Community'&$select=id&$top=1000`,
      { headers: { "api-key": SEARCH_KEY } }
    );
    if (checkResponse.ok) {
      const checkData = (await checkResponse.json()) as { value?: Array<{ id: string }> };
      existingIds = new Set((checkData.value || []).map((d) => d.id));
    }
  } catch { /* proceed without dedup */ }

  const docs = posts
    .filter((p) => !existingIds.has(`reddit-${p.data.id}`))
    .map((p) => ({
      id: `reddit-${p.data.id}`,
      content: `${p.data.title}\n\n${p.data.selftext}`.slice(0, 5000),
      category: classifyReddit(p.data.title, p.data.link_flair_text),
      sourceCreatorName: "Reddit Community",
      sourceVideoTitle: p.data.title,
      sourceUrl: `https://www.reddit.com${p.data.permalink}`,
      sourceDate: new Date(p.data.created_utc * 1000).toISOString().split("T")[0],
    }));

  const result = await uploadToSearch(docs);
  return { name: "reddit", success: true, docsUploaded: result.succeeded };
}

function classifyReddit(title: string, flair: string | null): string {
  const lower = ((flair || "") + " " + title).toLowerCase();
  if (lower.includes("war") || lower.includes("alliance")) return "war-meta";
  if (lower.includes("crucible") || lower.includes("arena")) return "crucible";
  if (lower.includes("dark dimension") || lower.includes("dd")) return "dark-dimension";
  if (lower.includes("team") || lower.includes("comp") || lower.includes("build")) return "team-comp";
  if (lower.includes("farm") || lower.includes("unlock")) return "farming";
  return "general";
}

async function syncBlog(): Promise<SyncResult> {
  const response = await fetch("https://marvelstrikeforce.com/en/updates", {
    headers: { "User-Agent": "MSFCompanion/1.0 (KB Blog Sync)" },
  });
  if (!response.ok) return { name: "blog", success: false, docsUploaded: 0, error: `Blog fetch: ${response.status}` };

  const html = await response.text();
  const links: Array<{ url: string; title: string }> = [];
  const pattern = /href="(\/en\/updates\/[^"]+)"/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(html)) !== null) {
    links.push({
      url: `https://marvelstrikeforce.com${match[1]}`,
      title: match[1].split("/").pop()?.replace(/-/g, " ") || "Unknown",
    });
  }

  if (links.length === 0) return { name: "blog", success: true, docsUploaded: 0 };

  // Check existing
  let existingIds = new Set<string>();
  try {
    const checkResponse = await fetch(
      `${SEARCH_ENDPOINT}/indexes/msf-knowledge/docs?api-version=2024-07-01&$filter=sourceCreatorName eq 'Scopely Official'&$select=id&$top=1000`,
      { headers: { "api-key": SEARCH_KEY } }
    );
    if (checkResponse.ok) {
      const checkData = (await checkResponse.json()) as { value?: Array<{ id: string }> };
      existingIds = new Set((checkData.value || []).map((d) => d.id));
    }
  } catch { /* proceed */ }

  const today = new Date().toISOString().split("T")[0];
  const docs: Array<Record<string, unknown>> = [];

  for (const link of links.slice(0, 10)) { // Process up to 10 posts per run
    const slug = link.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    if (existingIds.has(`blog-${slug}-0`)) continue;

    try {
      const pageResponse = await fetch(link.url, {
        headers: { "User-Agent": "MSFCompanion/1.0 (KB Blog Sync)" },
      });
      if (!pageResponse.ok) continue;
      const pageHtml = await pageResponse.text();
      const text = pageHtml
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
        .replace(/<[^>]*>/g, " ")
        .replace(/\s+/g, " ")
        .trim();

      if (text.length < 100) continue;

      docs.push({
        id: `blog-${slug}-0`,
        content: text.slice(0, 5000),
        category: "news-events",
        sourceCreatorName: "Scopely Official",
        sourceVideoTitle: link.title,
        sourceUrl: link.url,
        sourceDate: today,
      });
    } catch { /* skip this post */ }
  }

  const result = await uploadToSearch(docs);
  return { name: "blog", success: true, docsUploaded: result.succeeded };
}

function buildNewCharacterEmailHtml(char: { name: string; traits: string[]; abilities: Array<{ name: string; description: string }>; teams: string[] }): string {
  const traits = char.traits.join(", ");
  const teams = char.teams.length > 0 ? char.teams.join(", ") : "Not yet assigned";
  const hasAbilities = char.abilities.length > 0;

  let abilitiesHtml = "";
  if (hasAbilities) {
    abilitiesHtml = `<div style="background:#1a1a2e;border-radius:12px;padding:24px;margin-bottom:24px;">
      <h2 style="color:#f59e0b;font-size:16px;margin:0 0 16px;">⚡ Character Kit</h2>
      <table style="width:100%;border-spacing:0 8px;">
        ${char.abilities.map((a) => `<tr><td style="color:#4f9cf7;font-size:14px;padding:4px 8px 4px 0;vertical-align:top;font-weight:600;">${a.name}</td><td style="color:#ccc;font-size:13px;line-height:1.5;padding:4px 0;">${a.description}</td></tr>`).join("")}
      </table>
    </div>`;
  }

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#0f0f23;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:32px 20px;">
    <div style="text-align:center;padding:24px 0 20px;">
      <div style="display:inline-block;background:#dc2626;color:#fff;font-weight:800;padding:10px 16px;border-radius:8px;font-size:14px;">MSF</div>
      <h1 style="color:#4f9cf7;margin:16px 0 0;font-size:24px;">🆕 New Character Detected!</h1>
    </div>
    <div style="background:linear-gradient(135deg,#1a1a3e 0%,#2a1a4e 100%);border-radius:16px;padding:28px 24px;text-align:center;margin-bottom:24px;">
      <h2 style="color:#fff;font-size:22px;margin:0 0 8px;">${char.name}</h2>
      <p style="color:#aaa;font-size:14px;margin:0;">Traits: ${traits}</p>
      <p style="color:#aaa;font-size:14px;margin:4px 0 0;">Teams: ${teams}</p>
    </div>
    <div style="background:#1a1a2e;border-radius:12px;padding:24px;margin-bottom:24px;">
      <p style="color:#e0e0e0;font-size:15px;line-height:1.7;margin:0;">
        We're excited to let you know that a new character has been detected in Marvel Strike Force! <strong style="color:#4f9cf7;">${char.name}</strong> has just been added to the game data.
      </p>
    </div>
    ${abilitiesHtml}
    <div style="text-align:center;padding:8px 0 24px;">
      <a href="https://themsftoolkit.com/heroes" style="display:inline-block;background:#4f9cf7;color:#fff;padding:12px 28px;border-radius:9999px;text-decoration:none;font-weight:600;font-size:14px;">View in Heroes Database →</a>
    </div>
    <div style="text-align:center;padding:20px 0;border-top:1px solid #333;font-size:12px;color:#666;">
      <p style="margin:0;">MSF Companion — Your Marvel Strike Force Assistant</p>
    </div>
  </div>
</body></html>`;
}

async function sendNewCharacterEmails(chars: Array<{ name: string; traits: string[]; abilities: Array<{ name: string; description: string }>; teams: string[] }>): Promise<number> {
  // Testing phase: only send to test email until validated
  const testEmail = process.env.NEW_CHARACTER_EMAIL_TEST || "";

  let emailsSent = 0;
  for (const char of chars) {
    const html = buildNewCharacterEmailHtml(char);
    const subject = `🆕 New Character Detected: ${char.name}`;

    if (testEmail) {
      // Test mode: send only to admin
      try {
        await sendEmail(testEmail, subject, html);
        emailsSent++;
      } catch (err) {
        console.warn(`[Email] New character email failed: ${err}`);
      }
    } else {
      // Production mode: send to all users with email
      const commanders = await prisma.commander.findMany({
        where: { disabled: false, email: { not: null }, emailDigestOptOut: false },
        select: { email: true },
      });
      for (const cmd of commanders) {
        if (cmd.email) {
          try {
            await sendEmail(cmd.email, subject, html);
            emailsSent++;
          } catch (err) {
            console.warn(`[Email] New character email to ${cmd.email} failed: ${err}`);
          }
        }
      }
    }
  }
  return emailsSent;
}

async function detectNewCharacters(): Promise<SyncResult> {
  if (lastFetchedCharacters.length === 0) {
    return { name: "new-character-detection", success: true, docsUploaded: 0 };
  }

  // Get all known character IDs from the database
  const knownCharacters = await prisma.gameCharacter.findMany({
    select: { characterId: true },
  });
  const knownIds = new Set(knownCharacters.map((c) => c.characterId));

  const isFirstRun = knownIds.size === 0;

  // Find characters not yet in our database
  const newCharacters = lastFetchedCharacters.filter((c) => !knownIds.has(c.id));

  if (newCharacters.length === 0) {
    return { name: "new-character-detection", success: true, docsUploaded: 0 };
  }

  // Insert all new characters into GameCharacter table
  await prisma.gameCharacter.createMany({
    data: newCharacters.map((c) => ({
      characterId: c.id,
      name: c.name,
      traits: c.traits,
    })),
    skipDuplicates: true,
  });

  // On first run, seed baseline only — no notifications
  if (isFirstRun) {
    return {
      name: "new-character-detection",
      success: true,
      docsUploaded: newCharacters.length,
      error: `Seeded ${newCharacters.length} characters as baseline (no notifications)`,
    };
  }

  // Create notifications for all commanders
  const commanders = await prisma.commander.findMany({
    where: { disabled: false },
    select: { id: true },
  });

  let notificationsCreated = 0;
  for (const char of newCharacters) {
    const notifData = commanders.map((cmd) => ({
      commanderId: cmd.id,
      type: "new-character",
      title: `New Character Detected: ${char.name}`,
      message: `${char.name} has been added to the game. Traits: ${char.traits.join(", ")}`,
      linkUrl: `/heroes`,
      metadata: { characterId: char.id, name: char.name, traits: char.traits },
    }));

    await prisma.commanderNotification.createMany({ data: notifData });
    notificationsCreated += notifData.length;
  }

  // Send new character email notifications
  const emailsSent = await sendNewCharacterEmails(newCharacters);

  return {
    name: "new-character-detection",
    success: true,
    docsUploaded: notificationsCreated,
    error: emailsSent > 0 ? `${emailsSent} new character emails sent` : undefined,
  };
}

export async function GET() {
  return NextResponse.json({ status: "ok", description: "POST to trigger game data KB sync" });
}

export async function POST(request: NextRequest) {
  // Reset cached token for each cron invocation
  cachedMsfToken = null;

  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!SEARCH_ENDPOINT || !SEARCH_KEY) {
    return NextResponse.json({ error: "Azure AI Search not configured" }, { status: 500 });
  }

  if (!MSF_API_KEY) {
    return NextResponse.json({ error: "MSF API key not configured" }, { status: 500 });
  }

  const results: SyncResult[] = [];
  const syncFns = [syncCharacters, syncMeta, syncReddit, syncBlog];

  for (const fn of syncFns) {
    try {
      const result = await fn();
      results.push(result);
    } catch (err) {
      results.push({
        name: fn.name.replace("sync", "").toLowerCase(),
        success: false,
        docsUploaded: 0,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Run new character detection after syncCharacters has populated the character list
  try {
    const detectResult = await detectNewCharacters();
    results.push(detectResult);
  } catch (err) {
    results.push({
      name: "new-character-detection",
      success: false,
      docsUploaded: 0,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  const totalDocs = results.reduce((sum, r) => sum + r.docsUploaded, 0);
  const succeeded = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;

  return NextResponse.json({
    timestamp: new Date().toISOString(),
    summary: { succeeded, failed, totalDocs },
    results,
  });
}
