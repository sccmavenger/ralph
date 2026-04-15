/**
 * Transcript extraction from YouTube videos.
 * Tries official captions API first, falls back to community library.
 */

export interface TranscriptResult {
  transcript: string;
  source: "official" | "community";
}

/**
 * Fetch official captions via YouTube Data API v3.
 * Returns the transcript text or null if unavailable.
 */
export async function fetchOfficialCaptions(
  videoId: string,
  apiKey: string
): Promise<string | null> {
  // List available captions
  const listUrl = `https://www.googleapis.com/youtube/v3/captions?part=snippet&videoId=${videoId}&key=${apiKey}`;
  const listResponse = await fetch(listUrl);

  if (!listResponse.ok) {
    if (listResponse.status === 404) return null;
    throw new Error(`Captions list API error: ${listResponse.status}`);
  }

  const listData = (await listResponse.json()) as {
    items?: Array<{
      id: string;
      snippet: { language: string; trackKind: string };
    }>;
  };

  if (!listData.items || listData.items.length === 0) return null;

  // Prefer English captions
  const englishTrack = listData.items.find(
    (item) => item.snippet.language === "en"
  );
  const track = englishTrack || listData.items[0];

  // Download caption track
  const downloadUrl = `https://www.googleapis.com/youtube/v3/captions/${track.id}?tfmt=srt&key=${apiKey}`;
  const captionResponse = await fetch(downloadUrl);

  if (!captionResponse.ok) return null;

  const text = await captionResponse.text();
  if (!text || text.trim().length === 0) return null;

  // Strip SRT formatting (timestamps, sequence numbers)
  return stripSrtFormatting(text);
}

/**
 * Strip SRT subtitle formatting, keeping only the text content.
 */
export function stripSrtFormatting(srt: string): string {
  return srt
    .split("\n")
    .filter((line) => {
      // Skip sequence numbers (plain integers)
      if (/^\d+$/.test(line.trim())) return false;
      // Skip timestamp lines
      if (/\d{2}:\d{2}:\d{2}/.test(line)) return false;
      // Skip empty lines
      if (line.trim().length === 0) return false;
      return true;
    })
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Fetch transcript using community library approach (HTML scraping fallback).
 * This is a simplified implementation that fetches the auto-generated transcript.
 */
export async function fetchCommunityTranscript(
  videoId: string
): Promise<string | null> {
  try {
    // Fetch YouTube video page to extract transcript data
    const url = `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; MSFCompanion/1.0)",
      },
    });

    if (!response.ok) return null;

    const html = await response.text();

    // Look for timedtext URL in the page source
    const captionMatch = html.match(
      /"captionTracks":\[.*?"baseUrl":"(.*?)"/
    );
    if (!captionMatch) return null;

    const captionUrl = captionMatch[1].replace(/\\u0026/g, "&");
    const captionResponse = await fetch(captionUrl);
    if (!captionResponse.ok) return null;

    const captionXml = await captionResponse.text();
    if (!captionXml || captionXml.trim().length === 0) return null;

    // Extract text from XML <text> tags
    const textMatches = captionXml.match(/<text[^>]*>(.*?)<\/text>/g);
    if (!textMatches || textMatches.length === 0) return null;

    return textMatches
      .map((tag) => tag.replace(/<[^>]*>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#39;/g, "'").replace(/&quot;/g, '"'))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
  } catch {
    return null;
  }
}

/**
 * Extract transcript from a YouTube video.
 * Tries official captions first, then community fallback.
 */
export async function extractTranscript(
  videoId: string,
  apiKey: string
): Promise<TranscriptResult | null> {
  // Try official captions first
  try {
    const official = await fetchOfficialCaptions(videoId, apiKey);
    if (official && official.length > 0) {
      return { transcript: official, source: "official" };
    }
  } catch {
    // Fall through to community approach
  }

  // Fallback to community transcript
  try {
    const community = await fetchCommunityTranscript(videoId);
    if (community && community.length > 0) {
      return { transcript: community, source: "community" };
    }
  } catch {
    // Both methods failed
  }

  return null;
}
