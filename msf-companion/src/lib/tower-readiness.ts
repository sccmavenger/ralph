export interface Character {
  id: string;
  name: string;
  traits: string[];
  gearTier: number;
  stars: number;
  level: number;
  power: number;
}

export interface RoomRequirements {
  traits: string[];
  minGearTier: number;
  minStars: number;
  minLevel: number;
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

/**
 * Determines if a character meets ALL requirements for a room.
 */
function meetsAllRequirements(char: Character, requirements: RoomRequirements): boolean {
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
 */
export function calculateRoomReadiness(
  roster: Character[],
  requirements: RoomRequirements
): RoomReadiness {
  const fullyEligible = roster.filter((char) => meetsAllRequirements(char, requirements));

  if (fullyEligible.length >= 5) {
    return {
      status: "ready",
      eligibleCount: fullyEligible.length,
      eligibleCharacters: fullyEligible,
    };
  }

  // Check "almost" case: 3-4 fully eligible, OR 5+ with traits but one threshold short
  const almostEligible = roster.filter((char) => meetsTraitsButAlmost(char, requirements));
  const combinedCount = fullyEligible.length + almostEligible.length;

  if (fullyEligible.length >= 3 || combinedCount >= 5) {
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
