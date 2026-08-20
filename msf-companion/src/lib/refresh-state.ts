/**
 * Persist and retrieve the last auto-refresh state via Azure AI Search.
 * Stored as a system document excluded from Advisor retrieval.
 */

const SEARCH_ENDPOINT = process.env.AZURE_AI_SEARCH_ENDPOINT || "";
const SEARCH_KEY = process.env.AZURE_AI_SEARCH_KEY || "";
const INDEX_NAME = "msf-knowledge";

export interface RefreshState {
  lastRefreshAt: string;
  lastResult: {
    videosProcessed: number;
    documentsUploaded: number;
    newVideosFound: number;
    errors: string[];
  };
  staleness: Array<{
    name: string;
    lastVideoDate: string | null;
    isStale: boolean;
  }>;
}

const META_DOC_ID = "meta-refresh-state";

export async function getRefreshState(): Promise<RefreshState | null> {
  if (!SEARCH_ENDPOINT || !SEARCH_KEY) return null;

  try {
    const resp = await fetch(
      `${SEARCH_ENDPOINT}/indexes/${INDEX_NAME}/docs/${encodeURIComponent(META_DOC_ID)}?api-version=2024-07-01`,
      {
        headers: { "api-key": SEARCH_KEY },
      }
    );

    if (!resp.ok) return null;

    const doc = (await resp.json()) as { content?: string };
    if (!doc.content) return null;

    return JSON.parse(doc.content) as RefreshState;
  } catch {
    return null;
  }
}

export async function setRefreshState(state: RefreshState): Promise<void> {
  if (!SEARCH_ENDPOINT || !SEARCH_KEY) return;
  const { createKnowledgeDocument } = await import("@/lib/kb-contract");
  const { uploadKnowledgeDocuments } = await import("@/lib/kb-search");
  await uploadKnowledgeDocuments([createKnowledgeDocument({
    id: META_DOC_ID,
    content: JSON.stringify(state),
    category: "system",
    sourceCreatorName: "MSF Toolkit",
    sourceTitle: "Knowledge refresh state",
    sourceUrl: "",
    sourcePublishedAt: state.lastRefreshAt,
    sourceType: "ai-generated",
    sourceId: META_DOC_ID,
  })]);
}
