import { prisma } from "@/lib/prisma";

const SEARCH_ENDPOINT = process.env.AZURE_AI_SEARCH_ENDPOINT || "";
const SEARCH_KEY = process.env.AZURE_AI_SEARCH_KEY || "";
const OPENAI_ENDPOINT = process.env.AZURE_OPENAI_ENDPOINT || "";
const OPENAI_KEY = process.env.AZURE_OPENAI_KEY || "";

/**
 * Autonomous Knowledge Gap Resolver
 * 
 * This system runs in the background after each advisor response to:
 * 1. Detect questions that weren't answered well (low confidence, poor search results)
 * 2. Cluster similar unanswered questions into knowledge gaps
 * 3. Auto-generate knowledge documents to fill those gaps using AI
 * 4. Upload the generated documents to the search index
 * 
 * The cycle: Question → Low confidence detected → Gap created → AI generates content
 * → Uploaded to search index → Next time same question is asked → Higher confidence
 */

interface GapCandidate {
  question: string;
  category: string;
  confidence: number;
}

/**
 * Called after each advisor response. Checks if the response was low-confidence
 * and if so, triggers the gap detection + resolution pipeline.
 */
export async function checkAndResolveGaps(
  question: string,
  category: string,
  confidence: number,
  searchResultCount: number
): Promise<void> {
  // Only trigger for low-confidence answers with few search results
  if (confidence >= 60 && searchResultCount >= 2) return;

  try {
    await detectAndCreateGap({ question, category, confidence });
    await resolveOpenGaps();
  } catch {
    // Non-blocking — never crash the advisor flow
  }
}

/**
 * Detect if this question represents a knowledge gap and either create
 * a new gap entry or increment the frequency of an existing one.
 */
async function detectAndCreateGap(candidate: GapCandidate): Promise<void> {
  const normalizedQ = candidate.question.toLowerCase().trim();

  // Check if a similar gap already exists
  const existingGaps = await prisma.knowledgeGap.findMany({
    where: { status: "open" },
    select: { id: true, clusteredQuestion: true, frequency: true },
  });

  // Simple similarity check — look for overlapping key terms
  const questionWords = new Set(
    normalizedQ.split(/\s+/).filter((w) => w.length > 3)
  );

  let matchedGapId: string | null = null;
  for (const gap of existingGaps) {
    const gapWords = new Set(
      gap.clusteredQuestion.toLowerCase().split(/\s+/).filter((w) => w.length > 3)
    );
    const overlap = [...questionWords].filter((w) => gapWords.has(w)).length;
    const similarity = overlap / Math.max(questionWords.size, gapWords.size, 1);
    if (similarity >= 0.4) {
      matchedGapId = gap.id;
      break;
    }
  }

  if (matchedGapId) {
    // Increment frequency of existing gap
    await prisma.knowledgeGap.update({
      where: { id: matchedGapId },
      data: { frequency: { increment: 1 } },
    });
  } else {
    // Create new gap
    await prisma.knowledgeGap.create({
      data: {
        clusteredQuestion: candidate.question,
        category: candidate.category,
        gapType: candidate.confidence < 40 ? "no-knowledge" : "partial-knowledge",
        frequency: 1,
        status: "open",
      },
    });
  }
}

/**
 * Process open gaps with frequency >= 2 (asked more than once).
 * Uses AI to generate a knowledge document, then uploads to the search index.
 * Limits to 3 resolutions per cycle to avoid overload.
 */
async function resolveOpenGaps(): Promise<void> {
  if (!OPENAI_ENDPOINT || !OPENAI_KEY || !SEARCH_ENDPOINT || !SEARCH_KEY) return;

  const gaps = await prisma.knowledgeGap.findMany({
    where: {
      status: "open",
      frequency: { gte: 2 }, // Only resolve gaps that have been asked more than once
    },
    orderBy: { frequency: "desc" },
    take: 3,
  });

  for (const gap of gaps) {
    try {
      const content = await generateKnowledgeContent(gap.clusteredQuestion, gap.category);
      if (!content) continue;

      const docId = `auto-${gap.id}`;
      await uploadToSearchIndex(docId, content, gap.category);

      await prisma.knowledgeGap.update({
        where: { id: gap.id },
        data: {
          status: "resolved",
          autoResolveAction: `Generated knowledge document: ${docId}`,
          resolvedAt: new Date(),
        },
      });
    } catch {
      // Skip this gap, try next
    }
  }
}

/**
 * Use AI to generate a knowledge document that would answer the given question.
 */
async function generateKnowledgeContent(
  question: string,
  category: string
): Promise<string | null> {
  try {
    const deployment = process.env.AZURE_OPENAI_GPT4O_DEPLOYMENT || "msftoolkit";
    const response = await fetch(
      `${OPENAI_ENDPOINT}/openai/deployments/${deployment}/chat/completions?api-version=2024-08-01-preview`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "api-key": OPENAI_KEY,
        },
        body: JSON.stringify({
          messages: [
            {
              role: "system",
              content: `You are an expert Marvel Strike Force guide writer. Generate a concise, factual knowledge document (200-400 words) that thoroughly answers the given question. Include specific character names, team compositions, gear requirements, and actionable advice. The document will be stored in a search index to help an AI advisor answer similar questions in the future.

Category: ${category}

Format the response as a single informative paragraph with specific details. Do not use headers or bullet points.`,
            },
            {
              role: "user",
              content: question,
            },
          ],
          max_completion_tokens: 600,
        }),
      }
    );

    if (!response.ok) return null;

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };

    return data.choices?.[0]?.message?.content || null;
  } catch {
    return null;
  }
}

/**
 * Upload a generated knowledge document to the Azure AI Search index.
 */
async function uploadToSearchIndex(
  docId: string,
  content: string,
  category: string
): Promise<void> {
  const response = await fetch(
    `${SEARCH_ENDPOINT}/indexes/msf-knowledge/docs/index?api-version=2024-07-01`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": SEARCH_KEY,
      },
      body: JSON.stringify({
        value: [
          {
            "@search.action": "mergeOrUpload",
            id: docId,
            content,
            sourceCreatorName: "AI Auto-Generated",
            sourceVideoTitle: "Knowledge Gap Resolution",
            sourceUrl: "https://themsftoolkit.com/advisor",
            sourceDate: new Date().toISOString().split("T")[0],
            category,
            sourceTier: 4,
            sourceType: "ai-generated",
          },
        ],
      }),
    }
  );

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Search upload failed: ${err}`);
  }
}

/**
 * Process negative feedback as a gap signal.
 * Called when a user gives thumbs-down on a response.
 */
export async function processNegativeFeedback(
  question: string,
  category: string
): Promise<void> {
  try {
    // Treat negative feedback as a gap with high priority
    await detectAndCreateGap({
      question,
      category,
      confidence: 20, // Force it into "no-knowledge" tier
    });
    // Try resolving immediately for high-impact gaps
    await resolveOpenGaps();
  } catch {
    // Non-blocking
  }
}
