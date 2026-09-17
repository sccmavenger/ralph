import { createHash } from "node:crypto";
import { createKnowledgeDocument, cleanKnowledgeText, type KnowledgeDocument } from "@/lib/kb-contract";
import { uploadKnowledgeDocuments } from "@/lib/kb-search";

const MSF_API_BASE = "https://api.marvelstrikeforce.com";
const HYDRA_TOKEN_URL = "https://hydra-public.prod.m3.scopelypv.com/oauth2/token";
const TWILL_API_BASE = "https://api-prod.marvelstrikeforce.com/services/twill";
const FETCH_TIMEOUT_MS = 25_000;

export interface SyncedCharacter {
  id: string;
  name: string;
  traits: string[];
  portrait?: string;
  fullBodyArt?: { url: string; costumeName?: string };
  abilities: Array<{
    name: string;
    description: string;
    type?: "basic" | "special" | "ultimate" | "passive";
    icon?: string;
    level?: number;
  }>;
  teams: string[];
}

export interface KnowledgeSourceSyncResult {
  name: "characters" | "meta" | "blog" | "reddit";
  success: boolean;
  docsUploaded: number;
  recordsRead: number;
  newestSourceDate?: string;
  error?: string;
}

export interface OfficialKnowledgeSyncResult {
  results: KnowledgeSourceSyncResult[];
  characters: SyncedCharacter[];
}

async function retryFetch(url: string, init: RequestInit = {}, attempts = 3): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const response = await fetch(url, { ...init, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
      if (response.ok || ![408, 429, 500, 502, 503, 504].includes(response.status)) return response;
      lastError = new Error(`${response.status} ${response.statusText}`);
    } catch (error) {
      lastError = error;
    }
    if (attempt < attempts - 1) await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** attempt));
  }
  throw lastError instanceof Error ? lastError : new Error("Request failed after retries");
}

async function getBearerToken(): Promise<string> {
  const clientId = process.env.SCOPELY_CLIENT_ID || "";
  const clientSecret = process.env.SCOPELY_CLIENT_SECRET || "";
  if (!clientId || !clientSecret) throw new Error("Scopely OAuth credentials are not configured");
  const response = await retryFetch(HYDRA_TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!response.ok) throw new Error(`Scopely OAuth returned ${response.status}`);
  const payload = (await response.json()) as { access_token?: string };
  if (!payload.access_token) throw new Error("Scopely OAuth did not return an access token");
  return payload.access_token;
}

function msfHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    "x-api-key": process.env.MSF_API_KEY || "",
    Accept: "application/json",
    "User-Agent": "MSFToolkit/2.0 (Knowledge Sync)",
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

/** Optional upstream artwork must never turn into an arbitrary remote fetch. */
export function sanitizeOfficialCharacterAssetUrl(value: unknown): string | undefined {
  if (typeof value !== "string"
    || !/^https:\/\/assets\.marvelstrikeforce\.com\/[^?#]+$/i.test(value)
    || /[\\\u0000-\u0020\u007f]/.test(value)) return undefined;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.hostname !== "assets.marvelstrikeforce.com"
      || url.username || url.password || url.port || url.search || url.hash) return undefined;
    return url.href;
  } catch {
    return undefined;
  }
}

function bestLevelDescription(ability: unknown): { description: string; level?: number } {
  const record = asRecord(ability);
  const levels = asRecord(record.levels);
  const descriptions = Object.entries(levels)
    .filter(([key]) => /^[1-9]\d*$/.test(key) && Number.isSafeInteger(Number(key)))
    .sort(([a], [b]) => Number(b) - Number(a))
    .map(([key, value]) => {
      const description = asRecord(value).description;
      return {
        level: Number(key),
        description: typeof description === "string" ? cleanKnowledgeText(description) : "",
      };
    })
    .filter(({ description }) => description.length > 0);
  return descriptions[0] || {
    description: typeof record.description === "string" ? cleanKnowledgeText(record.description) : "",
  };
}

export function extractCharacterAbilities(raw: Record<string, unknown>): SyncedCharacter["abilities"] {
  const kit = asRecord(raw.abilityKit);
  const labels = [
    ["basic", "Basic"],
    ["special", "Special"],
    ["ultimate", "Ultimate"],
    ["passive", "Passive"],
  ] as const;
  return labels.flatMap(([key, fallbackName]) => {
    const ability = asRecord(kit[key]);
    const { description, level } = bestLevelDescription(ability);
    if (!description) return [];
    const icon = sanitizeOfficialCharacterAssetUrl(ability.icon);
    return [{
      name: typeof ability.name === "string" && ability.name.trim() ? ability.name : fallbackName,
      description,
      type: key,
      ...(icon ? { icon } : {}),
      ...(level !== undefined ? { level } : {}),
    }];
  });
}

