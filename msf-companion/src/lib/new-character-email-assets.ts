import { createHash } from "node:crypto";
import type { InlineEmailImage } from "@/lib/email";
import { sanitizeOfficialCharacterAssetUrl, type SyncedCharacter } from "@/lib/kb-official-sync";

const MAX_IMAGE_BYTES = 2_000_000;
const MAX_TOTAL_BYTES = 6_000_000;
const CHARACTER_TIMEOUT_MS = 10_000;
const IMAGE_TIMEOUT_MS = 4_000;

/** Images are optional enrichment: a missing/slow asset must never drop the kit. */
export async function prepareCharacterEmailAssets(character: SyncedCharacter): Promise<{
  character: SyncedCharacter;
  attachments: InlineEmailImage[];
}> {
  const attachments: InlineEmailImage[] = [];
  const resolved = new Map<string, string | undefined>();
  const deadline = Date.now() + CHARACTER_TIMEOUT_MS;
  let totalBytes = 0;

  async function embed(value: unknown): Promise<string | undefined> {
    const url = sanitizeOfficialCharacterAssetUrl(value);
    if (!url) return undefined;
    if (resolved.has(url)) return resolved.get(url);
    resolved.set(url, undefined);
    const remainingMs = deadline - Date.now();
    const byteLimit = Math.min(MAX_IMAGE_BYTES, MAX_TOTAL_BYTES - totalBytes);
    if (remainingMs <= 0 || byteLimit <= 0) return undefined;

    try {
      const response = await fetch(url, {
        redirect: "error",
        credentials: "omit",
        cache: "no-store",
        signal: AbortSignal.timeout(Math.min(IMAGE_TIMEOUT_MS, remainingMs)),
      });
      const type = response.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
      if (!response.ok || !response.body || (type !== "image/png" && type !== "image/jpeg")) {
        await response.body?.cancel();
        return undefined;
      }
      if (Number(response.headers.get("content-length")) > byteLimit) {
        await response.body.cancel();
        return undefined;
      }
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let bytes = 0;
      try {
        while (true) {
          const { done, value: chunk } = await reader.read();
          if (done) break;
          bytes += chunk.byteLength;
          if (bytes > byteLimit) {
            await reader.cancel();
            return undefined;
          }
          chunks.push(chunk);
        }
      } finally {
        reader.releaseLock();
      }
      const content = Buffer.concat(chunks, bytes);
      const validSignature = type === "image/png"
        ? content.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
        : content.length >= 3 && content[0] === 255 && content[1] === 216 && content[2] === 255;
      if (!validSignature) return undefined;
      const contentId = `msf-character-${createHash("sha256").update(url).digest("hex").slice(0, 24)}`;
      attachments.push({ filename: `${contentId}.${type === "image/png" ? "png" : "jpg"}`, content, contentType: type, contentId });
      totalBytes += bytes;
      const reference = `cid:${contentId}`;
      resolved.set(url, reference);
      return reference;
    } catch {
      // Do not log URLs, upstream bodies, or fail delivery for cosmetic assets.
      return undefined;
    }
  }

  // Prioritize the portrait so there is a fallback if full-body artwork is slow.
  const portrait = await embed(character.portrait);
  const fullBodyUrl = await embed(character.fullBodyArt?.url);
  const abilities: SyncedCharacter["abilities"] = [];
  for (const ability of character.abilities) {
    abilities.push({ ...ability, icon: await embed(ability.icon) });
  }
  return {
    character: {
      ...character,
      portrait,
      fullBodyArt: fullBodyUrl ? { ...character.fullBodyArt, url: fullBodyUrl } : undefined,
      abilities,
    },
    attachments,
  };
}
