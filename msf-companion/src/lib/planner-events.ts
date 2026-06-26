import { msfApiFetch } from "@/lib/msf-api";
import { getCached, setCache } from "@/lib/planner-cache";

interface RawEvent {
  id: string;
  name?: string;
  type?: string;
  startTime?: number | string;
  endTime?: number | string;
  episodic?: { type?: string; ids?: string[]; id?: string };
  blitz?: { requirements?: RawRequirements };
  tower?: { requirements?: RawRequirements };
}

interface RawNodeCompletion {
  type?: string;
  id?: string;
}

interface RawOtherRequirements {
  allNodeCompletions?: RawNodeCompletion[];
}

interface RawRequirements {
  anyCharacterFilters?: CharacterFilter[];
  specificCharacters?: string[];
  minCharacters?: number;
  maxCharacters?: number;
  missionCharacters?: boolean;
  otherRequirements?: RawOtherRequirements;
}

interface CharacterFilter {
  allTraits?: (string | { id: string })[];
  anyTraits?: (string | { id: string })[];
  anyCharacters?: string[];
  gearTier?: number;
  activeYellow?: number;
  level?: number;
}

interface EpisodicNode {
  requirements?: RawRequirements;
}

interface EpisodicTier {
  requirements?: RawRequirements;
  nodes?: Record<string, EpisodicNode>;
}

interface EpisodicChapter {
  tiers?: Record<string, EpisodicTier>;
  nodes?: Record<string, EpisodicNode>;
}

interface EpisodicDetailWrapper {
  data?: {
    requirements?: RawRequirements;
    nodes?: Record<string, EpisodicNode>;
    chapters?: Record<string, EpisodicChapter>;
  };
}

export interface NormalizedRequirements {
  traits: string[];
  specificCharacters: string[];
  minGearTier: number | null;
  minStars: number | null;
  minLevel: number | null;
}

/** A single gate within one encounter (one anyCharacterFilter or a specificCharacters group). */
export interface EncounterFilter {
  traits: string[];
  specificCharacters: string[];
  minGearTier: number | null;
  minStars: number | null;
  minLevel: number | null;
}

/** One encounter (an episodic tier/node) with its own team requirements. */
export interface NormalizedEncounter {
  chapter: number;
  tier: number;
  minCharacters: number | null;
  maxCharacters: number | null;
  /** Game supplies the team (boss tier) — no roster gate, excluded from readiness. */
  missionCharacters: boolean;
  filters: EncounterFilter[];
}

/** A prerequisite campaign that must be completed first (from allNodeCompletions). */
export interface PrerequisiteRef {
  type: string;
  id: string;
}

export interface NormalizedEvent {
  id: string;
  name: string;
  type: string;
  startTime: string;
  endTime: string;
  /** Aggregate of all encounters (kept for backward compatibility). */
  requirements: NormalizedRequirements;
  /** Per-encounter requirements — preserves each tier's distinct team gate. */
  encounters: NormalizedEncounter[];
  /** Distinct campaigns that must be completed before this event unlocks. */
  prerequisites: PrerequisiteRef[];
}

function traitId(t: string | { id: string }): string {
  return typeof t === "string" ? t : t.id;
}

function toISOString(t: number | string | undefined): string {
  if (!t) return "";
  if (typeof t === "number") return new Date(t * 1000).toISOString();
  return t;
}

function filterFromCharacterFilter(f: CharacterFilter): EncounterFilter {
  const traits = new Set<string>();
  for (const t of f.allTraits ?? []) traits.add(traitId(t));
  for (const t of f.anyTraits ?? []) traits.add(traitId(t));
  return {
    traits: [...traits],
    specificCharacters: [...(f.anyCharacters ?? [])],
    minGearTier: f.gearTier ?? null,
    minStars: f.activeYellow ?? null,
    minLevel: f.level ?? null,
  };
}

function isBareGearFilter(f: CharacterFilter): boolean {
  const hasTraits = (f.allTraits?.length ?? 0) > 0 || (f.anyTraits?.length ?? 0) > 0;
  const hasChars = (f.anyCharacters?.length ?? 0) > 0;
  return !hasTraits && !hasChars;
}

/**
 * Build a single encounter from one tier/node's raw requirements.
 * Returns null when there is no roster gate at all (and it isn't a mission tier).
 */
function buildEncounter(
  reqs: RawRequirements,
  chapter: number,
  tier: number,
): NormalizedEncounter | null {
  const missionCharacters = reqs.missionCharacters === true;
  const allFilters = reqs.anyCharacterFilters ?? [];
  const filters: EncounterFilter[] = [];

  if (reqs.specificCharacters && reqs.specificCharacters.length > 0) {
    // The gear/level/star gate from a bare filter applies to these named characters.
    const bare = allFilters.find(isBareGearFilter);
    filters.push({
      traits: [],
      specificCharacters: [...reqs.specificCharacters],
      minGearTier: bare?.gearTier ?? null,
      minStars: bare?.activeYellow ?? null,
      minLevel: bare?.level ?? null,
    });
    // Keep any non-bare filters (trait/character gates) as their own filters.
    for (const f of allFilters) {
      if (!isBareGearFilter(f)) filters.push(filterFromCharacterFilter(f));
    }
  } else {
    for (const f of allFilters) filters.push(filterFromCharacterFilter(f));
  }

  if (
    !missionCharacters &&
    filters.length === 0 &&
    reqs.minCharacters == null &&
    reqs.maxCharacters == null
  ) {
    return null;
  }

  return {
    chapter,
    tier,
    minCharacters: reqs.minCharacters ?? null,
    maxCharacters: reqs.maxCharacters ?? null,
    missionCharacters,
    filters,
  };
}