export function mapSyncedCharacter(raw: Record<string, unknown>): SyncedCharacter | null {
  const id = String(raw.id || "").trim();
  if (!id) return null;
  const traits = asStringArray(raw.traits);
  const portrait = sanitizeOfficialCharacterAssetUrl(raw.portrait);
  // Alternate skins can look like a different character. Only use the base
  // costume; absent artwork is normal and the email can fall back to portrait.
  const costume = asRecord(asRecord(raw.costumes)["0"]);
  const fullArt = sanitizeOfficialCharacterAssetUrl(costume.fullArt);
  const costumeName = typeof costume.name === "string" ? costume.name.trim() : "";
  return {
    id,
    name: String(raw.name || id),
    traits,
    abilities: extractCharacterAbilities(raw),
    teams: traits.filter((trait) => /team|squad/i.test(trait)),
    ...(portrait ? { portrait } : {}),
    ...(fullArt ? { fullBodyArt: { url: fullArt, ...(costumeName ? { costumeName } : {}) } } : {}),
  };
}

function extractIsoRecommendations(raw: Record<string, unknown>): string[] {
  const adoption = raw.iso8ClassAdoption;
  if (Array.isArray(adoption)) {
    return adoption.map((item) => {
      const row = asRecord(item);
      const name = String(row.id || row.class || row.name || "Unknown");
      const percentage = Number(row.percent || row.percentage || row.adoption || 0);
      return percentage ? `${name}: ${Math.round(percentage * (percentage <= 1 ? 100 : 1))}%` : name;
    });
  }
  return Object.entries(asRecord(adoption)).map(([name, value]) => {
    const percentage = Number(value);
    return Number.isFinite(percentage)
      ? `${name}: ${Math.round(percentage * (percentage <= 1 ? 100 : 1))}%`
      : name;
  });
}

async function fetchCharacters(token: string): Promise<{ characters: SyncedCharacter[]; docs: KnowledgeDocument[] }> {
  const rows: Array<Record<string, unknown>> = [];
  for (let page = 1; ; page++) {
    const params = new URLSearchParams({
      lang: "en",
      page: String(page),
      // Full ability kits are large enough that the API rejects some 25-row
      // pages with status 472. Ten keeps every response below that limit.
      perPage: "10",
      abilityKits: "full",
      costumes: "full",
      traitFormat: "id",
      charAdoption: "full",
    });
    const response = await retryFetch(`${MSF_API_BASE}/game/v1/characters?${params}`, { headers: msfHeaders(token) });
    if (!response.ok) throw new Error(`Characters API returned ${response.status} on page ${page}`);
    const payload = (await response.json()) as { data?: unknown[]; meta?: { perTotal?: number; perPage?: number } };
    rows.push(...(payload.data || []).map(asRecord));
    const totalPages = Math.max(1, Math.ceil((payload.meta?.perTotal || rows.length) / (payload.meta?.perPage || 10)));
    if (page >= totalPages) break;
  }

  const now = new Date().toISOString();
  const characters: SyncedCharacter[] = [];
  const docs: KnowledgeDocument[] = [];
  for (const row of rows) {
    const character = mapSyncedCharacter(row);
    if (!character) continue;
    const { id, name, traits, abilities, teams } = character;
    const iso = extractIsoRecommendations(row);
    characters.push(character);

    const content = [
      `${name} is a current Marvel Strike Force character.`,
      traits.length ? `Traits: ${traits.join(", ")}.` : "",
      teams.length ? `Team traits: ${teams.join(", ")}.` : "",
      ...abilities.map((ability) => `${ability.name}: ${ability.description}`),
      iso.length ? `Player ISO-8 class adoption: ${iso.join(", ")}.` : "",
    ].filter(Boolean).join("\n");
    docs.push(createKnowledgeDocument({
      id: `char-${id}`,
      content,
      category: "character-kits",
      sourceCreatorName: "MSF Game Data",
      sourceTitle: `${name} Character Kit`,
      sourceUrl: `${MSF_API_BASE}/game/v1/characters/${encodeURIComponent(id)}`,
      sourcePublishedAt: now,
      sourceType: "api-game-data",
      sourceId: id,
    }));
  }
  return { characters, docs };
}

