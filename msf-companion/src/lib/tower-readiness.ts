export interface Character {
  id: string;
  name: string;
  traits: string[];
  gearTier: number;
  stars: number;
  level: number;
  power: number;
}

export interface CharacterFilter {
  allTraits: string[];
  anyTraits: string[];
  anyCharacters: string[];
  gearTier: number;
  minStars: number;
  minLevel: number;
}

export interface RoomRequirements {
  traits: string[];
  minGearTier: number;
  minStars: number;
  minLevel: number;
  // Optional structured filters (OR-of-ANDs). When present, used in place of the flat traits list.
  filters?: CharacterFilter[];
  specificCharacters?: string[];
}

export interface RoomReadiness {
  status: "ready" | "almost" | "blocked";
  eligibleCount: number;
  eligibleCharacters: Character[];
}

export interface OverallReadiness {
  readyCount: number;
  almostCount: number;
  blockedCount: number;
  totalRooms: number;
  summary: string;
}

function charTraitSet(char: Character): Set<string> {
  return new Set(char.traits.map((t) => t.toLowerCase()));
}

function matchesFilter(char: Character, filter: CharacterFilter): boolean {
  const charTraits = charTraitSet(char);
  if (filter.allTraits.length > 0) {
    for (const t of filter.allTraits) {
      if (!charTraits.has(t.toLowerCase())) return false;
    }
  }
  if (filter.anyTraits.length > 0) {
    const ok = filter.anyTraits.some((t) => charTraits.has(t.toLowerCase()));
    if (!ok) return false;
  }
  if (filter.anyCharacters.length > 0) {
    if (!filter.anyCharacters.includes(char.id)) return false;
  }
  if (filter.gearTier > 0 && char.gearTier < filter.gearTier) return false;
  if (filter.minStars > 0 && char.stars < filter.minStars) return false;
  if (filter.minLevel > 0 && char.level < filter.minLevel) return false;
  return true;
}

function matchesFilterTraitsOnly(char: Character, filter: CharacterFilter): boolean {
  const charTraits = charTraitSet(char);
  if (filter.allTraits.length > 0) {
    for (const t of filter.allTraits) {
      if (!charTraits.has(t.toLowerCase())) return false;
    }
  }
  if (filter.anyTraits.length > 0) {
    const ok = filter.anyTraits.some((t) => charTraits.has(t.toLowerCase()));
    if (!ok) return false;
  }
  if (filter.anyCharacters.length > 0) {
    if (!filter.anyCharacters.includes(char.id)) return false;
  }
  return true;
}

/**
 * Determines if a character meets ALL requirements for a room.
 */
function meetsAllRequirements(char: Character, requirements: RoomRequirements): boolean {
  if (requirements.filters && requirements.filters.length > 0) {
    return requirements.filters.some((f) => matchesFilter(char, f));
  }

  const traitMatch =
    requirements.traits.length === 0 ||
    requirements.traits.some((trait) =>
      char.traits.map((t) => t.toLowerCase()).includes(trait.toLowerCase())
    );

  return (
    traitMatch &&
    char.gearTier >= requirements.minGearTier &&
    char.stars >= requirements.minStars &&
    char.level >= requirements.minLevel
  );
}

/**
 * Determines if a character meets trait requirements but may be below one threshold.
 */
function meetsTraitsButAlmost(char: Character, requirements: RoomRequirements): boolean {
  if (requirements.filters && requirements.filters.length > 0) {
    return requirements.filters.some((f) => {
      if (!matchesFilterTraitsOnly(char, f)) return false;
      let failCount = 0;
      if (f.gearTier > 0 && char.gearTier < f.gearTier) failCount++;
      if (f.minStars > 0 && char.stars < f.minStars) failCount++;
      if (f.minLevel > 0 && char.level < f.minLevel) failCount++;
      return failCount === 1;
    });
  }

  const traitMatch =
    requirements.traits.length === 0 ||
    requirements.traits.some((trait) =>
      char.traits.map((t) => t.toLowerCase()).includes(trait.toLowerCase())
    );

  if (!traitMatch) return false;

  // Count how many thresholds are NOT met
  let failCount = 0;
  if (char.gearTier < requirements.minGearTier) failCount++;
  if (char.stars < requirements.minStars) failCount++;
  if (char.level < requirements.minLevel) failCount++;

  // "Almost" means they have the right trait but fail on exactly one threshold
  return failCount === 1;
}

/**
 * Calculate readiness for a single room based on roster vs requirements.
 * @param requiredCount minimum number of characters needed to clear the room (default 5)
 */
export function calculateRoomReadiness(
  roster: Character[],
  requirements: RoomRequirements,
  requiredCount: number = 5
): RoomReadiness {
  const fullyEligible = roster.filter((char) => meetsAllRequirements(char, requirements));
  const need = Math.max(1, requiredCount);

  if (fullyEligible.length >= need) {
    return {
      status: "ready",
      eligibleCount: fullyEligible.length,
      eligibleCharacters: fullyEligible,
    };
  }

  // "Almost": have at least ~60% of needed fully-eligible, OR enough trait-matching chars who are one threshold short
  const almostEligible = roster.filter((char) => meetsTraitsButAlmost(char, requirements));
  const combinedCount = fullyEligible.length + almostEligible.length;
  const almostThreshold = Math.max(1, Math.ceil(need * 0.6));

  if (fullyEligible.length >= almostThreshold || combinedCount >= need) {
    return {
      status: "almost",
      eligibleCount: fullyEligible.length,
      eligibleCharacters: fullyEligible,
    };
  }

  return {
    status: "blocked",
    eligibleCount: fullyEligible.length,
    eligibleCharacters: fullyEligible,
  };
}

/**
 * Calculate overall readiness across all rooms.
 */
export function calculateOverallReadiness(
  roomStatuses: Array<{ status: "ready" | "almost" | "blocked" }>
): OverallReadiness {
  const readyCount = roomStatuses.filter((r) => r.status === "ready").length;
  const almostCount = roomStatuses.filter((r) => r.status === "almost").length;
  const blockedCount = roomStatuses.filter((r) => r.status === "blocked").length;
  const totalRooms = roomStatuses.length;

  const clearable = readyCount + almostCount;
  const summary = `You can likely clear ${clearable} of ${totalRooms} battles this tower`;

  return {
    readyCount,
    almostCount,
    blockedCount,
    totalRooms,
    summary,
  };
}
