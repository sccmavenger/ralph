import { hashEmailAddress, sendTrackedEmail } from "@/lib/email";
import {
  emailTestRecipient,
  newCharacterEmailAutomationMode,
  type EmailAutomationMode,
} from "@/lib/email-automation";
import type { SyncedCharacter } from "@/lib/kb-official-sync";
import { prisma } from "@/lib/prisma";

const LIVE_SEND_INTERVAL_MS = 300;

interface NewCharacterRecipient {
  id: string;
  email: string;
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

export function buildNewCharacterEmailHtml(character: SyncedCharacter): string {
  const name = escapeHtml(character.name);
  const traits = escapeHtml(character.traits.join(", ") || "Unknown");
  const teams = escapeHtml(character.teams.join(", ") || "Not yet assigned");
  const abilityRows = character.abilities.map((ability) =>
    `<tr><td style="color:#4f9cf7;padding:6px 10px 6px 0;font-weight:600;vertical-align:top">${escapeHtml(ability.name)}</td><td style="color:#ccc;padding:6px 0;line-height:1.5">${escapeHtml(ability.description)}</td></tr>`
  ).join("");
  return `<!doctype html><html lang="en"><body style="margin:0;background:#0f0f23;font-family:Arial,sans-serif"><div style="max-width:600px;margin:auto;padding:32px 20px"><h1 style="color:#4f9cf7;text-align:center">New MSF Character Detected</h1><div style="background:#1a1a3e;border-radius:16px;padding:28px;color:#fff"><h2 style="margin-top:0">${name}</h2><p>Traits: ${traits}</p><p>Team traits: ${teams}</p>${abilityRows ? `<table style="width:100%;font-size:14px">${abilityRows}</table>` : ""}</div><p style="text-align:center"><a href="https://themsftoolkit.com/heroes" style="display:inline-block;background:#4f9cf7;color:#fff;padding:12px 28px;border-radius:9999px;text-decoration:none">View Heroes Database</a></p></div></body></html>`;
}

async function getNewCharacterRecipients(
  mode: Exclude<EmailAutomationMode, "disabled">
): Promise<NewCharacterRecipient[]> {
  const testEmail = emailTestRecipient();
  if (mode === "test" && !testEmail) return [];

  const candidates = await prisma.commander.findMany({
    where: {
      disabled: false,
      email: mode === "test"
        ? { equals: testEmail!, mode: "insensitive" }
        : { not: null },
      emailNewCharacters: true,
      emailConsentSource: { not: null },
    },
    select: { id: true, email: true },
  });

  const uniqueByHash = new Map<string, NewCharacterRecipient>();
  for (const candidate of candidates) {
    const email = candidate.email?.trim();
    if (!email) continue;
    const hash = hashEmailAddress(email);
    if (!uniqueByHash.has(hash)) {
      uniqueByHash.set(hash, { id: candidate.id, email });
    }
  }
  if (!uniqueByHash.size) return [];

  const hardSuppressions = await prisma.emailDelivery.findMany({
    where: {
      recipientHash: { in: [...uniqueByHash.keys()] },
      OR: [
        { status: { in: ["bounced", "complained"] } },
        // Provider suppressions follow a real attempt. A local preference
        // suppression has attemptCount=0 and must not block a later opt-in.
        { status: "suppressed", attemptCount: { gt: 0 } },
      ],
    },
    select: { recipientHash: true },
  });
  for (const suppression of hardSuppressions) {
    uniqueByHash.delete(suppression.recipientHash);
  }

  return [...uniqueByHash.values()];
}

export async function sendNewCharacterEmails(characters: SyncedCharacter[]): Promise<number> {
  const mode = newCharacterEmailAutomationMode();
  if (mode === "disabled" || !characters.length) return 0;

  const recipients = await getNewCharacterRecipients(mode);
  let sent = 0;
  let attempted = 0;
  for (const character of characters) {
    for (const recipient of recipients) {
      if (mode === "live" && attempted > 0) {
        await new Promise((resolve) => setTimeout(resolve, LIVE_SEND_INTERVAL_MS));
      }
      attempted++;
      try {
        const result = await sendTrackedEmail({
          commanderId: recipient.id,
          to: recipient.email,
          subject: `New Character Detected: ${character.name}`,
          html: buildNewCharacterEmailHtml(character),
          messageType: "new_character",
          idempotencyKey: `new-character:${character.id}:${recipient.id}`,
          preference: "newCharacters",
          metadata: { characterId: character.id, automationMode: mode },
        });
        if (result.status === "sent") sent++;
      } catch (error) {
        console.warn(`[KB Sync] New-character email failed: ${safeDeliveryError(error, recipient.email)}`);
      }
    }
  }
  return sent;
}

function safeDeliveryError(error: unknown, recipient: string): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replaceAll(recipient, "[recipient]").slice(0, 500);
}
