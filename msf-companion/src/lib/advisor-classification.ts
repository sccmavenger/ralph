const OPENAI_ENDPOINT = process.env.AZURE_OPENAI_ENDPOINT || "";
const OPENAI_KEY = process.env.AZURE_OPENAI_KEY || "";
const MINI_DEPLOYMENT = process.env.AZURE_OPENAI_GPT4O_MINI_DEPLOYMENT || "gpt-4o-mini";

interface ClassificationResult {
  category: string;
  confidenceScore: number;
  answeredSuccessfully: boolean;
}

const VALID_CATEGORIES = [
  "team-comp",
  "farming",
  "dark-dimension",
  "war",
  "crucible",
  "event",
  "character-review",
  "general",
] as const;

export async function classifyQuestion(
  question: string,
  aiResponse: string,
  searchResultCount: number
): Promise<ClassificationResult> {
  // If OpenAI is not configured, use heuristic classification
  if (!OPENAI_ENDPOINT || !OPENAI_KEY) {
    return heuristicClassify(question, searchResultCount);
  }

  try {
    const response = await fetch(
      `${OPENAI_ENDPOINT}/openai/deployments/${MINI_DEPLOYMENT}/chat/completions?api-version=2024-08-01-preview`,
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
              content: `You are a classification engine for Marvel Strike Force questions. Return JSON only with no additional text.

Classify the question into exactly one category: team-comp, farming, dark-dimension, war, crucible, event, character-review, general.

Also assess how confidently the AI answer addresses the question on a scale of 0-100:
- 90-100: Very confident, specific and accurate answer with source backing
- 60-89: Reasonably confident, answer is relevant but may lack specifics
- 30-59: Low confidence, answer is generic or uncertain
- 0-29: Very low confidence, answer doesn't adequately address the question

Return: {"category": "...", "confidenceScore": N}`,
            },
            {
              role: "user",
              content: `Question: ${question}\n\nAI Response: ${aiResponse.slice(0, 500)}`,
            },
          ],
          max_tokens: 100,
          temperature: 0,
          response_format: { type: "json_object" },
        }),
      }
    );

    if (!response.ok) {
      return heuristicClassify(question, searchResultCount);
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };

    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      return heuristicClassify(question, searchResultCount);
    }

    const parsed = JSON.parse(content) as {
      category?: string;
      confidenceScore?: number;
    };

    const category = VALID_CATEGORIES.includes(
      parsed.category as (typeof VALID_CATEGORIES)[number]
    )
      ? parsed.category!
      : "general";

    const confidenceScore = Math.max(
      0,
      Math.min(100, parsed.confidenceScore ?? 50)
    );

    return {
      category,
      confidenceScore,
      answeredSuccessfully: confidenceScore >= 50,
    };
  } catch {
    return heuristicClassify(question, searchResultCount);
  }
}

function heuristicClassify(
  question: string,
  searchResultCount: number
): ClassificationResult {
  const q = question.toLowerCase();

  let category = "general";
  if (/dark.?dimension|dd\d|dd\s?\d/i.test(q)) category = "dark-dimension";
  else if (/team|comp|squad|lineup|build/i.test(q)) category = "team-comp";
  else if (/farm|shard|node|campaign/i.test(q)) category = "farming";
  else if (/crucible|cosmic crucible/i.test(q)) category = "crucible";
  else if (/war|alliance war/i.test(q)) category = "war";
  else if (/event|raid|blitz/i.test(q)) category = "event";
  else if (/worth|invest|review|good|rank/i.test(q))
    category = "character-review";

  const confidenceScore = searchResultCount >= 3 ? 70 : searchResultCount > 0 ? 50 : 30;

  return {
    category,
    confidenceScore,
    answeredSuccessfully: confidenceScore >= 50,
  };
}
