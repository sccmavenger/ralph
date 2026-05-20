import { Character } from "./tower-readiness";

export interface RoomForSolver {
  id: string;
  name: string;
  requirements: {
    traits: string[];
    minGearTier: number;
    minStars: number;
    minLevel: number;
  };
}

export interface MetaTeam {
  squad: string[];
  usageTotal: number;
  winRate?: number;
}

export interface TeamAssignment {
  characters: Character[];
  power: number;
  confidence: "strong" | "shouldWork" | "risky";
  reason: string;
}

export interface SolverResult {
  assignments: Map<string, TeamAssignment>;
  unassignableRooms: string[];
}

/**
 * Check if a character meets a room's requirements.
 */
function meetsRequirements(char: Character, req: RoomForSolver["requirements"]): boolean {
  const traitMatch =
    req.traits.length === 0 ||
    req.traits.some((trait) =>
      char.traits.map((t) => t.toLowerCase()).includes(trait.toLowerCase())
    );

  return (
    traitMatch &&
    char.gearTier >= req.minGearTier &&
    char.stars >= req.minStars &&
    char.level >= req.minLevel
  );
}

/**
 * Calculate the total power of a set of characters.
 */
function teamPower(characters: Character[]): number {
  return characters.reduce((sum, c) => sum + c.power, 0);
}

/**
 * Determine confidence level based on team power vs estimated room need.
 * Estimated need = 5 characters at minimum threshold power.
 */
function getConfidence(
  assignedPower: number,
  roomChars: Character[]
): "strong" | "shouldWork" | "risky" {
  // Estimate baseline power from the weakest eligible (min thresholds)
  const avgPower = assignedPower / Math.max(roomChars.length, 1);
  const minCharPower = Math.min(...roomChars.map((c) => c.power));
  const baselineEstimate = minCharPower * 5;

  const margin = (assignedPower - baselineEstimate) / Math.max(baselineEstimate, 1);

  if (margin >= 0.2) return "strong";
  if (margin >= 0) return "shouldWork";
  return "risky";
}

/**
 * Check if a team composition matches any meta team.
 */
function matchesMetaTeam(charIds: string[], metaTeams: MetaTeam[]): MetaTeam | undefined {
  return metaTeams.find((meta) => {
    const metaSet = new Set(meta.squad);
    const matchCount = charIds.filter((id) => metaSet.has(id)).length;
    return matchCount >= 3; // At least 3 of 5 from meta team
  });
}

/**
 * Globally optimal solver that allocates teams across all rooms.
 * Strategy: assign weakest viable teams to easiest rooms, preserving strong characters for harder rooms.
 */
export function solveTowerAllocation(
  rooms: RoomForSolver[],
  roster: Character[],
  metaTeams: MetaTeam[],
  clearedRooms?: string[]
): SolverResult {
  const assignments = new Map<string, TeamAssignment>();
  const unassignableRooms: string[] = [];
  const usedCharIds = new Set<string>();
  const clearedSet = new Set(clearedRooms || []);

  // Filter out cleared rooms
  const activeRooms = rooms.filter((r) => !clearedSet.has(r.id));

  // Sort rooms by difficulty (harder rooms first based on requirements)
  // Difficulty heuristic: higher gear + stars + level = harder
  const sortedRooms = [...activeRooms].sort((a, b) => {
    const diffA =
      a.requirements.minGearTier * 10 + a.requirements.minStars * 5 + a.requirements.minLevel;
    const diffB =
      b.requirements.minGearTier * 10 + b.requirements.minStars * 5 + b.requirements.minLevel;
    return diffB - diffA; // Hardest first
  });

  // For each room (hardest first), find the best viable team
  for (const room of sortedRooms) {
    // Get eligible characters that haven't been used
    const eligible = roster.filter(
      (char) => !usedCharIds.has(char.id) && meetsRequirements(char, room.requirements)
    );

    if (eligible.length < 5) {
      // Can't fill a team — check if we can assign with fewer (minimum 5 required per AC)
      unassignableRooms.push(room.id);
      continue;
    }

    // Sort eligible by power ascending — we want the weakest viable team
    const sortedEligible = [...eligible].sort((a, b) => a.power - b.power);

    // Take the weakest 5 as default assignment
    let assignedTeam = sortedEligible.slice(0, 5);

    // Check if a meta team is available within 10% power of the weakest assignment
    const weakestPower = teamPower(assignedTeam);
    const metaMatch = matchesMetaTeam(
      eligible.map((c) => c.id),
      metaTeams
    );

    if (metaMatch) {
      const metaChars = eligible.filter((c) => metaMatch.squad.includes(c.id));
      if (metaChars.length >= 5) {
        const metaPower = teamPower(metaChars.slice(0, 5));
        // If meta team power is within 10% of weakest viable, prefer meta
        if (Math.abs(metaPower - weakestPower) / Math.max(weakestPower, 1) <= 0.1) {
          assignedTeam = metaChars.slice(0, 5);
        }
      }
    }

    const power = teamPower(assignedTeam);
    const confidence = getConfidence(power, assignedTeam);

    // Generate reason text
    let reason: string;
    if (confidence === "strong") {
      const surplus = Math.round((power - teamPower(sortedEligible.slice(0, 5))) / 1000);
      reason = surplus > 0
        ? `Your strongest viable team — ${surplus}k above minimum`
        : `Strong team with good margin above requirements`;
    } else if (confidence === "shouldWork") {
      reason = `Meets requirements with moderate margin — should clear comfortably`;
    } else {
      reason = `Barely meets minimum requirements — may struggle`;
    }

    // Mark characters as used
    for (const char of assignedTeam) {
      usedCharIds.add(char.id);
    }

    assignments.set(room.id, {
      characters: assignedTeam,
      power,
      confidence,
      reason,
    });
  }

  return { assignments, unassignableRooms };
}