/** Collapse a list of encounters into the legacy aggregate requirements blob. */
function aggregateRequirements(encounters: NormalizedEncounter[]): NormalizedRequirements {
  const traits = new Set<string>();
  const specificCharacters = new Set<string>();
  let minGearTier: number | null = null;
  let minStars: number | null = null;
  let minLevel: number | null = null;

  for (const enc of encounters) {
    for (const f of enc.filters) {
      for (const t of f.traits) traits.add(t);
      for (const c of f.specificCharacters) specificCharacters.add(c);
      if (f.minGearTier != null) minGearTier = Math.max(minGearTier ?? 0, f.minGearTier);
      if (f.minStars != null) minStars = Math.max(minStars ?? 0, f.minStars);
      if (f.minLevel != null) minLevel = Math.max(minLevel ?? 0, f.minLevel);
    }
  }

  return {
    traits: [...traits],
    specificCharacters: [...specificCharacters],
    minGearTier,
    minStars,
    minLevel,
  };
}

/** Extract every encounter (tier/node) from one episodic detail response. */
export function extractEpisodicEncounters(wrapper: EpisodicDetailWrapper): NormalizedEncounter[] {
  const detail = (wrapper.data ?? wrapper) as {
    nodes?: Record<string, EpisodicNode>;
    chapters?: Record<string, EpisodicChapter>;
  };
  const encounters: NormalizedEncounter[] = [];

  const pushNodes = (
    nodes: Record<string, EpisodicNode> | undefined,
    chapter: number,
    tier: number,
  ) => {
    if (!nodes) return;
    for (const node of Object.values(nodes)) {
      if (!node.requirements) continue;
      const enc = buildEncounter(node.requirements, chapter, tier);
      if (enc) encounters.push(enc);
    }
  };

  // Top-level nodes (no chapter/tier context).
  pushNodes(detail.nodes, 0, 0);

  if (detail.chapters) {
    for (const [chKey, chapter] of Object.entries(detail.chapters)) {
      const chNum = Number(chKey) || 0;
      pushNodes(chapter.nodes, chNum, 0);
      if (chapter.tiers) {
        for (const [tKey, tier] of Object.entries(chapter.tiers)) {
          const tNum = Number(tKey) || 0;
          if (tier.requirements) {
            const enc = buildEncounter(tier.requirements, chNum, tNum);
            if (enc) encounters.push(enc);
          }
          pushNodes(tier.nodes, chNum, tNum);
        }
      }
    }
  }

  return encounters;
}

/** Extract prerequisite campaign refs from one episodic detail response. */
export function extractEpisodicPrerequisites(wrapper: EpisodicDetailWrapper): PrerequisiteRef[] {
  const detail = (wrapper.data ?? wrapper) as { requirements?: RawRequirements };
  const completions = detail.requirements?.otherRequirements?.allNodeCompletions ?? [];
  const seen = new Set<string>();
  const refs: PrerequisiteRef[] = [];
  for (const c of completions) {
    if (!c.type || !c.id) continue;
    const key = `${c.type}/${c.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    refs.push({ type: c.type, id: c.id });
  }
  return refs;
}

export async function fetchNormalizedEvents(
  accessToken: string,
  forceRefresh = false,
): Promise<NormalizedEvent[]> {
  const CACHE_KEY = "planner:events";

  if (!forceRefresh) {
    const cached = getCached<NormalizedEvent[]>(CACHE_KEY);
    if (cached) return cached;
  }

  const raw = await msfApiFetch<{ data?: RawEvent[] }>({
    path: "/game/v1/events?perPage=50&eventInfo=full",
    accessToken,
  });

  const nowEpoch = Math.floor(Date.now() / 1000);
  const events = (raw.data ?? []).filter((e) => {
    if (!e.endTime || e.type === "info") return false;
    const endEpoch = typeof e.endTime === "number" ? e.endTime : new Date(String(e.endTime)).getTime() / 1000;
    return endEpoch > nowEpoch;
  });

  const normalized: NormalizedEvent[] = [];

  for (const event of events) {
    const encounters: NormalizedEncounter[] = [];
    const prerequisites: PrerequisiteRef[] = [];
    const seenPrereqs = new Set<string>();

    if (event.type === "episodic" && event.episodic) {
      const epType = event.episodic.type;
      const epIds = event.episodic.ids ?? (event.episodic.id ? [event.episodic.id] : []);
      for (const epId of epIds) {
        try {
          const detail = await msfApiFetch<EpisodicDetailWrapper>({
            path: `/game/v1/episodics/${epType}/${epId}?nodeReqs=full&traitFormat=id`,
            accessToken,
          });
          encounters.push(...extractEpisodicEncounters(detail));
          for (const ref of extractEpisodicPrerequisites(detail)) {
            const key = `${ref.type}/${ref.id}`;
            if (seenPrereqs.has(key)) continue;
            seenPrereqs.add(key);
            prerequisites.push(ref);
          }
        } catch (err) {
          console.warn(`Failed to fetch episodic ${event.id}/${epId}:`, err);
        }
      }
    } else if (event.type === "blitz" && event.blitz?.requirements) {
      const enc = buildEncounter(event.blitz.requirements, 0, 0);
      if (enc) encounters.push(enc);
    } else if (event.type === "tower" && event.tower?.requirements) {
      const enc = buildEncounter(event.tower.requirements, 0, 0);
      if (enc) encounters.push(enc);
    }

    normalized.push({
      id: event.id,
      name: event.name ?? event.id,
      type: event.type ?? "unknown",
      startTime: toISOString(event.startTime),
      endTime: toISOString(event.endTime),
      requirements: aggregateRequirements(encounters),
      encounters,
      prerequisites,
    });
  }

  setCache(CACHE_KEY, normalized);
  return normalized;
}
