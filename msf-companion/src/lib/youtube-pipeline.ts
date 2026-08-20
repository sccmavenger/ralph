/**
 * YouTube Transcription Pipeline for MSF Knowledge Base
 * 
 * Fetches transcripts from MSF YouTube creators, chunks them into
 * meaningful segments, and uploads to Azure AI Search.
 */

import { YoutubeTranscript } from "youtube-transcript";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { createKnowledgeDocument, type KnowledgeDocument } from "@/lib/kb-contract";
import { getEnabledMSFCreators, isRelevantCreatorVideo, MSF_CREATORS } from "@/lib/kb-creators";
import { uploadKnowledgeDocuments } from "@/lib/kb-search";

export { MSF_CREATORS } from "@/lib/kb-creators";

const execFileAsync = promisify(execFile);

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

export interface IngestResult {
  videosProcessed: number;
  documentsUploaded: number;
  errors: string[];
  skippedVideos: string[];
  newVideosFound: number;
  deadlineReached: boolean;
  deferredVideos: number;
}

/**
 * Fetch recent videos from a YouTube channel via RSS feed
 */
export async function fetchChannelVideos(channelId: string, creatorName: string, maxVideos = 15): Promise<VideoInfo[]> {
  const creator = MSF_CREATORS.find((item) => item.channelId === channelId) || { msfOnly: false };
  const apiKey = process.env.YOUTUBE_API_KEY || "";
  if (apiKey) {
    try {
      // Every channel's uploads playlist is the channel ID with UC changed to UU.
      // playlistItems.list is substantially cheaper than search.list and provides
      // a wider, deterministic discovery window than the 15-item RSS feed.
      const uploadsPlaylist = channelId.startsWith("UC") ? `UU${channelId.slice(2)}` : channelId;
      const params = new URLSearchParams({
        part: "snippet,contentDetails",
        playlistId: uploadsPlaylist,
        maxResults: String(Math.min(50, Math.max(1, maxVideos))),
        key: apiKey,
      });
      const response = await fetch(`https://www.googleapis.com/youtube/v3/playlistItems?${params}`, {
        signal: AbortSignal.timeout(15_000),
      });
      if (response.ok) {
        const payload = (await response.json()) as {
          items?: Array<{ snippet?: { title?: string; publishedAt?: string }; contentDetails?: { videoId?: string } }>;
        };
        return (payload.items || []).flatMap((item) => {
          const videoId = item.contentDetails?.videoId || "";
          const title = item.snippet?.title || "";
          if (!videoId || !title || !isRelevantCreatorVideo(title, creator)) return [];
          return [{
            videoId,
            title,
            creator: creatorName,
            published: item.snippet?.publishedAt || new Date().toISOString(),
            url: `https://www.youtube.com/watch?v=${videoId}`,
          }];
        });
      }
    } catch (error) {
      console.warn(`[YouTube discovery] API fallback for ${creatorName}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const resp = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`, {
    signal: AbortSignal.timeout(15_000),
  });
  if (!resp.ok) throw new Error(`YouTube feed returned ${resp.status}`);
  const entries = [...(await resp.text()).matchAll(/<entry>([\s\S]*?)<\/entry>/g)];
  return entries.slice(0, maxVideos).flatMap((entry) => {
    const content = entry[1];
    const videoId = content.match(/<yt:videoId>([^<]+)/)?.[1] || "";
    const title = decodeHtmlEntities(content.match(/<title>([^<]+)/)?.[1] || "");
    const published = content.match(/<published>([^<]+)/)?.[1] || "";
    if (!videoId || !title || !isRelevantCreatorVideo(title, creator)) return [];
    return [{ videoId, title, creator: creatorName, published, url: `https://www.youtube.com/watch?v=${videoId}` }];
  });
}

/**
 * Fetch transcript for a YouTube video using youtube-transcript package.
 * Note: YouTube blocks transcript access from Azure/cloud datacenter IPs.
 * Use scripts/refresh-kb.ts locally to populate the knowledge base.
 */
export async function fetchTranscript(videoId: string, timeoutMs = 90_000): Promise<string | null> {
  // Validate videoId format (YouTube IDs are 11 chars of [A-Za-z0-9_-])
  if (!/^[A-Za-z0-9_-]{10,12}$/.test(videoId)) return null;

  const phaseTimeoutMs = Math.max(10_000, Math.floor(timeoutMs / 2));
  let tempDirectory = "";
  try {
    tempDirectory = await mkdtemp(join(tmpdir(), "msf-kb-"));
    await execFileAsync("yt-dlp", [
      "--skip-download",
      "--write-subs",
      "--write-auto-subs",
      "--sub-langs", "en-orig,en",
      "--sub-format", "json3",
      "--no-warnings",
      "-o", join(tempDirectory, "%(id)s.%(ext)s"),
      `https://www.youtube.com/watch?v=${videoId}`,
    ], { timeout: phaseTimeoutMs, windowsHide: true, maxBuffer: 10 * 1024 * 1024 });
    const subtitleFile = (await readdir(tempDirectory)).find((file) => file.endsWith(".json3"));
    if (subtitleFile) {
      const payload = JSON.parse(await readFile(join(tempDirectory, subtitleFile), "utf8")) as {
        events?: Array<{ segs?: Array<{ utf8?: string }> }>;
      };
      const transcript = (payload.events || [])
        .flatMap((event) => event.segs || [])
        .map((segment) => segment.utf8 || "")
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
      if (transcript) return transcript;
    }
  } catch (error) {
    console.warn(`[fetchTranscript] yt-dlp fallback for ${videoId}: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    if (tempDirectory) await rm(tempDirectory, { recursive: true, force: true }).catch(() => {});
  }

  try {
    const items = await Promise.race([
      YoutubeTranscript.fetchTranscript(videoId, { lang: "en" }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Transcript fallback timed out")), phaseTimeoutMs)),
    ]);
    if (!items || items.length === 0) return null;
    return items.map(item => item.text).join(" ");
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`[fetchTranscript] ${videoId}: ${msg}`);
    return null;
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
      createKnowledgeDocument({
        id: `yt-${video.videoId}-0`,
        content: cleanTranscript(transcript),
        category,
        sourceCreatorName: video.creator,
        sourceTitle: video.title,
        sourceUrl: video.url,
        sourcePublishedAt: video.published || new Date().toISOString(),
        sourceType: "youtube-transcript",
        sourceId: video.videoId,
      }),
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
    chunks.push(createKnowledgeDocument({
      id: `yt-${video.videoId}-${chunkIndex}`,
      content: cleanTranscript(chunkText),
      category,
      sourceCreatorName: video.creator,
      sourceTitle: video.title + (chunks.length > 0 ? ` (Part ${chunkIndex + 1})` : ""),
      sourceUrl: video.url,
      sourcePublishedAt: video.published || new Date().toISOString(),
      sourceType: "youtube-transcript",
      sourceId: video.videoId,
    }));

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
  const result = await uploadKnowledgeDocuments(documents);
  for (const error of result.errors) console.warn(`[KB upload] ${error}`);
  return { succeeded: result.succeeded, failed: result.failed };
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
  for (let offset = 0; ; offset += 1000) {
    const resp = await fetch(
      `${SEARCH_ENDPOINT}/indexes/${INDEX_NAME}/docs/search?api-version=2024-07-01`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "api-key": SEARCH_KEY },
        body: JSON.stringify({ search: "*", top: 1000, skip: offset, select: "id,validUntil" }),
        signal: AbortSignal.timeout(15_000),
      }
    );
    if (!resp.ok) return ids;
    const data = await resp.json() as { value: Array<{ id: string; validUntil?: string }> };
    for (const doc of data.value) {
      // id format: yt-{videoId}-{chunkIndex|skip}
      const parts = doc.id.split("-");
      if (parts.length >= 3 && parts[0] === "yt") {
        const isRetryMarker = parts.at(-1) === "skip";
        const retryAt = doc.validUntil ? new Date(doc.validUntil).getTime() : Number.POSITIVE_INFINITY;
        if (isRetryMarker && retryAt <= Date.now()) continue;
        const videoId = parts.slice(1, -1).join("-");
        if (videoId) ids.add(videoId);
      }
    }
    if (data.value.length < 1000) break;
  }

  return ids;
}

async function markTranscriptUnavailable(video: VideoInfo): Promise<void> {
  const marker = createKnowledgeDocument({
    id: `yt-${video.videoId}-skip`,
    content: `Transcript unavailable for ${video.title}. Retry after the temporary caption cooldown expires.`,
    category: "system",
    sourceCreatorName: video.creator,
    sourceTitle: video.title,
    sourceUrl: video.url,
    sourcePublishedAt: video.published || new Date().toISOString(),
    sourceType: "youtube-transcript",
    sourceId: video.videoId,
    validUntil: new Date(Date.now() + 7 * 86_400_000).toISOString(),
  });
  const upload = await uploadDocuments([marker]);
  if (upload.failed) throw new Error("Unable to persist transcript retry marker");
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
    maxRuntimeMs?: number;
    transcriptTimeoutMs?: number;
  } = {}
): Promise<IngestResult> {
  const {
    clearExisting = false,
    maxVideosPerChannel = 15,
    onProgress,
    incremental = false,
    maxRuntimeMs,
    transcriptTimeoutMs = 90_000,
  } = options;
  const startedAt = Date.now();
  const log = onProgress || console.log;
  const result: IngestResult = {
    videosProcessed: 0,
    documentsUploaded: 0,
    errors: [],
    skippedVideos: [],
    newVideosFound: 0,
    deadlineReached: false,
    deferredVideos: 0,
  };

  // When incremental, force clearExisting to false
  if (!incremental && clearExisting) {
    log("Clearing existing documents...");
    await clearIndex();
  }

  // Step 1: Discover videos from all channels
  log("Discovering videos from MSF creators...");
  const allVideos: VideoInfo[] = [];

  for (const creator of getEnabledMSFCreators()) {
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
  let documentsPrepared = 0;

  for (const [videoIndex, video] of videosToProcess.entries()) {
    const remainingBudget = maxRuntimeMs ? maxRuntimeMs - (Date.now() - startedAt) : Number.POSITIVE_INFINITY;
    if (remainingBudget < transcriptTimeoutMs + 15_000) {
      result.deadlineReached = true;
      result.deferredVideos = videosToProcess.length - videoIndex;
      log(`Runtime budget reached; deferring ${result.deferredVideos} videos to the next incremental run`);
      break;
    }
    try {
      log(`  Processing: ${video.creator} - ${video.title.substring(0, 60)}...`);
      const transcript = await fetchTranscript(video.videoId, transcriptTimeoutMs);

      if (!transcript || transcript.length < 200) {
        result.skippedVideos.push(`${video.videoId}: No transcript available`);
        await markTranscriptUnavailable(video);
        continue;
      }

      const chunks = chunkTranscript(transcript, video);
      documentsPrepared += chunks.length;
      // Commit each completed video immediately. A timeout or machine restart
      // no longer discards every transcript collected earlier in the run, and
      // the next incremental pass naturally resumes from indexed video IDs.
      const upload = await uploadDocuments(chunks);
      result.documentsUploaded += upload.succeeded;
      if (upload.failed) result.errors.push(`${video.videoId}: ${upload.failed} chunks failed to upload`);
      result.videosProcessed++;
      log(`    → ${upload.succeeded}/${chunks.length} chunks uploaded (${transcript.length} chars)`);

      // Rate limit: small delay between videos to avoid YouTube throttling
      await new Promise((resolve) => setTimeout(resolve, 500));
    } catch (e) {
      result.errors.push(`Failed to process ${video.videoId}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  log(`Total: ${result.documentsUploaded}/${documentsPrepared} prepared documents uploaded`);

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
  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
  return Promise.all(getEnabledMSFCreators().map(async (creator): Promise<CreatorStaleness> => {
    try {
      const videos = await fetchChannelVideos(creator.channelId, creator.name, 1);
      const firstPublished = videos[0]?.published || null;
      if (!firstPublished) {
        return { name: creator.name, channelId: creator.channelId, lastVideoDate: null, isStale: true };
      }

      const lastDate = firstPublished.substring(0, 10);
      const isStale = new Date(firstPublished).getTime() < thirtyDaysAgo;
      return { name: creator.name, channelId: creator.channelId, lastVideoDate: lastDate, isStale };
    } catch {
      return { name: creator.name, channelId: creator.channelId, lastVideoDate: null, isStale: true };
    }
  }));
}
