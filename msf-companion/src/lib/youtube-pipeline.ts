/**
 * YouTube Transcription Pipeline for MSF Knowledge Base
 * 
 * Fetches transcripts from MSF YouTube creators, chunks them into
 * meaningful segments, and uploads to Azure AI Search.
 */

import { execSync } from "child_process";
import { mkdtempSync, readFileSync, rmSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

// MSF Creator Channels
export const MSF_CREATORS = [
  { name: "ValleyFlyin", channelId: "UCS-lJoP-GG2g0-nZMQCn_cQ", handle: "@ValleyFlyin" },
  { name: "Boilon", channelId: "UC7lNaBgwLVbXIwUTy9tRg3w", handle: "@Boilon" },
  { name: "Rayge Gaming", channelId: "UChjcK7ujFYVlOINJGHv-Miw", handle: "@RaygeGaming" },
  { name: "MobileGamer365", channelId: "UCKjqnZEvjlf4TPtt9dmqhYw", handle: "@MobileGamer365" },
  { name: "Remanx", channelId: "UCuHM3BHONp2T8BEhunLfRDw", handle: "@remanx" },
  { name: "OhEmGee", channelId: "UCWnlPyy93myHvmFmD533BGg", handle: "@OhEmGee" },
];

const SEARCH_ENDPOINT = process.env.AZURE_AI_SEARCH_ENDPOINT || "";
const SEARCH_KEY = process.env.AZURE_AI_SEARCH_KEY || "";
const INDEX_NAME = "msf-knowledge";

export interface VideoInfo {
  videoId: string;
  title: string;
  creator: string;
  published: string;
  url: string;
}

export interface KnowledgeDocument {
  id: string;
  content: string;
  sourceCreatorName: string;
  sourceVideoTitle: string;
  sourceUrl: string;
  sourceDate: string;
  category: string;
}

export interface IngestResult {
  videosProcessed: number;
  documentsUploaded: number;
  errors: string[];
  skippedVideos: string[];
  newVideosFound: number;
}

/**
 * Fetch recent videos from a YouTube channel via RSS feed
 */
export async function fetchChannelVideos(channelId: string, creatorName: string, maxVideos = 15): Promise<VideoInfo[]> {
  const resp = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`);
  if (!resp.ok) return [];

  const xml = await resp.text();
  const entries = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)];
  const videos: VideoInfo[] = [];

  for (const entry of entries.slice(0, maxVideos)) {
    const content = entry[1];
    const videoId = content.match(/<yt:videoId>([^<]+)/)?.[1];
    const title = content.match(/<title>([^<]+)/)?.[1];
    const published = content.match(/<published>([^<]+)/)?.[1];

    if (!videoId || !title) continue;

    // Filter for MSF-related content
    const t = title.toLowerCase();
    if (
      t.includes("msf") ||
      t.includes("strike force") ||
      t.includes("marvel") ||
      t.includes("crucible") ||
      t.includes("dark dimension") ||
      t.includes("tier list")
    ) {
      videos.push({
        videoId,
        title: decodeHtmlEntities(title),
        creator: creatorName,
        published: published?.substring(0, 10) || "",
        url: `https://www.youtube.com/watch?v=${videoId}`,
      });
    }
  }

  return videos;
}

/**
 * Fetch transcript for a YouTube video using yt-dlp
 */
