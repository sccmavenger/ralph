/**
 * Azure AI Search client utilities for querying and managing the MSF knowledge index.
 */

import { INDEX_NAME } from "./searchIndex.js";

export interface SearchResult {
  id: string;
  category: string;
  content: string;
  sourceCreatorName: string;
  sourceVideoTitle: string;
  sourceUrl: string;
  sourceDate: string;
  score: number;
}

export interface SearchDeps {
  searchEndpoint: string;
  searchKey: string;
  openAiEndpoint: string;
  openAiKey: string;
  embeddingDeployment: string;
}

/**
 * Generate an embedding vector for a text query using Azure OpenAI.
 */
export async function generateEmbedding(
  text: string,
  deps: SearchDeps
): Promise<number[]> {
  const response = await fetch(
    `${deps.openAiEndpoint}/openai/deployments/${deps.embeddingDeployment}/embeddings?api-version=2024-08-01-preview`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": deps.openAiKey,
      },
      body: JSON.stringify({ input: text }),
    }
  );

  if (!response.ok) {
    throw new Error(`Embedding API error: ${response.status}`);
  }

  const data = (await response.json()) as {
    data: Array<{ embedding: number[] }>;
  };
  return data.data[0].embedding;
}

/**
 * Perform a keyword search against the MSF knowledge index.
 */
export async function keywordSearch(
  query: string,
  deps: SearchDeps,
  top: number = 10
): Promise<SearchResult[]> {
  const response = await fetch(
    `${deps.searchEndpoint}/indexes/${INDEX_NAME}/docs/search?api-version=2024-07-01`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": deps.searchKey,
      },
      body: JSON.stringify({
        search: query,
        top,
        select: "id,category,content,sourceCreatorName,sourceVideoTitle,sourceUrl,sourceDate",
      }),
    }
  );

  if (!response.ok) {
    throw new Error(`Search API error: ${response.status}`);
  }

  const data = (await response.json()) as {
    value: Array<Record<string, unknown> & { "@search.score": number }>;
  };

  return data.value.map((doc) => ({
    id: doc.id as string,
    category: doc.category as string,
    content: doc.content as string,
    sourceCreatorName: doc.sourceCreatorName as string,
    sourceVideoTitle: doc.sourceVideoTitle as string,
    sourceUrl: doc.sourceUrl as string,
    sourceDate: doc.sourceDate as string,
    score: doc["@search.score"],
  }));
}

/**
 * Perform a semantic/vector search against the MSF knowledge index.
 */
export async function vectorSearch(
  query: string,
  deps: SearchDeps,
  top: number = 10
): Promise<SearchResult[]> {
  const embedding = await generateEmbedding(query, deps);

  const response = await fetch(
    `${deps.searchEndpoint}/indexes/${INDEX_NAME}/docs/search?api-version=2024-07-01`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": deps.searchKey,
      },
      body: JSON.stringify({
        vectorQueries: [
          {
            kind: "vector",
            vector: embedding,
            fields: "contentVector",
            k: top,
          },
        ],
        select: "id,category,content,sourceCreatorName,sourceVideoTitle,sourceUrl,sourceDate",
      }),
    }
  );

  if (!response.ok) {
    throw new Error(`Vector search API error: ${response.status}`);
  }

  const data = (await response.json()) as {
    value: Array<Record<string, unknown> & { "@search.score": number }>;
  };

  return data.value.map((doc) => ({
    id: doc.id as string,
    category: doc.category as string,
    content: doc.content as string,
    sourceCreatorName: doc.sourceCreatorName as string,
    sourceVideoTitle: doc.sourceVideoTitle as string,
    sourceUrl: doc.sourceUrl as string,
    sourceDate: doc.sourceDate as string,
    score: doc["@search.score"],
  }));
}

/**
 * Perform a hybrid search (keyword + vector) for best results.
 */
export async function hybridSearch(
  query: string,
  deps: SearchDeps,
  top: number = 10
): Promise<SearchResult[]> {
  const embedding = await generateEmbedding(query, deps);

  const response = await fetch(
    `${deps.searchEndpoint}/indexes/${INDEX_NAME}/docs/search?api-version=2024-07-01`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": deps.searchKey,
      },
      body: JSON.stringify({
        search: query,
        vectorQueries: [
          {
            kind: "vector",
            vector: embedding,
            fields: "contentVector",
            k: top,
          },
        ],
        top,
        select: "id,category,content,sourceCreatorName,sourceVideoTitle,sourceUrl,sourceDate",
      }),
    }
  );

  if (!response.ok) {
    throw new Error(`Hybrid search API error: ${response.status}`);
  }

  const data = (await response.json()) as {
    value: Array<Record<string, unknown> & { "@search.score": number }>;
  };

  return data.value.map((doc) => ({
    id: doc.id as string,
    category: doc.category as string,
    content: doc.content as string,
    sourceCreatorName: doc.sourceCreatorName as string,
    sourceVideoTitle: doc.sourceVideoTitle as string,
    sourceUrl: doc.sourceUrl as string,
    sourceDate: doc.sourceDate as string,
    score: doc["@search.score"],
  }));
}
