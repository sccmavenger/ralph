import { Character, RoomRequirements, RoomReadiness } from "./tower-readiness";

export interface UpgradeRecommendation {
  characterName: string;
  currentValue: number;
  targetValue: number;
  upgradeType: "gear" | "stars" | "level";
  roomsUnlocked: string[];
  impact: number;
}

interface RoomWithReadiness {
  id: string;
  name: string;
  requirements: RoomRequirements;
  readiness: RoomReadiness;
}

/**
 * Identifies which character upgrades would unlock the most additional rooms.
 * Returns up to 5 recommendations sorted by impact (rooms unlocked) descending.
 */
export function getUpgradeRecommendations(
  rooms: RoomWithReadiness[],
  roster: Character[],
  _readinessResults?: unknown
): UpgradeRecommendation[] {
  const recommendations: UpgradeRecommendation[] = [];

  // Only look at "almost" and "blocked" rooms
  const nonReadyRooms = rooms.filter(
    (r) => r.readiness.status === "almost" || r.readiness.status === "blocked"
  );

  for (const room of nonReadyRooms) {
    if (room.readiness.status === "blocked") {
      // For blocked rooms, check if any character is close
      const potentialChars = roster.filter((char) => {
        // Must match traits
        const traitMatch =
          room.requirements.traits.length === 0 ||
          room.requirements.traits.some((trait) =>
            char.traits.map((t) => t.toLowerCase()).includes(trait.toLowerCase())
          );
        return traitMatch;
      });

      if (potentialChars.length === 0) {
        // No characters with right traits at all — skip (can't recommend)
        continue;
      }

      // Find the closest characters that need upgrades
      for (const char of potentialChars) {
        if (char.gearTier < room.requirements.minGearTier) {
          addOrMergeRecommendation(recommendations, {
            characterName: char.name,
            currentValue: char.gearTier,
            targetValue: room.requirements.minGearTier,
            upgradeType: "gear",
            roomsUnlocked: [room.name],
            impact: 1,
          });
        }
        if (char.stars < room.requirements.minStars) {
          addOrMergeRecommendation(recommendations, {
            characterName: char.name,
            currentValue: char.stars,
            targetValue: room.requirements.minStars,
            upgradeType: "stars",
            roomsUnlocked: [room.name],
            impact: 1,
          });
        }
        if (char.level < room.requirements.minLevel) {
          addOrMergeRecommendation(recommendations, {
            characterName: char.name,
            currentValue: char.level,
            targetValue: room.requirements.minLevel,
            upgradeType: "level",
            roomsUnlocked: [room.name],
            impact: 1,
          });
        }
      }
    } else {
      // "almost" rooms — find the specific gap
      const almostChars = roster.filter((char) => {
        const traitMatch =
          room.requirements.traits.length === 0 ||
          room.requirements.traits.some((trait) =>
            char.traits.map((t) => t.toLowerCase()).includes(trait.toLowerCase())
          );
        if (!traitMatch) return false;

        // Character meets trait but fails exactly one threshold
        let failCount = 0;
        if (char.gearTier < room.requirements.minGearTier) failCount++;
        if (char.stars < room.requirements.minStars) failCount++;
        if (char.level < room.requirements.minLevel) failCount++;
        return failCount === 1;
      });

      for (const char of almostChars) {
        if (char.gearTier < room.requirements.minGearTier) {
          addOrMergeRecommendation(recommendations, {
            characterName: char.name,
            currentValue: char.gearTier,
            targetValue: room.requirements.minGearTier,
            upgradeType: "gear",
            roomsUnlocked: [room.name],
            impact: 1,
          });
        } else if (char.stars < room.requirements.minStars) {
          addOrMergeRecommendation(recommendations, {
            characterName: char.name,
            currentValue: char.stars,
            targetValue: room.requirements.minStars,
            upgradeType: "stars",
            roomsUnlocked: [room.name],
            impact: 1,
          });
        } else if (char.level < room.requirements.minLevel) {
          addOrMergeRecommendation(recommendations, {
            characterName: char.name,
            currentValue: char.level,
            targetValue: room.requirements.minLevel,
            upgradeType: "level",
            roomsUnlocked: [room.name],
            impact: 1,
          });
        }
      }
    }
  }

  // Sort by impact descending, return top 5
  return recommendations
    .sort((a, b) => b.impact - a.impact)
    .slice(0, 5);
}

/**
 * Merge recommendations for the same character + upgrade type.
 */
function addOrMergeRecommendation(
  recommendations: UpgradeRecommendation[],
  newRec: UpgradeRecommendation
): void {
  const existing = recommendations.find(
    (r) =>
      r.characterName === newRec.characterName &&
      r.upgradeType === newRec.upgradeType &&
      r.targetValue === newRec.targetValue
  );

  if (existing) {
    existing.roomsUnlocked.push(...newRec.roomsUnlocked);
    existing.impact = existing.roomsUnlocked.length;
  } else {
    recommendations.push(newRec);
  }
}
