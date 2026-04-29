/**
 * Timer-triggered Azure Function: Character Kits KB Sync
 * Fetches character kit data from the MSF API and indexes it in Azure AI Search.
 */

import { app, InvocationContext, Timer } from "@azure/functions";
import { generateCharacterKitDoc, CharacterData, KBDocument } from "../lib/kbGameData.js";

const SEARCH_ENDPOINT = process.env.AZURE_AI_SEARCH_ENDPOINT || "";
const SEARCH_KEY = process.env.AZURE_AI_SEARCH_KEY || "";
const MSF_API_KEY = process.env.MSF_API_KEY || "";
const MSF_API_BASE = "https://api.marvelstrikeforce.com";

export interface CharacterSyncDeps {
  fetchCharacters: () => Promise<CharacterData[]>;
  uploadDocuments: (docs: KBDocument[]) => Promise<{ succeeded: number; failed: number }>;
}

export async function syncCharacterKits(
  deps: CharacterSyncDeps,
  context: InvocationContext
): Promise<{ total: number; uploaded: number; errors: number }> {
  const characters = await deps.fetchCharacters();
  context.log(`Fetched ${characters.length} characters from MSF API`);

  const docs: KBDocument[] = [];
  let errors = 0;

  for (const char of characters) {
    try {
      docs.push(generateCharacterKitDoc(char));
    } catch (err) {
      context.warn(`Error generating doc for character ${char.id}: ${err}`);
      errors++;
    }
  }

  const result = await deps.uploadDocuments(docs);
  context.log(`Character sync complete: ${result.succeeded} uploaded, ${result.failed} failed, ${errors} generation errors`);

  return { total: characters.length, uploaded: result.succeeded, errors: errors + result.failed };
}

async function fetchCharactersFromAPI(): Promise<CharacterData[]> {
  const characters: CharacterData[] = [];
  let page = 1;
  const perPage = 200;

  while (true) {
    const response = await fetch(
      `${MSF_API_BASE}/game/v1/characters?charInfo=full&lang=en&page=${page}&perPage=${perPage}`,
      {
        headers: {
          "x-api-key": MSF_API_KEY,
          "Accept": "application/json",
        },
      }
    );

    if (!response.ok) {
      throw new Error(`MSF API error: ${response.status}`);
    }

    const data = (await response.json()) as {
      data?: Array<{
        id: string;
        name?: string;
        traits?: string[];
        abilities?: Array<{ name: string; description: string }>;
        teams?: string[];
      }>;
      meta?: { pagination?: { totalPages: number } };
    };

    if (!data.data || data.data.length === 0) break;

    for (const c of data.data) {
      characters.push({
        id: c.id,
        name: c.name || c.id,
        traits: c.traits || [],
        abilities: (c.abilities || []).map((a) => ({ name: a.name || "", description: a.description || "" })),
        teams: c.teams || [],
      });
    }

    const totalPages = data.meta?.pagination?.totalPages || 1;
    if (page >= totalPages) break;
    page++;
  }

  return characters;
}

async function uploadToSearch(docs: KBDocument[]): Promise<{ succeeded: number; failed: number }> {
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
        headers: {
          "Content-Type": "application/json",
          "api-key": SEARCH_KEY,
        },
        body: JSON.stringify({
          value: batch.map((doc) => ({
            "@search.action": "mergeOrUpload",
            ...doc,
          })),
        }),
      }
    );

    if (response.ok) {
      succeeded += batch.length;
    } else {
      failed += batch.length;
    }
  }

  return { succeeded, failed };
}

app.timer("kbCharacterSync", {
  schedule: "0 10 5 * * *", // 05:10 UTC daily (part of game data sync window)
  handler: async (_timer: Timer, context: InvocationContext) => {
    context.log("Starting character kits KB sync");

    if (!SEARCH_ENDPOINT || !SEARCH_KEY) {
      context.error("Azure AI Search not configured — skipping character sync");
      return;
    }

    const deps: CharacterSyncDeps = {
      fetchCharacters: fetchCharactersFromAPI,
      uploadDocuments: uploadToSearch,
    };

    await syncCharacterKits(deps, context);
  },
});
