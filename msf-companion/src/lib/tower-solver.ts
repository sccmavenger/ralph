import { Character, RoomRequirements } from "./tower-readiness";

export interface RoomForSolver {
  id: string;
  name: string;
  requirements: RoomRequirements;
  /** Minimum characters required to clear this room (defaults to 5). */
  minCharacters?: number;
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
  /**
   * True when no eligible subset met the configured safety margin and the
   * solver fell back to the strongest available team. UI should surface a
   * warning when this is set.
   */
  marginFallback?: boolean;
}

export interface SolverResult {
  assignments: Map<string, TeamAssignment>;
  unassignableRooms: string[];
}

/**
 * Default safety margin: a team is considered safe when its total power is
 * at least 1.10x the real opponent power.
 */
export const SAFETY_MARGIN_DEFAULT = 1.1;

export interface SolverOptions {
  /** Real opponent power per room id (from /api/tower/solve opponentPowers). */
  opponentPowers?: Map<string, number>;
  /** Multiplier applied to opponent power when picking a team. Defaults to SAFETY_MARGIN_DEFAULT. */
  safetyMargin?: number;
}

/**
 * Check if a character meets a room's requirements.
 * Supports both flat (traits/minGearTier/etc) and structured (filters) requirement shapes.
 */
function meetsRequirements(char: Character, req: RoomRequirements): boolean {
  if (req.filters && req.filters.length > 0) {
    const charTraits = new Set(char.traits.map((t) => t.toLowerCase()));
    return req.filters.some((f) => {
      if (f.allTraits.length > 0) {
        for (const t of f.allTraits) {
          if (!charTraits.has(t.toLowerCase())) return false;
        }
      }
      if (f.anyTraits.length > 0) {
        if (!f.anyTraits.some((t) => charTraits.has(t.toLowerCase()))) return false;
      }
      if (f.anyCharacters.length > 0 && !f.anyCharacters.includes(char.id)) return false;
      if (f.gearTier > 0 && char.gearTier < f.gearTier) return false;
      if (f.minStars > 0 && char.stars < f.minStars) return false;
      if (f.minLevel > 0 && char.level < f.minLevel) return false;
      return true;
    });
  }

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
 * Legacy confidence heuristic used when no real opponent power is available
 * (e.g. enemy fetch failed). Estimates baseline from the weakest eligible.
 */
function getConfidence(
  assignedPower: number,
  roomChars: Character[]
): "strong" | "shouldWork" | "risky" {
  const minCharPower = Math.min(...roomChars.map((c) => c.power));
  const baselineEstimate = minCharPower * 5;

  const margin = (assignedPower - baselineEstimate) / Math.max(baselineEstimate, 1);

  if (margin >= 0.2) return "strong";
  if (margin >= 0) return "shouldWork";
  return "risky";
}

/**
 * Confidence vs the real opponent power. US-004 will expand this into a
 * four-state scale (incl. likelyLoss) and expose marginPct on results.
 */
function getConfidenceVsOpponent(
  teamTotal: number,
  opponentPower: number
): "strong" | "shouldWork" | "risky" {
  if (opponentPower <= 0) return "shouldWork";
  const ratio = teamTotal / opponentPower;
  if (ratio >= 1.3) return "strong";
  if (ratio >= 1.1) return "shouldWork";
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
 *
 * When `opponentPowers` is provided (US-003), rooms are processed in
 * descending opponent-power order so scarce strong characters are reserved
 * for the hardest cells. Per room, the smallest ascending-power subset whose
 * summed power meets `opponentPower * safetyMargin` is selected; if none
 * qualifies, the strongest available team is picked and tagged with
 * `marginFallback: true`.
 *
 * When no opponent power is known for a room, the solver falls back to the
 * legacy "weakest viable team" heuristic for that room only.
 */
export function solveTowerAllocation(
  rooms: RoomForSolver[],
  roster: Character[],
  metaTeams: MetaTeam[],
  clearedRooms?: string[],
  options?: SolverOptions
): SolverResult {
  const assignments = new Map<string, TeamAssignment>();
  const unassignableRooms: string[] = [];
  const usedCharIds = new Set<string>();
  const clearedSet = new Set(clearedRooms || []);
  const opponentPowers = options?.opponentPowers;
  const safetyMargin = options?.safetyMargin ?? SAFETY_MARGIN_DEFAULT;

  // Filter out cleared rooms
  const activeRooms = rooms.filter((r) => !clearedSet.has(r.id));

  // Ordering: rooms with a known opponent power come first, sorted descending
  // by that power (hardest cell handled first so it gets first pick of the
  // roster). Rooms without an opponent power fall back to the legacy
  // requirement-difficulty heuristic and are processed afterward.
  const requirementDifficulty = (r: RoomForSolver) =>
    r.requirements.minGearTier * 10 + r.requirements.minStars * 5 + r.requirements.minLevel;

  const withOpp: RoomForSolver[] = [];
  const withoutOpp: RoomForSolver[] = [];
  for (const r of activeRooms) {
    const op = opponentPowers?.get(r.id);
    if (typeof op === "number" && op > 0) withOpp.push(r);
    else withoutOpp.push(r);
  }
  withOpp.sort(
    (a, b) => (opponentPowers!.get(b.id) ?? 0) - (opponentPowers!.get(a.id) ?? 0)
  );
  withoutOpp.sort((a, b) => requirementDifficulty(b) - requirementDifficulty(a));
  const sortedRooms = [...withOpp, ...withoutOpp];

  for (const room of sortedRooms) {
    const teamSize = room.minCharacters ?? 5;
    const eligible = roster.filter(
      (char) => !usedCharIds.has(char.id) && meetsRequirements(char, room.requirements)
    );

    if (eligible.length < teamSize) {
      unassignableRooms.push(room.id);
      continue;
    }

    const opponentPower = opponentPowers?.get(room.id);
    const hasOpponentPower = typeof opponentPower === "number" && opponentPower > 0;

    if (hasOpponentPower) {
      // Margin-aware selection. Start with the weakest teamSize chars
      // (ascending) and, if the sum doesn't meet target, swap out the weakest
      // for the next stronger character until we hit target or exhaust the
      // pool. This realizes "smallest contiguous prefix that meets margin".
      const ascending = [...eligible].sort((a, b) => a.power - b.power);
      const target = opponentPower * safetyMargin;

      let chosen: Character[] | null = null;
      let chosenSum = 0;
      const window = ascending.slice(0, teamSize);
      let windowSum = teamPower(window);
      if (windowSum >= target) {
        chosen = window;
        chosenSum = windowSum;
      } else {
        let nextIdx = teamSize;
        while (nextIdx < ascending.length) {
          const dropped = window.shift()!;
          windowSum -= dropped.power;
          const added = ascending[nextIdx++];
          window.push(added);
          windowSum += added.power;
          if (windowSum >= target) {
            chosen = [...window];
            chosenSum = windowSum;
            break;
          }
        }
      }

      let assignedTeam: Character[];
      let marginFallback = false;
      if (chosen) {
        assignedTeam = chosen;
      } else {
        // No subset meets the margin — fall back to strongest available.
        const descending = [...eligible].sort((a, b) => b.power - a.power);
        assignedTeam = descending.slice(0, teamSize);
        chosenSum = teamPower(assignedTeam);
        marginFallback = true;
      }

      const power = chosenSum;
      const confidence = getConfidenceVsOpponent(power, opponentPower);
      const marginPct = Math.round((power / opponentPower - 1) * 100);
      let reason: string;
      if (marginFallback) {
        reason = `No team meets the ${safetyMargin.toFixed(2)}x safety margin — strongest available shown (~${marginPct}% vs opponent).`;
      } else if (confidence === "strong") {
        reason = `Comfortable margin: your team is ~${marginPct}% stronger than the opponent.`;
      } else if (confidence === "shouldWork") {
        reason = `Meets the ${safetyMargin.toFixed(2)}x safety margin (~${marginPct}% over opponent).`;
      } else {
        reason = `Tight margin (~${marginPct}% over opponent) — may struggle.`;
      }

      for (const char of assignedTeam) usedCharIds.add(char.id);
      assignments.set(room.id, {
        characters: assignedTeam,
        power,
        confidence,
        reason,
        marginFallback,
      });
      continue;
    }

    // Legacy path: no opponent power known. Weakest viable + meta-team check.
    const sortedEligible = [...eligible].sort((a, b) => a.power - b.power);
    let assignedTeam = sortedEligible.slice(0, teamSize);

    const weakestPower = teamPower(assignedTeam);
    const metaMatch = matchesMetaTeam(
      eligible.map((c) => c.id),
      metaTeams
    );

    if (metaMatch) {
      const metaChars = eligible.filter((c) => metaMatch.squad.includes(c.id));
      if (metaChars.length >= teamSize) {
        const metaPower = teamPower(metaChars.slice(0, teamSize));
        if (Math.abs(metaPower - weakestPower) / Math.max(weakestPower, 1) <= 0.1) {
          assignedTeam = metaChars.slice(0, teamSize);
        }
      }
    }

    const power = teamPower(assignedTeam);
    const confidence = getConfidence(power, assignedTeam);

    let reason: string;
    if (confidence === "strong") {
      const surplus = Math.round((power - teamPower(sortedEligible.slice(0, teamSize))) / 1000);
      reason = surplus > 0
        ? `Your strongest viable team — ${surplus}k above minimum`
        : `Strong team with good margin above requirements`;
    } else if (confidence === "shouldWork") {
      reason = `Meets requirements with moderate margin — should clear comfortably`;
    } else {
      reason = `Barely meets minimum requirements — may struggle`;
    }

    for (const char of assignedTeam) usedCharIds.add(char.id);
    assignments.set(room.id, {
      characters: assignedTeam,
      power,
      confidence,
      reason,
    });
  }

  return { assignments, unassignableRooms };
}