export function calculateMetaPerformance(mode: string, row: Record<string, unknown>): { successes: number; total: number; rate: number } {
  if (mode === "crucible-defense") {
    const total = Number(row.defends) || 0;
    const defeats = Number(row.defeats) || 0;
    const successes = Math.max(0, total - defeats);
    return { successes, total, rate: total ? Math.round(successes / total * 100) : 0 };
  }
  const total = Number(row.total) || 0;
  const successes = Number(row.wins) || 0;
  return { successes, total, rate: total ? Math.round(successes / total * 100) : 0 };
}

async function fetchMeta(token: string, characterNames: Map<string, string>): Promise<KnowledgeDocument[]> {
  const modes = [
    { name: "war-offense", endpoint: "/game/v1/analysis/war/offense" },
    { name: "war-defense", endpoint: "/game/v1/analysis/war/defense" },
    { name: "crucible-defense", endpoint: "/game/v1/analysis/crucible/defense" },
  ];
  const now = new Date().toISOString();
  const docs: KnowledgeDocument[] = [];
  for (const mode of modes) {
    const response = await retryFetch(`${MSF_API_BASE}${mode.endpoint}?page=1&perPage=50`, { headers: msfHeaders(token) });
    if (!response.ok) throw new Error(`${mode.name} API returned ${response.status}`);
    const payload = (await response.json()) as { data?: unknown[] };
    for (const [index, item] of (payload.data || []).entries()) {
      const row = asRecord(item);
      const squad = asStringArray(row.squad);
      if (!squad.length) continue;
      const names = squad.map((id) => characterNames.get(id) || id);
      const performance = calculateMetaPerformance(mode.name, row);
      const squadKey = createHash("sha1").update([...squad].sort().join("|")).digest("hex").slice(0, 14);
      const label = mode.name.replace(/-/g, " ");
      docs.push(createKnowledgeDocument({
        id: `meta-${mode.name}-${squadKey}`,
        content: `${label} squad rank #${index + 1}: ${names.join(", ")}. It appears in ${performance.total.toLocaleString()} sampled battles with ${performance.successes.toLocaleString()} successful results (${performance.rate}% success). Popularity and performance are separate signals; appearances indicate usage, while success rate indicates results.`,
        category: mode.name.includes("war") ? "war-meta" : "crucible",
        sourceCreatorName: "MSF Game Data",
        sourceTitle: `${label} squad #${index + 1}`,
        sourceUrl: `${MSF_API_BASE}${mode.endpoint}`,
        sourcePublishedAt: now,
        sourceType: "api-game-data",
        sourceId: `${mode.name}:${squadKey}`,
      }));
    }
  }
  return docs;
}

