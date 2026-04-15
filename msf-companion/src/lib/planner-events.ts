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

interface RawRequirements {
  anyCharacterFilters?: CharacterFilter[];
  specificCharacters?: string[];
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

export interface NormalizedEvent {
  id: string;
  name: string;
  type: string;
  startTime: string;
  endTime: string;
  requirements: NormalizedRequirements;
}

function traitId(t: string | { id: string }): string {
  return typeof t === "string" ? t : t.id;
}

function toISOString(t: number | string | undefined): string {
  if (!t) return "";
  if (typeof t === "number") return new Date(t * 1000).toISOString();
  return t;
}

function extractFromReqs(reqs: RawRequirements): NormalizedRequirements {
  const traits = new Set<string>();
  const specificCharacters = new Set<string>();
  let minGearTier: number | null = null;
  let minStars: number | null = null;
  let minLevel: number | null = null;

  if (reqs.anyCharacterFilters) {
    for (const f of reqs.anyCharacterFilters) {
      for (const t of f.allTraits ?? []) traits.add(traitId(t));
      for (const t of f.anyTraits ?? []) traits.add(traitId(t));
      if (f.anyCharacters) for (const c of f.anyCharacters) specificCharacters.add(c);
      if (f.gearTier != null) minGearTier = Math.max(minGearTier ?? 0, f.gearTier);
      if (f.activeYellow != null) minStars = Math.max(minStars ?? 0, f.activeYellow);
      if (f.level != null) minLevel = Math.max(minLevel ?? 0, f.level);
    }
  }
  if (reqs.specificCharacters) {
    for (const c of reqs.specificCharacters) specificCharacters.add(c);
  }
  return {
    traits: [...traits],
    specificCharacters: [...specificCharacters],
    minGearTier,
    minStars,
    minLevel,
  };
}

function mergeReqs(target: NormalizedRequirements, source: NormalizedRequirements): void {
  for (const t of source.traits) target.traits.push(t);
  for (const c of source.specificCharacters) target.specificCharacters.push(c);
  if (source.minGearTier != null) target.minGearTier = Math.max(target.minGearTier ?? 0, source.minGearTier);
  if (source.minStars != null) target.minStars = Math.max(target.minStars ?? 0, source.minStars);
  if (source.minLevel != null) target.minLevel = Math.max(target.minLevel ?? 0, source.minLevel);
}

function extractEpisodicReqs(wrapper: EpisodicDetailWrapper): NormalizedRequirements {
  const detail = wrapper.data ?? wrapper;
  const allReqs: RawRequirements[] = [];

  const d = detail as {
    requirements?: RawRequirements;
    nodes?: Record<string, EpisodicNode>;
    chapters?: Record<string, EpisodicChapter>;
  };

  if (d.requirements?.anyCharacterFilters || d.requirements?.specificCharacters) {
    allReqs.push(d.requirements);
  }

  if (d.nodes) {
    for (const node of Object.values(d.nodes)) {
      if (node.requirements) allReqs.push(node.requirements);
    }
  }

  if (d.chapters) {
    for (const chapter of Object.values(d.chapters)) {
      if (chapter.nodes) {
        for (const node of Object.values(chapter.nodes)) {
          if (node.requirements) allReqs.push(node.requirements);
        }
      }
      if (chapter.tiers) {
        for (const tier of Object.values(chapter.tiers)) {
          if (tier.requirements) allReqs.push(tier.requirements);
          if (tier.nodes) {
            for (const node of Object.values(tier.nodes)) {
              if (node.requirements) allReqs.push(node.requirements);
            }
          }
        }
      }
    }
  }

  const result: NormalizedRequirements = {
    traits: [], specificCharacters: [],
    minGearTier: null, minStars: null, minLevel: null,
  };
  for (const r of allReqs) mergeReqs(result, extractFromReqs(r));
  result.traits = [...new Set(result.traits)];
  result.specificCharacters = [...new Set(result.specificCharacters)];
  return result;
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
    const requirements: NormalizedRequirements = {
      traits: [], specificCharacters: [],
      minGearTier: null, minStars: null, minLevel: null,
    };

    if (event.type === "episodic" && event.episodic) {
      const epType = event.episodic.type;
      const epIds = event.episodic.ids ?? (event.episodic.id ? [event.episodic.id] : []);
      for (const epId of epIds) {
        try {
          const detail = await msfApiFetch<EpisodicDetailWrapper>({
            path: `/game/v1/episodics/${epType}/${epId}?nodeReqs=full&traitFormat=id`,
            accessToken,
          });
          mergeReqs(requirements, extractEpisodicReqs(detail));
        } catch (err) {
          console.warn(`Failed to fetch episodic ${event.id}/${epId}:`, err);
        }
      }
      requirements.traits = [...new Set(requirements.traits)];
      requirements.specificCharacters = [...new Set(requirements.specificCharacters)];
    } else if (event.type === "blitz" && event.blitz?.requirements) {
      mergeReqs(requirements, extractFromReqs(event.blitz.requirements));
    } else if (event.type === "tower" && event.tower?.requirements) {
      mergeReqs(requirements, extractFromReqs(event.tower.requirements));
    }

    normalized.push({
      id: event.id,
      name: event.name ?? event.id,
      type: event.type ?? "unknown",
      startTime: toISOString(event.startTime),
      endTime: toISOString(event.endTime),
      requirements,
    });
  }

  setCache(CACHE_KEY, normalized);
  return normalized;
}
