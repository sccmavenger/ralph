// Read-only official-data and local render verification. Never sends email or syncs KB.
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import dotenv from "dotenv";
import { chromium } from "@playwright/test";
import { mapSyncedCharacter } from "../src/lib/kb-official-sync";
import { prepareCharacterEmailAssets } from "../src/lib/new-character-email-assets";
import { buildNewCharacterEmailHtml } from "../src/lib/new-character-email-template";

dotenv.config({ path: [".env.local", ".env"], quiet: true });

async function readWithRetry(url: string, init: RequestInit, stage: string): Promise<Response> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(url, { ...init, signal: AbortSignal.timeout(25_000) });
      if (attempt === 2 || ![408, 429, 500, 502, 503, 504].includes(response.status)) return response;
      await response.body?.cancel();
    } catch (error) {
      if (attempt === 2) throw new Error(`${stage}: ${error instanceof Error ? error.message : "network error"}`);
    }
    await new Promise(resolve => setTimeout(resolve, 500 * 2 ** attempt));
  }
  throw new Error(`${stage}: no response`);
}

async function main() {
  const tokenResponse = await readWithRetry("https://hydra-public.prod.m3.scopelypv.com/oauth2/token", {
    method: "POST", headers: { Authorization: `Basic ${Buffer.from(`${process.env.SCOPELY_CLIENT_ID}:${process.env.SCOPELY_CLIENT_SECRET}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials", signal: AbortSignal.timeout(25_000),
  }, "OAuth");
  assert.ok(tokenResponse.ok, `OAuth ${tokenResponse.status}`);
  const token = (await tokenResponse.json()).access_token;
  const selected: NonNullable<ReturnType<typeof mapSyncedCharacter>>[] = [];
  let count = 0;
  let pages = 0;
  for (let page = 1; page <= 100; page++) {
    const query = new URLSearchParams({ lang: "en", page: String(page), perPage: "10", abilityKits: "full", costumes: "full", traitFormat: "id", charAdoption: "full" });
    const response = await readWithRetry(`https://api.marvelstrikeforce.com/game/v1/characters?${query}`, {
      headers: { Authorization: `Bearer ${token}`, "x-api-key": process.env.MSF_API_KEY!, "User-Agent": "MSFToolkit/2.0 (Read-only Release Validation)" },
      signal: AbortSignal.timeout(25_000),
    }, `Catalog page ${page}`);
    assert.ok(response.ok, `Catalog page ${page} returned ${response.status}`);
    const payload = await response.json();
    assert.ok(Array.isArray(payload.data));
    count += payload.data.length;
    pages++;
    for (const raw of payload.data) {
      const character = mapSyncedCharacter(raw);
      if (character && ["WaspJanet", "S_ShieldDmg_AoE", "S_ShieldSupport_Heal"].includes(character.id)) selected.push(character);
    }
    if (page * payload.meta.perPage >= payload.meta.perTotal) {
      assert.equal(count, payload.meta.perTotal);
      break;
    }
  }
  assert.equal(selected.length, 3);
  console.log(JSON.stringify({ officialCatalog: "passed", pages, count, mutation: false }));
  const out = path.resolve(".azure/validation/spotlight-release");
  await mkdir(out, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  try {
    for (const character of selected) {
      const prepared = await prepareCharacterEmailAssets(character);
      const html = buildNewCharacterEmailHtml(prepared.character);
      assert.ok(Buffer.byteLength(html) < 90_000);
      assert.ok(!html.includes("REQUESTED RESEND") && !html.includes("SAMPLE"));
      let preview = html;
      for (const image of prepared.attachments) preview = preview.replaceAll(`cid:${image.contentId}`, `data:${image.contentType};base64,${image.content.toString("base64")}`);
      await writeFile(path.join(out, `${character.id}.html`), preview);
      for (const width of [320, 402, 600]) {
        const page = await browser.newPage({ viewport: { width, height: 874 } });
        await page.setContent(preview);
        await page.evaluate(() => Promise.all([...document.images].map(image => image.decode())));
        const result = await page.evaluate(() => ({ overflow: document.documentElement.scrollWidth > innerWidth, images: [...document.images].every(image => image.naturalWidth > 0), abilities: document.querySelectorAll("h3").length }));
        assert.equal(result.overflow, false);
        assert.equal(result.images, true);
        assert.equal(result.abilities, character.abilities.length);
        if (width === 402) await page.screenshot({ path: path.join(out, `${character.id}-402.png`), fullPage: true });
        await page.close();
      }
      console.log(JSON.stringify({ rendered: character.name, widths: [320, 402, 600], abilities: character.abilities.length, embeddedImages: prepared.attachments.length, htmlBytes: Buffer.byteLength(html), sent: false }));
    }
  } finally { await browser.close(); }
}

main().catch(error => { console.error(error instanceof Error ? error.message : "Release verification failed"); process.exitCode = 1; });
