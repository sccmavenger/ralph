import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";
import { runOfficialKnowledgeSync, type SyncedCharacter } from "@/lib/kb-official-sync";

interface SyncResult {
  name: string;
  success: boolean;
  docsUploaded: number;
  recordsRead?: number;
  newestSourceDate?: string;
  notificationsCreated?: number;
  emailsSent?: number;
  error?: string;
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function buildNewCharacterEmailHtml(character: SyncedCharacter): string {
  const name = escapeHtml(character.name);
  const traits = escapeHtml(character.traits.join(", ") || "Unknown");
  const teams = escapeHtml(character.teams.join(", ") || "Not yet assigned");
  const abilityRows = character.abilities.map((ability) =>
    `<tr><td style="color:#4f9cf7;padding:6px 10px 6px 0;font-weight:600;vertical-align:top">${escapeHtml(ability.name)}</td><td style="color:#ccc;padding:6px 0;line-height:1.5">${escapeHtml(ability.description)}</td></tr>`
  ).join("");
  return `<!doctype html><html lang="en"><body style="margin:0;background:#0f0f23;font-family:Arial,sans-serif"><div style="max-width:600px;margin:auto;padding:32px 20px"><h1 style="color:#4f9cf7;text-align:center">New MSF Character Detected</h1><div style="background:#1a1a3e;border-radius:16px;padding:28px;color:#fff"><h2 style="margin-top:0">${name}</h2><p>Traits: ${traits}</p><p>Team traits: ${teams}</p>${abilityRows ? `<table style="width:100%;font-size:14px">${abilityRows}</table>` : ""}</div><p style="text-align:center"><a href="https://themsftoolkit.com/heroes" style="display:inline-block;background:#4f9cf7;color:#fff;padding:12px 28px;border-radius:9999px;text-decoration:none">View Heroes Database</a></p></div></body></html>`;
}

async function sendNewCharacterEmails(characters: SyncedCharacter[]): Promise<number> {
  const testEmail = process.env.NEW_CHARACTER_EMAIL_TEST || "";
  const recipients = testEmail ? [{ email: testEmail }] : await prisma.commander.findMany({
    where: { disabled: false, email: { not: null }, emailDigestOptOut: false },
    select: { email: true },
  });
  let sent = 0;
  for (const character of characters) {
    for (const recipient of recipients) {
      if (!recipient.email) continue;
      try {
        await sendEmail(recipient.email, `New Character Detected: ${character.name}`, buildNewCharacterEmailHtml(character));
        sent++;
      } catch (error) {
        console.warn(`[KB Sync] New-character email failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }
  return sent;
}

async function detectNewCharacters(characters: SyncedCharacter[]): Promise<SyncResult> {
  if (!characters.length) return { name: "new-character-detection", success: false, docsUploaded: 0, error: "Character sync returned no records" };
  const known = await prisma.gameCharacter.findMany({ select: { characterId: true } });
  const knownIds = new Set(known.map((character) => character.characterId));
  const newCharacters = characters.filter((character) => !knownIds.has(character.id));
  if (!newCharacters.length) return { name: "new-character-detection", success: true, docsUploaded: 0 };

  await prisma.gameCharacter.createMany({
    data: newCharacters.map((character) => ({ characterId: character.id, name: character.name, traits: character.traits })),
    skipDuplicates: true,
  });
  if (!knownIds.size) return { name: "new-character-detection", success: true, docsUploaded: 0, recordsRead: newCharacters.length, error: `Seeded ${newCharacters.length} baseline characters without notifications` };

  const commanders = await prisma.commander.findMany({ where: { disabled: false }, select: { id: true } });
  let notifications = 0;
  for (const character of newCharacters) {
    const rows = commanders.map((commander) => ({
      commanderId: commander.id,
      type: "new-character",
      title: `New Character Detected: ${character.name}`,
      message: `${character.name} has been added to the game. Traits: ${character.traits.join(", ")}`,
      linkUrl: "/heroes",
      metadata: { characterId: character.id, name: character.name, traits: character.traits },
    }));
    if (rows.length) {
      await prisma.commanderNotification.createMany({ data: rows });
      notifications += rows.length;
    }
  }
  const emails = await sendNewCharacterEmails(newCharacters);
  return {
    name: "new-character-detection",
    success: true,
    docsUploaded: 0,
    recordsRead: newCharacters.length,
    notificationsCreated: notifications,
    emailsSent: emails,
  };
}

export async function GET() {
  return NextResponse.json({ status: "ok", description: "POST with the cron bearer token to refresh official Advisor knowledge" });
}

export async function POST(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!process.env.AZURE_AI_SEARCH_ENDPOINT || !process.env.AZURE_AI_SEARCH_KEY) {
    return NextResponse.json({ error: "Azure AI Search is not configured" }, { status: 500 });
  }
  if (!process.env.MSF_API_KEY || !process.env.SCOPELY_CLIENT_ID || !process.env.SCOPELY_CLIENT_SECRET) {
    return NextResponse.json({ error: "MSF API credentials are not configured" }, { status: 500 });
  }

  const sync = await runOfficialKnowledgeSync();
  const results: SyncResult[] = sync.results;
  try {
    results.push(await detectNewCharacters(sync.characters));
  } catch (error) {
    results.push({ name: "new-character-detection", success: false, docsUploaded: 0, error: error instanceof Error ? error.message : String(error) });
  }
  const failed = results.filter((result) => !result.success).length;
  const summary = {
    succeeded: results.length - failed,
    failed,
    totalDocs: results.reduce((total, result) => total + result.docsUploaded, 0),
    recordsRead: results.reduce((total, result) => total + (result.recordsRead || 0), 0),
  };
  return NextResponse.json({ timestamp: new Date().toISOString(), summary, results }, { status: failed ? 207 : 200 });
}
