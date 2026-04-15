const OPENAI_ENDPOINT = process.env.AZURE_OPENAI_ENDPOINT || "";
const OPENAI_KEY = process.env.AZURE_OPENAI_KEY || "";
const GPT4O_MINI_DEPLOYMENT = process.env.AZURE_OPENAI_GPT4O_MINI_DEPLOYMENT || "gpt-4o-mini";

export type QuestionComplexity = "simple" | "medium" | "complex";

export interface ComplexityResult {
  complexity: QuestionComplexity;
  reasoning: string;
}

/**
 * Classify question complexity using GPT-4o-mini.
 * Falls back to heuristic if AI is unavailable.
 */
export async function classifyComplexity(question: string): Promise<ComplexityResult> {
  if (!OPENAI_ENDPOINT || !OPENAI_KEY) {
    return heuristicClassify(question);
  }

  try {
    const response = await fetch(
      `${OPENAI_ENDPOINT}/openai/deployments/${GPT4O_MINI_DEPLOYMENT}/chat/completions?api-version=2024-08-01-preview`,
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
              content: `You classify Marvel Strike Force questions by complexity. Respond with ONLY a JSON object.

Categories:
- "simple": Factual lookups, yes/no questions, single character info (e.g., "What is Wolverine's role?", "Is Kestrel good?")
- "medium": Comparisons, short recommendations, specific team questions (e.g., "Which cosmic team is better?", "Should I build Eternals or Darkhold?")
- "complex": Roster analysis, multi-factor strategy, Dark Dimension planning, full team building (e.g., "Analyze my full roster for Crucible defense", "Plan my DD7 teams")

Respond with: {"complexity": "simple"|"medium"|"complex", "reasoning": "brief reason"}`,
            },
            { role: "user", content: question },
          ],
          max_completion_tokens: 100,
        }),
      }
    );

    if (!response.ok) return heuristicClassify(question);

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };

    const content = data.choices?.[0]?.message?.content?.trim();
    if (!content) return heuristicClassify(question);

    const parsed = JSON.parse(content) as ComplexityResult;
    if (!["simple", "medium", "complex"].includes(parsed.complexity)) {
      return { complexity: "medium", reasoning: "Ambiguous classification, defaulting to medium" };
    }

    return parsed;
  } catch {
    return heuristicClassify(question);
  }
}

/**
 * Heuristic fallback for when GPT-4o-mini is unavailable.
 */
export function heuristicClassify(question: string): ComplexityResult {
  const q = question.toLowerCase();

  // Complex indicators
  const complexPatterns = [
    /analy[sz]e\s+(my|the|full|entire)\s+roster/,
    /dark dimension/,
    /dd[4-9]/,
    /crucible\s+(defense|offens)/,
    /plan\s+(my|the)/,
    /full\s+roster/,
    /multi/,
    /optimi[sz]e/,
    /strategy\s+for/,
    /investment\s+priorit/,
  ];

  for (const pattern of complexPatterns) {
    if (pattern.test(q)) {
      return { complexity: "complex", reasoning: "Question involves roster analysis or multi-factor strategy" };
    }
  }

  // Simple indicators
  const simplePatterns = [
    /^(what|who)\s+is\s+/,
    /^is\s+\w+\s+(good|bad|worth)/,
    /^(what|which)\s+(role|class|origin|trait)/,
  ];

  // Medium indicators (check before simple to avoid false positives)
  const mediumPatterns = [
    /\bor\b/,
    /\bshould\s+i\b/,
    /\bbetter\b/,
    /\bcompare/,
    /\bvs\.?\b/,
    /\brecommend/,
    /\bwhich\s+team/,
  ];

  for (const pattern of mediumPatterns) {
    if (pattern.test(q)) {
      return { complexity: "medium", reasoning: "Comparison or recommendation question" };
    }
  }

  const wordCount = q.split(/\s+/).length;
  if (wordCount <= 8) {
    for (const pattern of simplePatterns) {
      if (pattern.test(q)) {
        return { complexity: "simple", reasoning: "Short factual question" };
      }
    }
  }

  // Medium by default for ambiguous questions
  return { complexity: "medium", reasoning: "Standard recommendation question" };
}

/**
 * Get the model deployment name based on complexity.
 */
export function getModelForComplexity(complexity: QuestionComplexity): {
  deployment: string;
  modelLabel: string;
} {
  const GPT4O = process.env.AZURE_OPENAI_GPT4O_DEPLOYMENT || "gpt-4o";
  const GPT4O_MINI = process.env.AZURE_OPENAI_GPT4O_MINI_DEPLOYMENT || "gpt-4o-mini";

  switch (complexity) {
    case "simple":
      return { deployment: GPT4O_MINI, modelLabel: "gpt-4o-mini" };
    case "medium":
      return { deployment: GPT4O, modelLabel: "gpt-4o" };
    case "complex":
      return { deployment: GPT4O, modelLabel: "gpt-4o" };
  }
}
