import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { getScopelyId } from "@/lib/scopely-id";
import { getSubscriptionTier } from "@/lib/subscription";
import { classifyQuestion } from "@/lib/advisor-classification";
import { getCachedResponse, trackQuestionForCaching } from "@/lib/response-cache";
import { classifyComplexity, getModelForComplexity } from "@/lib/question-router";
import { checkAndResolveGaps } from "@/lib/gap-resolver";
import { getValidAccessTokenWithRefresh as getValidAccessToken } from "@/lib/auth";
import { msfApiFetch } from "@/lib/msf-api";

interface ChatRequestBody {
  question?: string;
  conversationId?: string;
}

interface SearchResult {
  content: string;
  sourceCreatorName: string;
  sourceVideoTitle: string;
  sourceUrl: string;
  sourceDate: string;
}

const SEARCH_ENDPOINT = process.env.AZURE_AI_SEARCH_ENDPOINT || "";
const SEARCH_KEY = process.env.AZURE_AI_SEARCH_KEY || "";
const OPENAI_ENDPOINT = process.env.AZURE_OPENAI_ENDPOINT || "";
const OPENAI_KEY = process.env.AZURE_OPENAI_KEY || "";
const GPT4O_DEPLOYMENT = process.env.AZURE_OPENAI_GPT4O_DEPLOYMENT || "gpt-4o";

