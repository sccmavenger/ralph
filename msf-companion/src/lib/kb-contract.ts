import { createHash } from "node:crypto";

export const KB_PIPELINE_VERSION = "2026-08-20";

export const KB_SOURCE_TYPES = [
  "api-game-data",
  "official-blog",
  "youtube-transcript",
  "reddit-post",
  "ai-generated",
] as const;

export type KBSourceType = (typeof KB_SOURCE_TYPES)[number];
export type KBLifecycleStatus = "active" | "superseded" | "expired";

export const KB_SOURCE_POLICY: Record<KBSourceType, {
  tier: 1 | 2 | 3 | 4;
  freshnessHours: number;
  label: string;
}> = {
  "api-game-data": { tier: 1, freshnessHours: 36, label: "Official Game Data" },
  "official-blog": { tier: 2, freshnessHours: 14 * 24, label: "Official Blog" },
  "youtube-transcript": { tier: 3, freshnessHours: 7 * 24, label: "Community Creator" },
  "reddit-post": { tier: 3, freshnessHours: 3 * 24, label: "Community Discussion" },
  "ai-generated": { tier: 4, freshnessHours: 14 * 24, label: "AI Knowledge" },
};

export interface KnowledgeDocument {
  id: string;
  content: string;
  category: string;
  sourceCreatorName: string;
  sourceVideoTitle: string;
  sourceUrl: string;
  /** Compatibility field retained for the existing production index. */
  sourceDate: string;
  sourceTier: 1 | 2 | 3 | 4;
  sourceType: KBSourceType;
  sourceId: string;
  sourcePublishedAt: string;
  ingestedAt: string;
  contentHash: string;
  pipelineVersion: string;
  lifecycleStatus: KBLifecycleStatus;
  validUntil?: string;
  contentVector?: number[];
}

export interface KnowledgeDocumentInput {
  id: string;
  content: string;
  category: string;
  sourceCreatorName: string;
  sourceTitle: string;
  sourceUrl: string;
  sourcePublishedAt: string;
  sourceType: KBSourceType;
  sourceId?: string;
  ingestedAt?: string;
  lifecycleStatus?: KBLifecycleStatus;
  validUntil?: string;
}

export function cleanKnowledgeText(value: string): string {
  return value
    .replace(/<color=[^>]+>/gi, "")
    .replace(/<\/color>/gi, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#(?:39|x27);/gi, "'")
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function sanitizeKnowledgeId(value: string): string {
  const sanitized = value
    .normalize("NFKD")
    .replace(/[^A-Za-z0-9_\-=]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 1024);
  if (!sanitized) throw new Error("Knowledge document ID is empty after sanitization");
  return sanitized;
}

export function normalizeSourceDate(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid source publication date: ${value}`);
  }
  return parsed.toISOString();
}

export function computeContentHash(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

export function createKnowledgeDocument(input: KnowledgeDocumentInput): KnowledgeDocument {
  const content = cleanKnowledgeText(input.content);
  if (content.length < 20) {
    throw new Error(`Knowledge document ${input.id} does not contain enough useful content`);
  }

  const publishedAt = normalizeSourceDate(input.sourcePublishedAt);
  const ingestedAt = normalizeSourceDate(input.ingestedAt || new Date().toISOString());
  const policy = KB_SOURCE_POLICY[input.sourceType];

  return {
    id: sanitizeKnowledgeId(input.id),
    content,
    category: input.category.trim() || "general",
    sourceCreatorName: input.sourceCreatorName.trim(),
    sourceVideoTitle: input.sourceTitle.trim(),
    sourceUrl: input.sourceUrl.trim(),
    sourceDate: publishedAt,
    sourceTier: policy.tier,
    sourceType: input.sourceType,
    sourceId: input.sourceId?.trim() || sanitizeKnowledgeId(input.id),
    sourcePublishedAt: publishedAt,
    ingestedAt,
    contentHash: computeContentHash(content),
    pipelineVersion: KB_PIPELINE_VERSION,
    lifecycleStatus: input.lifecycleStatus || "active",
    ...(input.validUntil ? { validUntil: normalizeSourceDate(input.validUntil) } : {}),
  };
}

export function inferLegacySourceType(doc: Record<string, unknown>): KBSourceType {
  const explicit = String(doc.sourceType || "");
  if ((KB_SOURCE_TYPES as readonly string[]).includes(explicit)) {
    return explicit as KBSourceType;
  }

  const id = String(doc.id || "").toLowerCase();
  const creator = String(doc.sourceCreatorName || "").toLowerCase();
  if (id.startsWith("auto-") || creator.includes("ai auto")) return "ai-generated";
  if (id.startsWith("blog-") || creator.includes("scopely") || creator.includes("official msf")) return "official-blog";
  if (id.startsWith("reddit-") || creator.includes("reddit")) return "reddit-post";
  if (id.startsWith("char-") || id.startsWith("meta-") || id.startsWith("api-") || creator.includes("game data")) return "api-game-data";
  return "youtube-transcript";
}

export function getSourceFreshness(
  sourceType: KBSourceType,
  newestPublishedAt: string | null,
  now = new Date()
): { status: "healthy" | "stale" | "missing"; ageHours: number | null; maxAgeHours: number } {
  const maxAgeHours = KB_SOURCE_POLICY[sourceType].freshnessHours;
  if (!newestPublishedAt) return { status: "missing", ageHours: null, maxAgeHours };
  const timestamp = new Date(newestPublishedAt).getTime();
  if (!Number.isFinite(timestamp)) return { status: "missing", ageHours: null, maxAgeHours };
  const ageHours = Math.max(0, (now.getTime() - timestamp) / 3_600_000);
  return { status: ageHours > maxAgeHours ? "stale" : "healthy", ageHours, maxAgeHours };
}
