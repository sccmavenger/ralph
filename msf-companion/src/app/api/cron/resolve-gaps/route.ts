import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const SEARCH_ENDPOINT = process.env.AZURE_AI_SEARCH_ENDPOINT || "";
const SEARCH_KEY = process.env.AZURE_AI_SEARCH_KEY || "";
const OPENAI_ENDPOINT = process.env.AZURE_OPENAI_ENDPOINT || "";
const OPENAI_KEY = process.env.AZURE_OPENAI_KEY || "";
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY || "";

async function resolveGapWithAI(question: string, category: string): Promise<string | null> {
  if (!OPENAI_ENDPOINT || !OPENAI_KEY) return null;
  const deployment = process.env.AZURE_OPENAI_GPT4O_MINI_DEPLOYMENT || "gpt-4o-mini";
  try {
    const response = await fetch(
      `${OPENAI_ENDPOINT}/openai/deployments/${deployment}/chat/completions?api-version=2024-08-01-preview`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "api-key": OPENAI_KEY },
        body: JSON.stringify({
          messages: [
            {
              role: "system",
              content: `You are an expert Marvel Strike Force guide writer. Generate a concise, factual knowledge document (200-400 words) that thoroughly answers the given question. Include specific character names, team compositions, gear requirements, and actionable advice. Category: ${category}. Format as a single informative paragraph.`,
            },
            { role: "user", content: question },
          ],
          max_completion_tokens: 600,
        }),
      }
    );
    if (!response.ok) return null;
    const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
    return data.choices?.[0]?.message?.content || null;
  } catch {
    return null;
  }
}

async function searchYouTube(query: string): Promise<Array<{ videoId: string; title: string; description: string; channelTitle: string; publishedAt: string }>> {
  if (!YOUTUBE_API_KEY) return [];
  const params = new URLSearchParams({
    part: "snippet",
    q: `Marvel Strike Force ${query}`,
    type: "video",
    maxResults: "3",
    order: "relevance",
    key: YOUTUBE_API_KEY,
  });
  try {
    const response = await fetch(`https://www.googleapis.com/youtube/v3/search?${params}`);
    if (!response.ok) return [];
    const data = (await response.json()) as { items?: Array<{ id: { videoId: string }; snippet: { title: string; description: string; channelTitle: string; publishedAt: string } }> };
    return (data.items || []).map((item) => ({
      videoId: item.id.videoId,
      title: item.snippet.title,
      description: item.snippet.description,
      channelTitle: item.snippet.channelTitle,
      publishedAt: item.snippet.publishedAt,
    }));
  } catch {
    return [];
  }
}

export async function GET() {
  return NextResponse.json({ status: "ok", description: "POST to trigger gap resolution" });
}

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!SEARCH_ENDPOINT || !SEARCH_KEY) {
    return NextResponse.json({ error: "Azure AI Search not configured" }, { status: 500 });
  }

  // Find gaps to resolve: open gaps with frequency >= 2, and auto_resolving gaps
  const gaps = await prisma.knowledgeGap.findMany({
    where: {
      OR: [
        { status: "open", frequency: { gte: 2 } },
        { status: "auto_resolving" },
      ],
    },
    orderBy: { frequency: "desc" },
    take: 10,
  });

  if (gaps.length === 0) {
    return NextResponse.json({ timestamp: new Date().toISOString(), resolved: 0, failed: 0, message: "No gaps to resolve" });
  }

  let resolved = 0;
  let failed = 0;
  const today = new Date().toISOString().split("T")[0];

  for (const gap of gaps) {
    try {
      const docs: Array<Record<string, unknown>> = [];

      // Strategy 1: Search YouTube for relevant content
      const videos = await searchYouTube(gap.clusteredQuestion);
      for (const video of videos) {
        docs.push({
          id: `yt-gap-${gap.id}-${video.videoId}`,
          content: `${video.title}\n\n${video.description}`.slice(0, 5000),
          category: gap.category,
          sourceCreatorName: video.channelTitle,
          sourceVideoTitle: video.title,
          sourceUrl: `https://www.youtube.com/watch?v=${video.videoId}`,
          sourceDate: video.publishedAt.split("T")[0],
        });
      }

      // Strategy 2: Generate AI content
      const aiContent = await resolveGapWithAI(gap.clusteredQuestion, gap.category);
      if (aiContent) {
        docs.push({
          id: `auto-${gap.id}`,
          content: aiContent,
          category: gap.category,
          sourceCreatorName: "AI Auto-Generated",
          sourceVideoTitle: `Knowledge Gap Resolution: ${gap.clusteredQuestion.slice(0, 50)}`,
          sourceUrl: "https://themsftoolkit.com/advisor",
          sourceDate: today,
        });
      }

      if (docs.length === 0) {
        failed++;
        continue;
      }

      // Upload all docs
      const uploadResponse = await fetch(
        `${SEARCH_ENDPOINT}/indexes/msf-knowledge/docs/index?api-version=2024-07-01`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "api-key": SEARCH_KEY },
          body: JSON.stringify({
            value: docs.map((doc) => ({ "@search.action": "mergeOrUpload", ...doc })),
          }),
        }
      );

      if (uploadResponse.ok) {
        await prisma.knowledgeGap.update({
          where: { id: gap.id },
          data: {
            status: "resolved",
            autoResolveAction: `Resolved with ${docs.length} docs (${videos.length} YouTube + ${aiContent ? 1 : 0} AI-generated)`,
            resolvedAt: new Date(),
          },
        });
        resolved++;
      } else {
        failed++;
      }
    } catch {
      failed++;
    }
  }

  return NextResponse.json({
    timestamp: new Date().toISOString(),
    gapsProcessed: gaps.length,
    resolved,
    failed,
  });
}