const FREE_DAILY_LIMIT = 3;
const FREE_TOKEN_BUDGET = 10000;
const PREMIUM_TOKEN_BUDGET = 50000;

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session.accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const scopelyId = await getScopelyId(false);
  if (!scopelyId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as ChatRequestBody;
  const question = body.question;

  if (!question || typeof question !== "string" || question.trim().length === 0) {
    return NextResponse.json({ error: "Question is required" }, { status: 400 });
  }

  // Check tier and daily limit
  const tier = await getSubscriptionTier();
  const isPremium = tier === "PREMIUM";

  if (!isPremium) {
    try {
      const commander = await prisma.commander.findUnique({
        where: { scopelyId },
        select: { id: true, advisorQuestionsToday: true, advisorQuestionsResetAt: true },
      });

      if (commander) {
        const now = new Date();
        const resetAt = commander.advisorQuestionsResetAt;
        let questionsToday = commander.advisorQuestionsToday || 0;

        // Reset counter if past the reset time
        if (!resetAt || now > resetAt) {
          questionsToday = 0;
        }

        if (questionsToday >= FREE_DAILY_LIMIT) {
          return NextResponse.json(
            {
              error: "You've used all 3 free questions today. Upgrade to Premium for unlimited AI advice!",
              code: "DAILY_LIMIT_EXCEEDED",
              retryable: false,
            },
            { status: 429 }
          );
        }

        // Increment counter
        const nextReset = new Date(now);
        nextReset.setUTCHours(24, 0, 0, 0);

        await prisma.commander.update({
          where: { scopelyId },
          data: {
            advisorQuestionsToday: questionsToday + 1,
            advisorQuestionsResetAt: nextReset,
          },
        });
      }
    } catch {
      // Non-blocking — skip limit check if columns don't exist yet
    }
  }

  // Search for relevant knowledge
  let searchResults: SearchResult[] = [];

  // Check daily token budget
  try {
    const commander = await prisma.commander.findUnique({
      where: { scopelyId },
      select: { id: true },
    });

    if (commander) {
      const todayUTC = new Date();
      todayUTC.setUTCHours(0, 0, 0, 0);
      const tokenUsage = await prisma.dailyTokenUsage.findUnique({
        where: { commanderId_date: { commanderId: commander.id, date: todayUTC } },
      });
      const tokensUsed = tokenUsage?.tokensUsed || 0;
      const budget = isPremium ? PREMIUM_TOKEN_BUDGET : FREE_TOKEN_BUDGET;
      if (tokensUsed >= budget) {
        return NextResponse.json(
          {
            error: "You've reached your daily AI limit. Come back tomorrow for more advice!",
            code: "TOKEN_BUDGET_EXCEEDED",
            retryable: false,
          },
          { status: 429 }
        );
      }
    }
  } catch {
    // Non-blocking — skip budget check if table doesn't exist yet
  }

  // Check response cache for common questions
  const cachedResponse = await getCachedResponse(question);
  if (cachedResponse) {
    // Return cached response as a stream-like format for consistency
    return createCachedStream(cachedResponse.response, cachedResponse.confidence, body.conversationId || null, scopelyId, question, searchResults, isPremium);
  }

  if (SEARCH_ENDPOINT && SEARCH_KEY) {
    try {
      searchResults = await searchKnowledge(question);
    } catch {
      // Non-blocking: proceed without search results
    }
  }

  // Get roster data for personalization
  let rosterSummary = "";
  try {
    let chars: Array<{
      name?: string;
      power?: number;
      gearTier?: number;
      yellowStars?: number;
    }> = [];

    // Try snapshot first
    const snapshots = await prisma.rosterSnapshot.findMany({
      where: { commander: { scopelyId } },
      orderBy: { createdAt: "desc" },
      take: 1,
      select: { snapshotData: true },
    });
    if (snapshots.length > 0 && snapshots[0].snapshotData) {
      const raw = snapshots[0].snapshotData;
      // Handle both formats:
      // Old: { data: [{ id, power, gearTier, activeYellow, info?: { name } }], meta: {...} }
      // New: [{ id, name, power, gearTier, yellowStars, ... }]
      if (Array.isArray(raw)) {
        chars = raw as typeof chars;
      } else if (typeof raw === "object" && raw !== null && "data" in raw && Array.isArray((raw as { data?: unknown }).data)) {
        const rawChars = (raw as { data: Array<{
          power?: number;
          gearTier?: number;
          activeYellow?: number;
          info?: { name?: string };
        }> }).data;
        chars = rawChars.map((c) => ({
          name: c.info?.name,
          power: c.power,
          gearTier: c.gearTier,
          yellowStars: c.activeYellow,
        }));
      }
    }

    // Filter to chars with names
    chars = chars.filter((c) => c.name);

    // If snapshot had no usable names, fall back to live MSF API
    if (chars.length === 0) {
      const token = await getValidAccessToken();
      if (token) {
        const liveRoster = await msfApiFetch<{ data?: Array<{
          power?: number;
          gearTier?: number;
          activeYellow?: number;
          info?: { name?: string };
        }> }>({
          path: "/player/v1/roster?charInfo=full&traitFormat=id&page=1&perPage=200",
          accessToken: token,
        });
        if (liveRoster.data) {
          chars = liveRoster.data.map((c) => ({
            name: c.info?.name,
            power: c.power,
            gearTier: c.gearTier,
            yellowStars: c.activeYellow,
          })).filter((c) => c.name);
        }
      }
    }

    if (chars.length > 0) {
      const topChars = chars
        .sort((a, b) => (b.power || 0) - (a.power || 0))
        .slice(0, isPremium ? 30 : 15);
      rosterSummary = topChars
        .map(
          (c) =>
            `${c.name || "Unknown"} (Power: ${c.power || 0}, G${c.gearTier || 0}, ${c.yellowStars || 0}★)`
        )
        .join("\n");
    }
  } catch {
    // Non-blocking
  }

  // Load conversation history if conversationId provided
  let conversationHistory: Array<{ role: string; content: string }> = [];
  if (body.conversationId && isPremium) {
    try {
      const messages = await prisma.advisorMessage.findMany({
        where: { conversationId: body.conversationId },
        orderBy: { createdAt: "asc" },
        take: 10,
        select: { role: true, content: true },
      });
      conversationHistory = messages.map((m: { role: string; content: string }) => ({
        role: m.role,
        content: m.content,
      }));
    } catch {
      // Non-blocking — tables may not exist yet
    }
  }

  // Build prompt
  const systemPrompt = buildSystemPrompt(
    isPremium,
    searchResults,
    rosterSummary
  );

  const aiMessages = [
    { role: "system", content: systemPrompt },
    ...conversationHistory,
    { role: "user", content: question },
  ];

  // Compute confidence based on search results
  const confidence = computeConfidence(searchResults);

  // Resolve or create conversation for message persistence
  let resolvedConversationId = body.conversationId || null;
  if (isPremium && !resolvedConversationId) {
    try {
      const commander = await prisma.commander.findUnique({
        where: { scopelyId },
        select: { id: true },
      });
      if (commander) {
        const conv = await prisma.advisorConversation.create({
          data: {
            commanderId: commander.id,
            title: question.slice(0, 80),
          },
        });
        resolvedConversationId = conv.id;
      }
    } catch {
      // Non-blocking
    }
  }

  // Save user message
  if (resolvedConversationId) {
    try {
      await prisma.advisorMessage.create({
        data: {
          conversationId: resolvedConversationId,
          role: "user",
          content: question,
          tokenCount: 0,
        },
      });
    } catch {
      // Non-blocking
    }
  }

  // Stream response from Azure OpenAI (or use placeholder if not configured)
  if (!OPENAI_ENDPOINT || !OPENAI_KEY) {
    console.error(`[Advisor] OpenAI not configured. ENDPOINT=${OPENAI_ENDPOINT ? "SET" : "EMPTY"}, KEY=${OPENAI_KEY ? "SET" : "EMPTY"}`);
    return createPlaceholderStream(question, confidence, resolvedConversationId);
  }

  // Classify question complexity and route to appropriate model
  const { complexity } = await classifyComplexity(question);
  const { deployment: modelDeployment, modelLabel } = getModelForComplexity(complexity);

  console.log(`[Advisor] Calling OpenAI: endpoint=${OPENAI_ENDPOINT}, deployment=${modelDeployment}`);

  try {
    const openAiResponse = await fetch(
      `${OPENAI_ENDPOINT}/openai/deployments/${modelDeployment}/chat/completions?api-version=2024-08-01-preview`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "api-key": OPENAI_KEY,
        },
        body: JSON.stringify({
          messages: aiMessages,
          max_completion_tokens: 1500,
          stream: true,
        }),
      }
    );

    if (!openAiResponse.ok || !openAiResponse.body) {
      const errText = openAiResponse.body ? await openAiResponse.text() : "no body";
      console.error(`[Advisor] OpenAI error ${openAiResponse.status}: ${errText}`);
      return createPlaceholderStream(question, confidence, resolvedConversationId);
    }

    // Transform the Azure OpenAI SSE stream to our format
    const encoder = new TextEncoder();
    let accumulatedResponse = "";
    const convId = resolvedConversationId;
    const transform = new TransformStream({
      start(controller) {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ confidence, conversationId: convId })}\n\n`)
        );
      },
      async transform(chunk, controller) {
        const text = new TextDecoder().decode(chunk);
        const lines = text.split("\n");

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6).trim();
            if (data === "[DONE]") {
              if (isPremium && searchResults.length > 0) {
                const citations = searchResults
                  .slice(0, 3)
                  .map(
                    (s) =>
                      `\n\n*Based on [${s.sourceCreatorName}](${s.sourceUrl}) (${new Date(s.sourceDate).toLocaleDateString()})*`
                  )
                  .join("");
                accumulatedResponse += citations;
                controller.enqueue(
                  encoder.encode(
                    `data: ${JSON.stringify({ content: citations })}\n\n`
                  )
                );
              }
              // Save assistant message
              if (convId && accumulatedResponse) {
                // Log question with classification (non-blocking)
                logQuestion(scopelyId, question, accumulatedResponse, searchResults.length, searchResults).catch(() => {});
                try {
                  const saved = await prisma.advisorMessage.create({
                    data: {
                      conversationId: convId,
                      role: "assistant",
                      content: accumulatedResponse,
                      confidenceScore: confidence,
                      modelUsed: modelLabel,
                      sourceCitations: isPremium && searchResults.length > 0
                        ? searchResults.slice(0, 3).map((s) => ({
                            creator: s.sourceCreatorName,
                            url: s.sourceUrl,
                            title: s.sourceVideoTitle,
                          }))
                        : undefined,
                      tokenCount: Math.ceil(accumulatedResponse.length / 4),
                    },
                  });
                  // Track token usage (non-blocking)
                  trackTokenUsage(scopelyId, saved.tokenCount).catch(() => {});
                  // Track for caching (non-blocking)
                  trackQuestionForCaching(question, accumulatedResponse, confidence).catch(() => {});
                  controller.enqueue(
                    encoder.encode(`data: ${JSON.stringify({ messageId: saved.id })}\n\n`)
                  );
                } catch {
                  // DB save failed — continue without messageId
                }
                controller.enqueue(encoder.encode("data: [DONE]\n\n"));
              } else {
                // Log question with classification (non-blocking)
                logQuestion(scopelyId, question, accumulatedResponse, searchResults.length, searchResults).catch(() => {});
                controller.enqueue(encoder.encode("data: [DONE]\n\n"));
              }
              return;
            }
            try {
              const parsed = JSON.parse(data) as {
                choices?: Array<{ delta?: { content?: string } }>;
              };
              const content = parsed.choices?.[0]?.delta?.content;
              if (content) {
                accumulatedResponse += content;
                controller.enqueue(
                  encoder.encode(`data: ${JSON.stringify({ content })}\n\n`)
                );
              }
            } catch {
              // Skip malformed chunks
            }
          }
        }
      },
    });

    const stream = openAiResponse.body.pipeThrough(transform);

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (err) {
    console.error("[Advisor] OpenAI stream error:", err);
    return createPlaceholderStream(question, confidence, resolvedConversationId);
  }
}

async function logQuestion(
  scopelyId: string,
  question: string,
  aiResponse: string,
  searchResultCount: number,
  searchResults: SearchResult[]
): Promise<void> {
  try {
    const commander = await prisma.commander.findUnique({
      where: { scopelyId },
      select: { id: true },
    });
    if (!commander) return;

    const classification = await classifyQuestion(question, aiResponse, searchResultCount);

    await prisma.advisorQuestionLog.create({
      data: {
        commanderId: commander.id,
        question,
        category: classification.category,
        confidenceScore: classification.confidenceScore,
        answeredSuccessfully: classification.answeredSuccessfully,
        knowledgeSourcesUsed: searchResults.slice(0, 5).map((s) => ({
          creator: s.sourceCreatorName,
          title: s.sourceVideoTitle,
        })),
      },
    });

    // Trigger autonomous gap resolution in background (non-blocking)
    checkAndResolveGaps(
      question,
      classification.category,
      classification.confidenceScore,
      searchResultCount
    ).catch(() => {});
  } catch {
    // Non-blocking
  }
}

function buildSystemPrompt(
  isPremium: boolean,
  searchResults: SearchResult[],
  rosterSummary: string
): string {
  let prompt = `You are the MSF Companion AI Roster Advisor — an expert on Marvel Strike Force. You provide actionable, specific advice about team building, farming, Dark Dimension, Cosmic Crucible, Arena, and character investments.

