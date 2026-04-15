import { NormalizedEvent, NormalizedRequirements } from "@/lib/planner-events";

interface CharacterForPriority {
  id: string;
  name: string;
  portrait: string;
  traits: string[];
  gearTier: number;
  stars: number;
}

export interface PriorityEntry {
  rank: number;
  characterId: string;
  name: string;
  portrait: string;
  score: number;
  events: { id: string; name: string; startTime: string }[];
  currentGear: number;
  requiredGear: number;
}

function characterMatchesFilter(
  charTraits: string[],
  charId: string,
  reqs: NormalizedRequirements,
): boolean {
  if (reqs.specificCharacters.includes(charId)) return true;
  if (reqs.traits.length > 0) {
    return reqs.traits.some((t) => charTraits.includes(t));
  }
  return false;
}

export function calculatePriorities(
  characters: CharacterForPriority[],
  events: NormalizedEvent[],
  inventoryQuantities: Map<string, number>,
): PriorityEntry[] {
  const eventsWithReqs = events.filter(
    (e) =>
      e.requirements.traits.length > 0 ||
      e.requirements.specificCharacters.length > 0,
  );

  if (eventsWithReqs.length === 0) return [];

  const now = Date.now();

  // Build per-character event associations
  const charEventMap = new Map<
    string,
    {
      char: CharacterForPriority;
      events: NormalizedEvent[];
      maxRequiredGear: number;
      maxRequiredStars: number;
    }
  >();

  for (const event of eventsWithReqs) {
    const reqs = event.requirements;
    const reqGear = reqs.minGearTier ?? 0;
    const reqStars = reqs.minStars ?? 0;

    for (const char of characters) {
      if (!characterMatchesFilter(char.traits, char.id, reqs)) continue;

      // Skip characters that already meet this event's requirements
      if (char.gearTier >= reqGear && char.stars >= reqStars) continue;

      let entry = charEventMap.get(char.id);
      if (!entry) {
        entry = {
          char,
          events: [],
          maxRequiredGear: 0,
          maxRequiredStars: 0,
        };
        charEventMap.set(char.id, entry);
      }
      entry.events.push(event);
      entry.maxRequiredGear = Math.max(entry.maxRequiredGear, reqGear);
      entry.maxRequiredStars = Math.max(entry.maxRequiredStars, reqStars);
    }
  }

  // Score each character
  const scored: PriorityEntry[] = [];

  for (const [, entry] of charEventMap) {
    const { char } = entry;
    const eventCount = entry.events.length;

    // Find nearest event start
    let nearestDays = 365;
    for (const evt of entry.events) {
      const startMs = new Date(evt.startTime).getTime();
      const daysUntil = Math.max(0, (startMs - now) / (1000 * 60 * 60 * 24));
      nearestDays = Math.min(nearestDays, daysUntil);
    }

    const gearGap = Math.max(0, entry.maxRequiredGear - char.gearTier);

    // Score formula: (events * 3) + (inverse days * 2) + (inverse gear gap * 1)
    const score =
      eventCount * 3 +
      (nearestDays > 0 ? (1 / nearestDays) * 100 : 100) * 2 +
      (gearGap > 0 ? (1 / gearGap) * 10 : 0) * 1;

    scored.push({
      rank: 0, // Will be set after sorting
      characterId: char.id,
      name: char.name,
      portrait: char.portrait,
      score: Math.round(score * 100) / 100,
      events: entry.events.map((e) => ({
        id: e.id,
        name: e.name,
        startTime: e.startTime,
      })),
      currentGear: char.gearTier,
      requiredGear: entry.maxRequiredGear,
    });
  }

  // Sort by score descending
  scored.sort((a, b) => b.score - a.score);

  // Assign ranks and limit to top 20
  const top = scored.slice(0, 20);
  top.forEach((entry, i) => {
    entry.rank = i + 1;
  });

  return top;
}
