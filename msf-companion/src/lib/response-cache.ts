import { CosmosClient, Container } from "@azure/cosmos";

const COSMOS_ENDPOINT = process.env.AZURE_COSMOS_ENDPOINT || "";
const COSMOS_KEY = process.env.AZURE_COSMOS_KEY || "";
const COSMOS_DB = process.env.AZURE_COSMOS_DATABASE || "msf-companion";
const CACHE_CONTAINER = "response-cache";
const CACHE_TTL_SECONDS = 86400; // 24 hours

let containerInstance: Container | null = null;

function getContainer(): Container | null {
  if (!COSMOS_ENDPOINT || !COSMOS_KEY) return null;
  if (containerInstance) return containerInstance;

  const client = new CosmosClient({ endpoint: COSMOS_ENDPOINT, key: COSMOS_KEY });
  containerInstance = client.database(COSMOS_DB).container(CACHE_CONTAINER);
  return containerInstance;
}

function normalizeQuestion(q: string): string {
  return q.toLowerCase().trim().replace(/[^\w\s]/g, "").replace(/\s+/g, " ");
}

interface CacheEntry {
  id: string;
  normalizedQuestion: string;
  response: string;
  confidence: number;
  hitCount: number;
  createdAt: string;
  ttl: number;
}

export async function getCachedResponse(question: string): Promise<{ response: string; confidence: number } | null> {
  const container = getContainer();
  if (!container) return null;

  const normalized = normalizeQuestion(question);

  try {
    const { resources } = await container.items
      .query({
        query: "SELECT * FROM c WHERE c.normalizedQuestion = @q",
        parameters: [{ name: "@q", value: normalized }],
      })
      .fetchAll();

    if (resources.length === 0) return null;

    const entry = resources[0] as CacheEntry;

    // Check expiry (TTL is handled by Cosmos, but double-check)
    const createdAt = new Date(entry.createdAt);
    const now = new Date();
    if (now.getTime() - createdAt.getTime() > CACHE_TTL_SECONDS * 1000) return null;

    // Increment hit count (non-blocking)
    container.item(entry.id, entry.normalizedQuestion).replace({
      ...entry,
      hitCount: entry.hitCount + 1,
    }).catch(() => {});

    return { response: entry.response, confidence: entry.confidence };
  } catch {
    return null;
  }
}

export async function trackQuestionForCaching(question: string, response: string, confidence: number): Promise<void> {
  const container = getContainer();
  if (!container) return;

  const normalized = normalizeQuestion(question);

  try {
    // Check if there's already a cache entry
    const { resources } = await container.items
      .query({
        query: "SELECT * FROM c WHERE c.normalizedQuestion = @q",
        parameters: [{ name: "@q", value: normalized }],
      })
      .fetchAll();

    if (resources.length > 0) {
      // Already cached, increment hit count
      const entry = resources[0] as CacheEntry;
      await container.item(entry.id, entry.normalizedQuestion).replace({
        ...entry,
        hitCount: entry.hitCount + 1,
      });
      return;
    }

    // Store in cache (Cosmos TTL will auto-expire)
    const entry: CacheEntry = {
      id: `cache-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      normalizedQuestion: normalized,
      response,
      confidence,
      hitCount: 1,
      createdAt: new Date().toISOString(),
      ttl: CACHE_TTL_SECONDS,
    };

    await container.items.create(entry);
  } catch {
    // Non-blocking
  }
}