Rules:
- Be concise and actionable. Use bullet points.
- Reference specific character names and team compositions.
- Provide confident, helpful answers based on your knowledge of Marvel Strike Force.
- If a question is outside MSF scope, politely redirect.`;

  if (searchResults.length > 0) {
    prompt += `\n\nRelevant knowledge from MSF creators:\n`;
    for (const result of searchResults.slice(0, 5)) {
      prompt += `- ${result.content} (Source: ${result.sourceCreatorName})\n`;
    }
  }

  if (rosterSummary) {
    prompt += `\n\nCommander's roster (top characters):\n${rosterSummary}\n\nPersonalize your advice to this specific roster when relevant.`;
  }

  if (!isPremium) {
    prompt += `\n\nThis is a free-tier user. Do not include source citations.`;
  }

  return prompt;
}

function computeConfidence(searchResults: SearchResult[]): number {
  // Base confidence of 60 when using AI model directly
  const base = 60;
  if (searchResults.length === 0) return base;
  if (searchResults.length >= 5) return 95;
  return Math.min(95, base + searchResults.length * 8);
}

async function searchKnowledge(query: string): Promise<SearchResult[]> {
  const response = await fetch(
    `${SEARCH_ENDPOINT}/indexes/msf-knowledge/docs/search?api-version=2024-07-01`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": SEARCH_KEY,
      },
      body: JSON.stringify({
        search: query,
        top: 10,
        select: "content,sourceCreatorName,sourceVideoTitle,sourceUrl,sourceDate",
      }),
    }
  );

  if (!response.ok) return [];

  const data = (await response.json()) as {
    value: Array<Record<string, string>>;
  };

  return data.value.map((doc) => ({
    content: doc.content || "",
    sourceCreatorName: doc.sourceCreatorName || "",
    sourceVideoTitle: doc.sourceVideoTitle || "",
    sourceUrl: doc.sourceUrl || "",
    sourceDate: doc.sourceDate || "",
  }));
}