export async function fetchTranscript(videoId: string): Promise<string | null> {
  // Validate videoId format (YouTube IDs are 11 chars of [A-Za-z0-9_-])
  if (!/^[A-Za-z0-9_-]{10,12}$/.test(videoId)) return null;

  const tempDir = mkdtempSync(join(tmpdir(), "yt-"));
  try {
    const outPath = join(tempDir, "sub");
    execSync(
      `yt-dlp --write-auto-sub --sub-lang en --sub-format json3 --skip-download --no-warnings -o "${outPath}" "https://www.youtube.com/watch?v=${videoId}"`,
      { encoding: "utf-8", timeout: 60000, stdio: "pipe" }
    );

    const subFile = join(tempDir, "sub.en.json3");
    if (!existsSync(subFile)) return null;

    const content = readFileSync(subFile, "utf-8");
    const data = JSON.parse(content);
    const events = (data.events || []).filter((e: { segs?: unknown }) => e.segs);
    if (events.length === 0) return null;

    return events
      .map((e: { segs: Array<{ utf8?: string }> }) =>
        e.segs.map((s) => s.utf8 || "").join("")
      )
      .join(" ");
  } catch {
    return null;
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

/**
 * Classify video content into a category based on title and content
 */
function classifyCategory(title: string, content: string): string {
  const text = (title + " " + content.substring(0, 500)).toLowerCase();

  if (text.includes("dark dimension") || text.includes("dd5") || text.includes("dd7") || text.includes("dd8") || text.includes("dd9")) return "dark-dimension";
  if (text.includes("crucible")) return "crucible";
  if (text.includes("arena")) return "arena";
  if (text.includes("war") && (text.includes("defense") || text.includes("offense"))) return "war";
  if (text.includes("raid")) return "raids";
  if (text.includes("iso") || text.includes("iso-8")) return "iso-8";
  if (text.includes("farm") || text.includes("farming")) return "farming";
  if (text.includes("tier list") || text.includes("ranking") || text.includes("ranked")) return "tier-list";
  if (text.includes("team") && (text.includes("build") || text.includes("best") || text.includes("top"))) return "team-building";
  if (text.includes("beginner") || text.includes("new player") || text.includes("guide")) return "beginner-guide";
  if (text.includes("kit") || text.includes("rework") || text.includes("character")) return "character-kits";
  if (text.includes("event") || text.includes("promo") || text.includes("update")) return "news-events";
  if (text.includes("saga") || text.includes("unlock")) return "saga-unlock";
  if (text.includes("gear") || text.includes("g20") || text.includes("g21")) return "gear-progression";

  return "general";
}

/**
 * Chunk a transcript into meaningful segments for search
 * Each chunk is ~800-1200 words, split at sentence boundaries
 */
function chunkTranscript(
  transcript: string,
  video: VideoInfo
): KnowledgeDocument[] {
  const category = classifyCategory(video.title, transcript);
  const words = transcript.split(/\s+/);

  // If content is short enough, keep as one document
  if (words.length <= 1200) {
    return [
      {
        id: `yt-${video.videoId}-0`,
        content: cleanTranscript(transcript),
        sourceCreatorName: video.creator,
        sourceVideoTitle: video.title,
        sourceUrl: video.url,
        sourceDate: video.published,
        category,
      },
    ];
  }

  // Split into chunks of ~1000 words at sentence boundaries
  const chunks: KnowledgeDocument[] = [];
  let chunkIndex = 0;
  let startWord = 0;
  const targetSize = 1000;

  while (startWord < words.length) {
    let endWord = Math.min(startWord + targetSize, words.length);

    // Try to find a sentence boundary near the target size
    if (endWord < words.length) {
      const searchStart = Math.max(startWord + targetSize - 100, startWord);
      const searchEnd = Math.min(startWord + targetSize + 100, words.length);
      const searchText = words.slice(searchStart, searchEnd).join(" ");

      // Look for sentence-ending punctuation
      const sentenceEnd = searchText.match(/[.!?]\s/);
      if (sentenceEnd && sentenceEnd.index !== undefined) {
        const wordsToSentenceEnd =
          searchStart - startWord + searchText.substring(0, sentenceEnd.index + 1).split(/\s+/).length;
        endWord = startWord + wordsToSentenceEnd;
      }
    }

    const chunkText = words.slice(startWord, endWord).join(" ");
    chunks.push({
      id: `yt-${video.videoId}-${chunkIndex}`,
      content: cleanTranscript(chunkText),
      sourceCreatorName: video.creator,
      sourceVideoTitle: video.title + (chunks.length > 0 ? ` (Part ${chunkIndex + 1})` : ""),
      sourceUrl: video.url,
      sourceDate: video.published,
      category,
    });

    chunkIndex++;
    startWord = endWord;
  }

  return chunks;
}

/**
 * Clean up transcript text — remove filler, normalize spacing
 */
function cleanTranscript(text: string): string {
  return text
    .replace(/\[music\]/gi, "")
    .replace(/\[applause\]/gi, "")
    .replace(/\[laughter\]/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Upload documents to Azure AI Search index
 */
export async function uploadDocuments(documents: KnowledgeDocument[]): Promise<{ succeeded: number; failed: number }> {
  if (!SEARCH_ENDPOINT || !SEARCH_KEY) {
    throw new Error("Azure AI Search not configured");
  }

  let succeeded = 0;
  let failed = 0;

  // Upload in batches of 100 (Azure Search limit is 1000 per batch)
  const batchSize = 100;
  for (let i = 0; i < documents.length; i += batchSize) {
    const batch = documents.slice(i, i + batchSize);
    const resp = await fetch(
      `${SEARCH_ENDPOINT}/indexes/${INDEX_NAME}/docs/index?api-version=2024-07-01`,
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

    if (resp.ok) {
      const result = await resp.json() as { value: Array<{ status: boolean }> };
      succeeded += result.value.filter((r) => r.status).length;
      failed += result.value.filter((r) => !r.status).length;
    } else {
      failed += batch.length;
    }
  }

  return { succeeded, failed };
}

/**
 * Delete all existing documents from the search index
 */
export async function clearIndex(): Promise<void> {
  if (!SEARCH_ENDPOINT || !SEARCH_KEY) return;

  // Fetch all document IDs
  const resp = await fetch(
    `${SEARCH_ENDPOINT}/indexes/${INDEX_NAME}/docs?api-version=2024-07-01&$select=id&$top=1000`,
    {
      headers: { "api-key": SEARCH_KEY },
    }
  );

  if (!resp.ok) return;

  const data = await resp.json() as { value: Array<{ id: string }> };
  if (data.value.length === 0) return;

  // Delete all documents
  await fetch(
    `${SEARCH_ENDPOINT}/indexes/${INDEX_NAME}/docs/index?api-version=2024-07-01`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": SEARCH_KEY,
      },
      body: JSON.stringify({
        value: data.value.map((doc) => ({
          "@search.action": "delete",
          id: doc.id,
        })),
      }),
    }
  );
}

/**
 * Get the current document count in the index
 */
export async function getDocumentCount(): Promise<number> {
  if (!SEARCH_ENDPOINT || !SEARCH_KEY) return 0;

  const resp = await fetch(
    `${SEARCH_ENDPOINT}/indexes/${INDEX_NAME}/docs/$count?api-version=2024-07-01`,
    {
      headers: { "api-key": SEARCH_KEY },
    }
  );

  if (!resp.ok) return 0;
  return parseInt(await resp.text(), 10) || 0;
}

/**
 * Query Azure AI Search for all existing video IDs (from yt-{videoId}-{chunk} format)
 */
export async function getExistingVideoIds(): Promise<Set<string>> {
  if (!SEARCH_ENDPOINT || !SEARCH_KEY) return new Set();

  const ids = new Set<string>();
  let url = `${SEARCH_ENDPOINT}/indexes/${INDEX_NAME}/docs?api-version=2024-07-01&$select=id&$top=5000&search=yt-*&queryType=full&searchFields=id`;

  const resp = await fetch(url, {
    headers: { "api-key": SEARCH_KEY },
  });

  if (!resp.ok) return ids;

  const data = await resp.json() as { value: Array<{ id: string }> };
  for (const doc of data.value) {
    // id format: yt-{videoId}-{chunkIndex}
    const parts = doc.id.split("-");
    if (parts.length >= 3 && parts[0] === "yt") {
      // videoId is the middle part(s) — everything between first "yt-" and last "-chunkIndex"
      const videoId = parts.slice(1, -1).join("-");
      if (videoId) ids.add(videoId);
    }
  }

  return ids;
}

/**
 * Run the full ingestion pipeline
 */
export async function runIngestionPipeline(
  options: {
    clearExisting?: boolean;
    maxVideosPerChannel?: number;
    onProgress?: (msg: string) => void;
    incremental?: boolean;
  } = {}
): Promise<IngestResult> {
  const { clearExisting = false, maxVideosPerChannel = 15, onProgress, incremental = false } = options;
  const log = onProgress || console.log;
  const result: IngestResult = { videosProcessed: 0, documentsUploaded: 0, errors: [], skippedVideos: [], newVideosFound: 0 };

  // When incremental, force clearExisting to false
  if (!incremental && clearExisting) {
    log("Clearing existing documents...");
    await clearIndex();
  }

  // Step 1: Discover videos from all channels
  log("Discovering videos from MSF creators...");
  const allVideos: VideoInfo[] = [];

  for (const creator of MSF_CREATORS) {
    try {
      const videos = await fetchChannelVideos(creator.channelId, creator.name, maxVideosPerChannel);
      allVideos.push(...videos);
      log(`  ${creator.name}: ${videos.length} videos found`);
    } catch (e) {
      result.errors.push(`Failed to fetch videos for ${creator.name}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  log(`Total: ${allVideos.length} MSF videos to process`);

  // Filter out already-indexed videos when running incrementally
  let videosToProcess = allVideos;
  if (incremental) {
    log("Checking for already-indexed videos...");
    const existingIds = await getExistingVideoIds();
    videosToProcess = allVideos.filter((v) => !existingIds.has(v.videoId));
    const skippedCount = allVideos.length - videosToProcess.length;
    for (const v of allVideos) {
      if (existingIds.has(v.videoId)) {
        result.skippedVideos.push(`${v.videoId}: already indexed`);
      }
    }
    result.newVideosFound = videosToProcess.length;
    log(`Incremental: ${videosToProcess.length} new videos, ${skippedCount} already indexed`);
  } else {
    result.newVideosFound = allVideos.length;
  }

  // Step 2: Fetch transcripts and chunk
  const allDocuments: KnowledgeDocument[] = [];

  for (const video of videosToProcess) {
    try {
      log(`  Processing: ${video.creator} - ${video.title.substring(0, 60)}...`);
      const transcript = await fetchTranscript(video.videoId);

      if (!transcript || transcript.length < 200) {
        result.skippedVideos.push(`${video.videoId}: No transcript available`);
        continue;
      }

      const chunks = chunkTranscript(transcript, video);
      allDocuments.push(...chunks);
      result.videosProcessed++;
      log(`    → ${chunks.length} chunks (${transcript.length} chars)`);

      // Rate limit: small delay between videos to avoid YouTube throttling
      await new Promise((resolve) => setTimeout(resolve, 500));
    } catch (e) {
      result.errors.push(`Failed to process ${video.videoId}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  log(`Total: ${allDocuments.length} documents to upload`);

  // Step 3: Upload to Azure AI Search
  if (allDocuments.length > 0) {
    log("Uploading to Azure AI Search...");
    const { succeeded, failed } = await uploadDocuments(allDocuments);
    result.documentsUploaded = succeeded;
    if (failed > 0) {
      result.errors.push(`${failed} documents failed to upload`);
    }
    log(`Uploaded: ${succeeded} succeeded, ${failed} failed`);
  }

  return result;
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

export interface CreatorStaleness {
  name: string;
  channelId: string;
  lastVideoDate: string | null;
  isStale: boolean;
}

/**
 * Check staleness of each MSF creator.
 * A creator is stale if their most recent RSS entry is older than 30 days or they have zero entries.
 */
export async function checkCreatorStaleness(): Promise<CreatorStaleness[]> {
  const results: CreatorStaleness[] = [];
  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;

  for (const creator of MSF_CREATORS) {
    try {
      const resp = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${creator.channelId}`);
      if (!resp.ok) {
        results.push({ name: creator.name, channelId: creator.channelId, lastVideoDate: null, isStale: true });
        continue;
      }

      const xml = await resp.text();
      const firstPublished = xml.match(/<entry>[\s\S]*?<published>([^<]+)/)?.[1] || null;

      if (!firstPublished) {
        results.push({ name: creator.name, channelId: creator.channelId, lastVideoDate: null, isStale: true });
        continue;
      }

      const lastDate = firstPublished.substring(0, 10);
      const isStale = new Date(firstPublished).getTime() < thirtyDaysAgo;
      results.push({ name: creator.name, channelId: creator.channelId, lastVideoDate: lastDate, isStale });
    } catch {
      results.push({ name: creator.name, channelId: creator.channelId, lastVideoDate: null, isStale: true });
    }
  }

  return results;
}
