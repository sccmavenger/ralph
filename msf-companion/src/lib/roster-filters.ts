export interface RosterCharacter {
  id: string;
  name?: string;
  power?: number;
  gearTier?: number;
  level?: number;
  yellowStars?: number;
  redStars?: number;
  portrait?: string;
  traits?: string[];
  playable?: boolean;
}

export interface RosterFilters {
  teams: string[];
  origins: string[];
  alignments: string[];
  locations: string[];
  roles: string[];
  yellowStarMin: number;
  yellowStarMax: number;
  redStarMin: number;
  redStarMax: number;
  diamondMin: number;
  diamondMax: number;
  gearTierMin: number;
  gearTierMax: number;
  powerMin: number;
  powerMax: number;
}

export const DEFAULT_FILTERS: RosterFilters = {
  teams: [],
  origins: [],
  alignments: [],
  locations: [],
  roles: [],
  yellowStarMin: 0,
  yellowStarMax: 7,
  redStarMin: 0,
  redStarMax: 7,
  diamondMin: 0,
  diamondMax: 5,
  gearTierMin: 0,
  gearTierMax: 20,
  powerMin: 0,
  powerMax: Infinity,
};

export function countActiveFilters(filters: RosterFilters): number {
  let count = 0;
  if (filters.teams.length > 0) count++;
  if (filters.origins.length > 0) count++;
  if (filters.alignments.length > 0) count++;
  if (filters.locations.length > 0) count++;
  if (filters.roles.length > 0) count++;
  if (filters.yellowStarMin > 0 || filters.yellowStarMax < 7) count++;
  if (filters.redStarMin > 0 || filters.redStarMax < 7) count++;
  if (filters.diamondMin > 0 || filters.diamondMax < 5) count++;
  if (filters.gearTierMin > 0 || filters.gearTierMax < 20) count++;
  if (filters.powerMin > 0 || filters.powerMax < Infinity) count++;
  return count;
}

export function applyFilters(
  characters: RosterCharacter[],
  filters: RosterFilters
): RosterCharacter[] {
  return characters.filter((char) => {
    const charTraits = (char.traits ?? []).map((t) => t.toUpperCase());

    // Team filter (AND with other filters, OR within teams - char must be in at least one selected team)
    if (filters.teams.length > 0) {
      if (!filters.teams.some((t) => charTraits.includes(t.toUpperCase()))) return false;
    }

    // OR within each category, AND across categories. Selecting BIO and BLASTER
    // means "a Bio Blaster", while selecting BIO and TECH means either origin.
    if (
      filters.origins.length > 0 &&
      !filters.origins.some((t) => charTraits.includes(t.toUpperCase()))
    ) {
      return false;
    }
    if (
      filters.alignments.length > 0 &&
      !filters.alignments.some((t) => charTraits.includes(t.toUpperCase()))
    ) {
      return false;
    }
    if (
      filters.locations.length > 0 &&
      !filters.locations.some((t) => charTraits.includes(t.toUpperCase()))
    ) {
      return false;
    }
    if (
      filters.roles.length > 0 &&
      !filters.roles.some((t) => charTraits.includes(t.toUpperCase()))
    ) {
      return false;
    }

    // Star filters — yellow stars
    const ys = char.yellowStars ?? 0;
    if (ys < filters.yellowStarMin || ys > filters.yellowStarMax) return false;

    // Red stars (capped at 7, above 7 = diamonds)
    const rawRs = char.redStars ?? 0;
    const rs = Math.min(rawRs, 7);
    if (rs < filters.redStarMin || rs > filters.redStarMax) return false;

    // Diamonds (redStars above 7)
    const diamonds = Math.max(rawRs - 7, 0);
    if (diamonds < filters.diamondMin || diamonds > filters.diamondMax) return false;

    // Gear tier
    const gt = char.gearTier ?? 0;
    if (gt < filters.gearTierMin || gt > filters.gearTierMax) return false;

    // Power
    const pw = char.power ?? 0;
    if (pw < filters.powerMin || pw > filters.powerMax) return false;

    return true;
  });
}