function htmlToText(html: string): string {
  return cleanKnowledgeText(html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<\/(?:p|h[1-6]|li|ul|ol)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "- ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code))));
}

function chunkText(text: string, maxWords = 900): string[] {
  const words = text.split(/\s+/);
  if (words.length <= maxWords) return [text];
  const chunks: string[] = [];
  for (let start = 0; start < words.length; start += maxWords - 75) {
    chunks.push(words.slice(start, start + maxWords).join(" "));
  }
  return chunks;
}

function parseTwillDate(date: string): string {
  const normalized = date.includes("T") ? date : date.replace(" ", "T") + "Z";
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
}

async function fetchBlogDocuments(): Promise<KnowledgeDocument[]> {
  const listing = await retryFetch(`${TWILL_API_BASE}/getArticles?lang=en&pageSize=30&pageStart=0`);
  if (!listing.ok) throw new Error(`Official blog listing returned ${listing.status}`);
  const articles = (await listing.json()) as Array<{ id: number; date: string; slug: string; title: string; description?: string }>;
  const docs: KnowledgeDocument[] = [];
  for (const article of articles) {
    const response = await retryFetch(`${TWILL_API_BASE}/getArticle?lang=en&slug=${encodeURIComponent(article.slug)}`);
    if (!response.ok) continue;
    const detail = (await response.json()) as { content?: Array<{ value?: string }> };
    const text = htmlToText((detail.content || []).map((part) => part.value || "").join("\n"));
    if (text.length < 100) continue;
    chunkText(text).forEach((chunk, index) => docs.push(createKnowledgeDocument({
      id: `blog-${article.id}-${index}`,
      content: `${article.title}\n\n${chunk}`,
      category: /crucible/i.test(article.title) ? "crucible" : /war/i.test(article.title) ? "war-meta" : "news-events",
      sourceCreatorName: "Scopely Official",
      sourceTitle: article.title,
      sourceUrl: `https://marvelstrikeforce.com/en/updates/${article.slug}`,
      sourcePublishedAt: parseTwillDate(article.date),
      sourceType: "official-blog",
      sourceId: String(article.id),
    })));
  }
  return docs;
}

async function fetchRedditDocuments(): Promise<KnowledgeDocument[]> {
  // Reddit's unauthenticated JSON endpoint now rejects server clients, while
  // its public Atom feed remains supported. Community content is deliberately
  // tier 3 and never overrides official sources.
  const response = await retryFetch("https://www.reddit.com/r/MarvelStrikeForce/top/.rss?t=week", {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; MSFToolkit/2.0; knowledge sync)" },
  });
  if (!response.ok) throw new Error(`Reddit feed returned ${response.status}`);
  const xml = await response.text();
  const decode = (value: string) => value
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, "&");
  return [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].flatMap((entry) => {
    const item = entry[1];
    const rawId = item.match(/<id>([^<]+)<\/id>/)?.[1] || "";
    const id = rawId.split("_").at(-1) || rawId.replace(/[^A-Za-z0-9_-]/g, "");
    const title = decode(item.match(/<title>([\s\S]*?)<\/title>/)?.[1] || "");
    const body = htmlToText(decode(item.match(/<content[^>]*>([\s\S]*?)<\/content>/)?.[1] || ""));
    const updated = item.match(/<updated>([^<]+)<\/updated>/)?.[1] || new Date().toISOString();
    const url = decode(item.match(/<link[^>]+href="([^"]+)"/)?.[1] || "");
    if (!id || body.length < 100 || /\bhumou?r\b|\bmeme\b|shitpost|fan art/i.test(title)) return [];
    const normalized = title.toLowerCase();
    const category = /war|alliance/.test(normalized) ? "war-meta"
      : /crucible|arena/.test(normalized) ? "crucible"
        : /team|build|comp/.test(normalized) ? "team-building" : "general";
    return [createKnowledgeDocument({
      id: `reddit-${id}`,
      content: `${title}\n\n${body}`.slice(0, 12_000),
      category,
      sourceCreatorName: "Reddit Community",
      sourceTitle: title,
      sourceUrl: url,
      sourcePublishedAt: updated,
      sourceType: "reddit-post",
      sourceId: id,
    })];
  });
}

async function uploadSource(name: KnowledgeSourceSyncResult["name"], docs: KnowledgeDocument[]): Promise<KnowledgeSourceSyncResult> {
  const uploaded = await uploadKnowledgeDocuments(docs);
  return {
    name,
    success: uploaded.failed === 0,
    docsUploaded: uploaded.succeeded,
    recordsRead: docs.length,
    newestSourceDate: docs.map((doc) => doc.sourcePublishedAt).sort().at(-1),
    ...(uploaded.errors.length ? { error: uploaded.errors.slice(0, 3).join("; ") } : {}),
  };
}

export async function runOfficialKnowledgeSync(): Promise<OfficialKnowledgeSyncResult> {
  const results: KnowledgeSourceSyncResult[] = [];
  let characters: SyncedCharacter[] = [];
  let token = "";
  try {
    token = await getBearerToken();
    const characterData = await fetchCharacters(token);
    characters = characterData.characters;
    results.push(await uploadSource("characters", characterData.docs));
  } catch (error) {
    results.push({ name: "characters", success: false, docsUploaded: 0, recordsRead: 0, error: error instanceof Error ? error.message : String(error) });
  }

  try {
    if (!token) token = await getBearerToken();
    const names = new Map(characters.map((character) => [character.id, character.name]));
    const docs = await fetchMeta(token, names);
    results.push(await uploadSource("meta", docs));
  } catch (error) {
    results.push({ name: "meta", success: false, docsUploaded: 0, recordsRead: 0, error: error instanceof Error ? error.message : String(error) });
  }

  for (const [name, fetcher] of [["blog", fetchBlogDocuments], ["reddit", fetchRedditDocuments]] as const) {
    try {
      results.push(await uploadSource(name, await fetcher()));
    } catch (error) {
      results.push({ name, success: false, docsUploaded: 0, recordsRead: 0, error: error instanceof Error ? error.message : String(error) });
    }
  }
  return { results, characters };
}
