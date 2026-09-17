import { hashEmailAddress, sendTrackedEmail } from "@/lib/email";
import {
  emailTestRecipient,
  newCharacterEmailAutomationMode,
  type EmailAutomationMode,
} from "@/lib/email-automation";
import type { SyncedCharacter } from "@/lib/kb-official-sync";
import { prepareCharacterEmailAssets } from "@/lib/new-character-email-assets";
import { buildNewCharacterEmailHtml, buildNewCharacterEmailText } from "@/lib/new-character-email-template";
import { prisma } from "@/lib/prisma";

export { buildNewCharacterEmailHtml } from "@/lib/new-character-email-template";

const LIVE_SEND_INTERVAL_MS = 300;

interface NewCharacterRecipient {
  id: string;
  email: string;
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
  if (!recipients.length) return 0;
  let sent = 0;
  let attempted = 0;
  for (const character of characters) {
    // Prepare the approved spotlight once per character, not once per mailbox.
    const prepared = await prepareCharacterEmailAssets(character);
    const html = buildNewCharacterEmailHtml(prepared.character);
    const text = buildNewCharacterEmailText(prepared.character);
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
          html,
          text,
          attachments: prepared.attachments,
          messageType: "new_character",
          idempotencyKey: `new-character:${character.id}:${recipient.id}`,
          preference: "newCharacters",
          metadata: { characterId: character.id, automationMode: mode, templateVersion: "spotlight-v1" },
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
