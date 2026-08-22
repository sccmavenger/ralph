import { normalizeAdvisorRosterSnapshot } from "@/lib/advisor-roster";
import { getKnowledgeSearchConfig } from "@/lib/kb-search";

const OFFICIAL_UPDATE_MAX_AGE_DAYS = 7;
const ROSTER_STALE_DAYS = 7;

export interface DigestRosterSummary {
  rosterSize: number;
  totalPower: number;
  averagePower: number;
  sevenStarCharacters: number;
  snapshotAt: string;
  powerChange: number | null;
  rosterChange: number | null;
  topCharacters: Array<{ name: string; power: number }>;
  isStale: boolean;
}

export interface DigestOfficialUpdate {
  title: string;
  url: string;
  publishedAt: string;
}

export interface DigestNotification {
  type: string;
  title: string;
  message: string;
}

interface SnapshotInput {
  snapshotData: unknown;
  createdAt: Date | string;
}

interface SearchPayload {
  value?: Array<Record<string, unknown>>;
}

function finiteNonNegative(value: number | undefined): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0;
}

export function summarizeDigestRoster(
  snapshots: SnapshotInput[],
  now = new Date()
): DigestRosterSummary | null {
  const currentSnapshot = snapshots[0];
  if (!currentSnapshot) return null;

  const current = normalizeAdvisorRosterSnapshot(currentSnapshot.snapshotData);
  if (!current.length) return null;

  const previous = snapshots[1]
    ? normalizeAdvisorRosterSnapshot(snapshots[1].snapshotData)
    : [];
  const totalPower = current.reduce(
    (total, character) => total + finiteNonNegative(character.power),
    0
  );
  const previousPower = previous.reduce(
    (total, character) => total + finiteNonNegative(character.power),
    0
  );
  const snapshotAt = new Date(currentSnapshot.createdAt);
  const snapshotAgeMs = now.getTime() - snapshotAt.getTime();

  return {
    rosterSize: current.length,
    totalPower,
    averagePower: Math.round(totalPower / current.length),
    sevenStarCharacters: current.filter((character) => character.yellowStars === 7).length,
    snapshotAt: snapshotAt.toISOString(),
    powerChange: previous.length ? totalPower - previousPower : null,
    rosterChange: previous.length ? current.length - previous.length : null,
    topCharacters: [...current]
      .sort((a, b) => finiteNonNegative(b.power) - finiteNonNegative(a.power))
      .slice(0, 3)
      .map((character) => ({
        name: character.name || "Unknown",
        power: finiteNonNegative(character.power),
      })),
    isStale: snapshotAgeMs > ROSTER_STALE_DAYS * 86_400_000,
  };
}

export function isUsefulDigestNotification(notification: DigestNotification): boolean {
  const type = notification.type.trim().toLowerCase().replace(/[\s_]+/g, "-");
  if (["test", "email-test", "verification", "delivery-verification"].includes(type)) {
    return false;
  }

  const text = `${notification.title} ${notification.message}`.toLowerCase();
  return !(
    text.includes("email delivery verification") ||
    text.includes("temporary alert") ||
    text.includes("delivery pipeline")
  );
}

export function hasUsefulWeeklyDigestContent(input: {
  roster: DigestRosterSummary | null;
  officialUpdates: DigestOfficialUpdate[];
  notifications: DigestNotification[];
  advisorQuestions: number;
}): boolean {
  return Boolean(
    input.roster ||
      input.officialUpdates.length ||
      input.notifications.length ||
      input.advisorQuestions > 0
  );
}

export async function getFreshOfficialUpdates(
  now = new Date()
): Promise<DigestOfficialUpdate[]> {
  const { endpoint, key, indexName, apiVersion } = getKnowledgeSearchConfig();
  if (!endpoint || !key) return [];

  const cutoff = new Date(
    now.getTime() - OFFICIAL_UPDATE_MAX_AGE_DAYS * 86_400_000
  ).toISOString();
  const response = await fetch(
    `${endpoint}/indexes/${encodeURIComponent(indexName)}/docs/search?api-version=${apiVersion}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "api-key": key },
      body: JSON.stringify({
        search: "*",
        filter: `category ne 'system' and sourceType eq 'official-blog' and lifecycleStatus eq 'active' and sourcePublishedAt ge ${cutoff}`,
        orderby: "sourcePublishedAt desc",
        top: 25,
        select: "sourceId,sourceVideoTitle,sourceUrl,sourcePublishedAt",
      }),
      signal: AbortSignal.timeout(15_000),
    }
  );
  if (!response.ok) throw new Error(`Official update search returned ${response.status}`);

  const payload = (await response.json()) as SearchPayload;
  const seen = new Set<string>();
  const updates: DigestOfficialUpdate[] = [];
  for (const document of payload.value ?? []) {
    const title = typeof document.sourceVideoTitle === "string"
      ? document.sourceVideoTitle.trim()
      : "";
    const url = typeof document.sourceUrl === "string" ? document.sourceUrl.trim() : "";
    const publishedAt = typeof document.sourcePublishedAt === "string"
      ? document.sourcePublishedAt
      : "";
    const sourceId = typeof document.sourceId === "string" ? document.sourceId : url;
    if (!title || !isSafeHttpUrl(url) || !isValidDate(publishedAt) || seen.has(sourceId)) continue;
    seen.add(sourceId);
    updates.push({ title, url, publishedAt: new Date(publishedAt).toISOString() });
    if (updates.length === 3) break;
  }
  return updates;
}

function isSafeHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function isValidDate(value: string): boolean {
  return Number.isFinite(new Date(value).getTime());
}
