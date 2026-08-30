import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { runOfficialKnowledgeSync, type SyncedCharacter } from "@/lib/kb-official-sync";
import { sendNewCharacterEmails } from "@/lib/new-character-email";

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