function createPlaceholderStream(question: string, confidence: number, conversationId: string | null): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify({ confidence, conversationId })}\n\n`)
      );

      const response = `I understand you're asking about: **${question}**\n\nThe AI intelligence pipeline is still being connected to the live knowledge base. Once fully connected, I'll provide personalized advice based on:\n\n- Latest meta insights from 18 MSF YouTube creators\n- Official patch notes and character kits\n- Your actual roster data\n\nStay tuned — this feature is coming soon!`;

      const words = response.split(" ");
      for (const word of words) {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ content: word + " " })}\n\n`)
        );
        await new Promise((resolve) => setTimeout(resolve, 20));
      }

      // Save assistant message
      if (conversationId) {
        try {
          const saved = await prisma.advisorMessage.create({
            data: {
              conversationId,
              role: "assistant",
              content: response,
              confidenceScore: confidence,
              tokenCount: Math.ceil(response.length / 4),
            },
          });
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ messageId: saved.id })}\n\n`)
          );
        } catch {
          // Non-blocking
        }
      }

      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

async function trackTokenUsage(scopelyId: string, tokenCount: number): Promise<void> {
  try {
    const cmdr = await prisma.commander.findUnique({
      where: { scopelyId },
      select: { id: true },
    });
    if (!cmdr) return;

    const todayUTC = new Date();
    todayUTC.setUTCHours(0, 0, 0, 0);

    await prisma.dailyTokenUsage.upsert({
      where: { commanderId_date: { commanderId: cmdr.id, date: todayUTC } },
      update: { tokensUsed: { increment: tokenCount } },
      create: { commanderId: cmdr.id, date: todayUTC, tokensUsed: tokenCount },
    });
  } catch {
    // Non-blocking
  }
}

function createCachedStream(
  cachedContent: string,
  confidence: number,
  conversationId: string | null,
  scopelyId: string,
  question: string,
  searchResults: SearchResult[],
  isPremium: boolean
): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      // Resolve or create conversation
      let convId = conversationId;
      if (isPremium && !convId) {
        try {
          const cmdr = await prisma.commander.findUnique({
            where: { scopelyId },
            select: { id: true },
          });
          if (cmdr) {
            const conv = await prisma.advisorConversation.create({
              data: { commanderId: cmdr.id, title: question.slice(0, 80) },
            });
            convId = conv.id;
          }
        } catch {
          // Non-blocking
        }
      }

      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify({ confidence, conversationId: convId })}\n\n`)
      );

      // Save user message
      if (convId) {
        try {
          await prisma.advisorMessage.create({
            data: { conversationId: convId, role: "user", content: question, tokenCount: 0 },
          });
        } catch {
          // Non-blocking
        }
      }

      // Stream cached content word by word
      const words = cachedContent.split(" ");
      for (const word of words) {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ content: word + " " })}\n\n`)
        );
        await new Promise((resolve) => setTimeout(resolve, 10));
      }

      // Save assistant message
      if (convId) {
        try {
          const saved = await prisma.advisorMessage.create({
            data: {
              conversationId: convId,
              role: "assistant",
              content: cachedContent,
              confidenceScore: confidence,
              tokenCount: Math.ceil(cachedContent.length / 4),
            },
          });
          trackTokenUsage(scopelyId, saved.tokenCount).catch(() => {});
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ messageId: saved.id })}\n\n`)
          );
        } catch {
          // Non-blocking
        }
      }

      // Log question (non-blocking)
      logQuestion(scopelyId, question, cachedContent, searchResults.length, searchResults).catch(() => {});

      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
