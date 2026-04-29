/**
 * KB Conflict Resolver — removes Tier 4 (AI auto-generated) documents
 * when authoritative higher-tier data becomes available for the same topic.
 */

import type { KBDocument } from "./kbGameData.js";

const SEARCH_ENDPOINT = process.env.AZURE_AI_SEARCH_ENDPOINT || "";
const SEARCH_KEY = process.env.AZURE_AI_SEARCH_KEY || "";

export interface ConflictResolverDeps {
  searchDocuments: (filter: string, select: string) => Promise<Array<{ id: string; category: string; content: string; sourceTier: number }>>;
  deleteDocuments: (docIds: string[]) => Promise<void>;
}

/**
 * Find Tier 4 (AI auto-generated) documents that overlap with a new higher-tier document.
 */
export async function findConflictingTier4Docs(
  newDoc: KBDocument,
  deps: ConflictResolverDeps
): Promise<string[]> {
  // Only check conflicts when the new doc is Tier 1-3
  if (newDoc.sourceTier >= 4) return [];

  // Search for Tier 4 docs in the same category
  const filter = `sourceTier eq 4 and category eq '${newDoc.category}'`;
  const tier4Docs = await deps.searchDocuments(filter, "id,category,content,sourceTier");

  // Find docs with overlapping content (keyword matching)
  const keywords = extractKeywords(newDoc.content);
  const conflicting: string[] = [];

  for (const doc of tier4Docs) {
    const docKeywords = extractKeywords(doc.content);
    const overlap = keywords.filter((k) => docKeywords.includes(k));
    // If > 30% keyword overlap, consider it a conflict
    if (overlap.length > 0 && overlap.length / Math.min(keywords.length, docKeywords.length) > 0.3) {
      conflicting.push(doc.id);
    }
  }

  return conflicting;
}

/**
 * Remove documents from the Azure AI Search index by ID.
 */
export async function removeDocuments(
  docIds: string[],
  deps?: ConflictResolverDeps
): Promise<void> {
  if (docIds.length === 0) return;

  if (deps) {
    await deps.deleteDocuments(docIds);
    return;
  }

  // Direct search index deletion
  const response = await fetch(
    `${SEARCH_ENDPOINT}/indexes/msf-knowledge/docs/index?api-version=2024-07-01`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": SEARCH_KEY,
      },
      body: JSON.stringify({
        value: docIds.map((id) => ({
          "@search.action": "delete",
          id,
        })),
      }),
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to delete documents: ${response.status}`);
  }
}

/**
 * Extract significant keywords from content for overlap comparison.
 */
function extractKeywords(content: string): string[] {
  const stopWords = new Set(["the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
    "have", "has", "had", "do", "does", "did", "will", "would", "could", "should", "may",
    "might", "can", "shall", "and", "or", "but", "if", "then", "else", "when", "at", "by",
    "for", "with", "about", "against", "between", "through", "during", "before", "after",
    "above", "below", "to", "from", "in", "on", "of", "that", "this", "these", "those",
    "it", "its", "my", "your", "his", "her", "our", "their", "not", "no", "so", "up",
    "out", "just", "than", "very", "too", "also", "each", "every", "all", "any", "few"]);

  return content
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .split(/\s+/)
    .filter((w) => w.length > 3 && !stopWords.has(w))
    .slice(0, 50); // Limit to first 50 significant words
}
