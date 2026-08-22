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
  weekChange: DigestRosterChange | null;
  monthChange: DigestRosterChange | null;
  progress: DigestProgressPoint[];
  topCharacters: Array<{ name: string; power: number }>;
  isStale: boolean;
}

export interface DigestRosterChange {
  powerChange: number;
  rosterChange: number;
  baselineAt: string;
  elapsedDays: number;
}

export interface DigestProgressPoint {
  snapshotAt: string;
  totalPower: number;
  rosterSize: number;
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

interface NormalizedSnapshot extends DigestProgressPoint {
  characters: ReturnType<typeof normalizeAdvisorRosterSnapshot>;
  timestamp: number;
}

const DAY_MS = 86_400_000;
const WEEK_DAYS = 7;
const MONTH_DAYS = 30;
const MAX_PROGRESS_POINTS = 6;

function finiteNonNegative(value: number | undefined): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0;
}

export function summarizeDigestRoster(
  snapshots: SnapshotInput[],
  now = new Date()
): DigestRosterSummary | null {
  const normalized = snapshots
    .map(normalizeSnapshot)
    .filter((snapshot): snapshot is NormalizedSnapshot => snapshot !== null)
    .sort((a, b) => b.timestamp - a.timestamp);
  const current = normalized[0];
  if (!current) return null;

  const weekBaseline = normalized.find(
    (snapshot) => snapshot.timestamp <= now.getTime() - WEEK_DAYS * DAY_MS
  );
  const monthBaseline = normalized.find(
    (snapshot) => snapshot.timestamp <= now.getTime() - MONTH_DAYS * DAY_MS
  );
  const snapshotAgeMs = now.getTime() - current.timestamp;

  return {
    rosterSize: current.rosterSize,
    totalPower: current.totalPower,
    averagePower: Math.round(current.totalPower / current.rosterSize),
    sevenStarCharacters: current.characters.filter(
      (character) => character.yellowStars === 7
    ).length,
    snapshotAt: current.snapshotAt,
    weekChange: buildRosterChange(current, weekBaseline),
    monthChange: buildRosterChange(current, monthBaseline),
    progress: buildProgressPoints(normalized, current, monthBaseline, now),
    topCharacters: [...current.characters]
      .sort((a, b) => finiteNonNegative(b.power) - finiteNonNegative(a.power))
      .slice(0, 3)
      .map((character) => ({
        name: character.name || "Unknown",
        power: finiteNonNegative(character.power),
      })),
    isStale: snapshotAgeMs > ROSTER_STALE_DAYS * DAY_MS,
  };
}

function normalizeSnapshot(snapshot: SnapshotInput): NormalizedSnapshot | null {
  const timestamp = new Date(snapshot.createdAt).getTime();
  const characters = normalizeAdvisorRosterSnapshot(snapshot.snapshotData);
  if (!Number.isFinite(timestamp) || !characters.length) return null;
  const totalPower = characters.reduce(
    (total, character) => total + finiteNonNegative(character.power),
    0
  );
  return {
    characters,
    timestamp,
    snapshotAt: new Date(timestamp).toISOString(),
    totalPower,
    rosterSize: characters.length,
  };
}

function buildRosterChange(
  current: NormalizedSnapshot,
  baseline: NormalizedSnapshot | undefined
): DigestRosterChange | null {
  if (!baseline || baseline.snapshotAt === current.snapshotAt) return null;
  return {
    powerChange: current.totalPower - baseline.totalPower,
    rosterChange: current.rosterSize - baseline.rosterSize,
    baselineAt: baseline.snapshotAt,
    elapsedDays: Math.max(1, Math.round((current.timestamp - baseline.timestamp) / DAY_MS)),
  };
}

function buildProgressPoints(
  snapshots: NormalizedSnapshot[],
  current: NormalizedSnapshot,
  monthBaseline: NormalizedSnapshot | undefined,
  now: Date
): DigestProgressPoint[] {
  const cutoff = now.getTime() - MONTH_DAYS * DAY_MS;
  const candidates = snapshots
    .filter(
      (snapshot) =>
        snapshot.timestamp >= cutoff || snapshot.snapshotAt === monthBaseline?.snapshotAt
    )
    .sort((a, b) => a.timestamp - b.timestamp);

  const stateChanges: NormalizedSnapshot[] = [];
  for (const snapshot of candidates) {
    const previous = stateChanges.at(-1);
    if (
      !previous ||
      previous.totalPower !== snapshot.totalPower ||
      previous.rosterSize !== snapshot.rosterSize
    ) {
      stateChanges.push(snapshot);
    }
  }
  if (stateChanges.at(-1)?.snapshotAt !== current.snapshotAt) {
    stateChanges.push(current);
  }

  return sampleProgressPoints(stateChanges, MAX_PROGRESS_POINTS).map(
    ({ snapshotAt, totalPower, rosterSize }) => ({
      snapshotAt,
      totalPower,
      rosterSize,
    })
  );
}

function sampleProgressPoints(
  points: NormalizedSnapshot[],
  maximum: number
): NormalizedSnapshot[] {
  if (points.length <= maximum) return points;
  const selected = new Set<number>([0, points.length - 1]);
  const interval = (points.length - 1) / (maximum - 1);
  for (let index = 1; index < maximum - 1; index++) {
    selected.add(Math.round(index * interval));
  }
  return [...selected].sort((a, b) => a - b).map((index) => points[index]);
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
