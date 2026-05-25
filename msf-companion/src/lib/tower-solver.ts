import { Character, RoomRequirements } from "./tower-readiness";
import { compositeScore, type CompositeBreakdown } from "./tower-scoring";
import { FACTION_PASSIVES, type FactionPassiveMap } from "./tower-scoring-data";

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

export type TeamConfidence = "strong" | "shouldWork" | "risky" | "likelyLoss";

export interface TeamAssignment {
  characters: Character[];
  power: number;
  confidence: TeamConfidence;
  reason: string;
  /**
   * Team power as a percentage margin over the opponent (rounded to nearest
   * integer). e.g. 18 means "team is ~18% stronger than the opponent".
   * Negative values indicate the team is weaker than the opponent.
   */
  marginPct: number;
  /**
   * True when no eligible subset met the configured safety margin and the
   * solver fell back to the strongest available team. UI should surface a
   * warning when this is set.
   */
  marginFallback?: boolean;
  /**
   * Composite-score breakdown (US-006). Populated only when the solver was
   * given ability-tag data (opponentTags + characterTags). Used by US-007
   * to render the "Why this team?" sub-score breakdown.
   */
  compositeScore?: CompositeBreakdown;
}

/**
 * Confidence thresholds for getConfidence (ratio = teamPower / opponentPower).
 * Boundary values are inclusive of the higher tier (e.g. 1.30 → "strong").
 */
export const CONFIDENCE_THRESHOLDS = {
  strong: 1.3,
  shouldWork: 1.1,
  risky: 0.95,
} as const;

export interface SolverResult {
  assignments: Map<string, TeamAssignment>;
  unassignableRooms: string[];
}

/**
 * Default safety margin: a team is considered safe when its total power is
 * at least 1.10x the real opponent power.
 */
export const SAFETY_MARGIN_DEFAULT = 1.1;

/**
 * Upper bound on the candidate pool size for composite-score re-ranking
 * (US-006). Combinations grow as C(N, teamSize) so we cap at 12 to keep the
 * worst case at C(12,5)=792 — a few hundred microseconds at most.
 */
const COMPOSITE_POOL_LIMIT = 12;

/**
 * Yield all combinations of size `k` from `arr` (lexicographic by index).
 * Iterative generator to keep memory bounded for moderate inputs.
 */
function* combinations<T>(arr: readonly T[], k: number): Generator<T[]> {
  const n = arr.length;
  if (k <= 0 || k > n) return;
  const idx = Array.from({ length: k }, (_, i) => i);
  while (true) {
    yield idx.map((i) => arr[i]);
    let i = k - 1;
    while (i >= 0 && idx[i] === n - k + i) i--;
    if (i < 0) return;
    idx[i]++;
    for (let j = i + 1; j < k; j++) idx[j] = idx[j - 1] + 1;
  }
}

export interface SolverOptions {
  /** Real opponent power per room id (from /api/tower/solve opponentPowers). */
  opponentPowers?: Map<string, number>;
  /** Multiplier applied to opponent power when picking a team. Defaults to SAFETY_MARGIN_DEFAULT. */
  safetyMargin?: number;
  /**
   * Per-room opponent ability tags (flat list across all opponent units).
   * When provided alongside {@link characterTags}, the solver re-ranks
   * candidate teams that pass the safety-margin gate by composite score
   * (US-006).
   */
  opponentTags?: Map<string, readonly string[]>;
  /**
   * Per-character ability tags for the user's roster (and opponents, if you
   * want — only roster ids are looked up). When provided alongside
   * {@link opponentTags}, enables composite-score re-ranking (US-006).
   */
  characterTags?: Readonly<Record<string, readonly string[]>>;
  /** Override the default {@link FACTION_PASSIVES} table (mostly for tests). */
  factionPassives?: FactionPassiveMap;
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
 * Honest confidence vs the real opponent power (US-004).
 *
 * Ratio = teamPower / opponentPower:
 *   >= 1.30  → strong
 *   >= 1.10  → shouldWork
 *   >= 0.95  → risky
 *   <  0.95  → likelyLoss
 *
 * @deprecated Calling with only `teamPower` (no opponent power) is a legacy
 * call shape kept for backward compatibility. It assumes opponentPower =
 * teamPower / 1.10 (always yielding the "shouldWork" tier). New callers
 * should always pass the real opponent power.
 */
export function getConfidence(teamPower: number): TeamConfidence;
export function getConfidence(teamPower: number, opponentPower: number): TeamConfidence;
export function getConfidence(teamPower: number, opponentPower?: number): TeamConfidence {
  const opp =
    typeof opponentPower === "number" && opponentPower > 0
      ? opponentPower
      : teamPower / SAFETY_MARGIN_DEFAULT;
  if (opp <= 0) return "shouldWork";
  const ratio = teamPower / opp;
  if (ratio >= CONFIDENCE_THRESHOLDS.strong) return "strong";
  if (ratio >= CONFIDENCE_THRESHOLDS.shouldWork) return "shouldWork";
  if (ratio >= CONFIDENCE_THRESHOLDS.risky) return "risky";
  return "likelyLoss";
}

/**
 * Build a one-line, margin-referencing reason string. Sign of `marginPct`
 * determines wording (stronger vs weaker).
 */
function buildMarginReason(
  confidence: TeamConfidence,
  marginPct: number,
  marginFallback: boolean,
  safetyMargin: number
): string {
  const pctAbs = Math.abs(marginPct);
  const directionStronger = marginPct >= 0;
  if (marginFallback) {
    return `No team meets the ${safetyMargin.toFixed(2)}x safety margin — strongest available shown (team is ${directionStronger ? `~${pctAbs}% stronger than` : `~${pctAbs}% weaker than`} the opponent).`;
  }
  if (confidence === "strong") {
    return `Your team is ~${pctAbs}% stronger than the opponent.`;
  }
  if (confidence === "shouldWork") {
    return `Your team is ~${pctAbs}% stronger than the opponent — meets the ${safetyMargin.toFixed(2)}x safety margin.`;
  }
  if (confidence === "risky") {
    return directionStronger
      ? `Tight margin: your team is only ~${pctAbs}% stronger than the opponent.`
      : `Risky: your team is ~${pctAbs}% weaker than the opponent.`;
  }
  // likelyLoss
  return `Likely loss: your team is ~${pctAbs}% weaker than the opponent.`;
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

      // US-006: composite-score re-ranking. Only re-rank teams that already
      // pass the safety-margin gate (so the margin floor still wins) and only
      // when ability-tag data is provided. Enumerate combinations from the
      // strongest K eligible characters to keep the candidate set bounded.
      let compositeBreakdown: CompositeBreakdown | undefined;
      if (!marginFallback && options?.characterTags) {
        const characterTags = options.characterTags;
        const opponentTagsForRoom = options.opponentTags?.get(room.id) ?? [];
        const factionPassives = options.factionPassives ?? FACTION_PASSIVES;

        const byPowerDesc = [...eligible].sort((a, b) => b.power - a.power);
        const poolSize = Math.min(byPowerDesc.length, COMPOSITE_POOL_LIMIT);
        const pool = byPowerDesc.slice(0, poolSize);
        const target = opponentPower * safetyMargin;

        const buildTags = (team: readonly Character[]) => {
          const out: Record<string, readonly string[]> = {};
          for (const c of team) out[c.id] = characterTags[c.id] ?? [];
          return out;
        };

        const initialBreakdown = compositeScore(
          assignedTeam,
          chosenSum,
          opponentPower,
          safetyMargin,
          factionPassives,
          buildTags(assignedTeam),
          opponentTagsForRoom,
        );
        let bestTeam = assignedTeam;
        let bestSum = chosenSum;
        let bestBreakdown = initialBreakdown;

        for (const combo of combinations(pool, teamSize)) {
          const sum = teamPower(combo);
          if (sum < target) continue;
          const breakdown = compositeScore(
            combo,
            sum,
            opponentPower,
            safetyMargin,
            factionPassives,
            buildTags(combo),
            opponentTagsForRoom,
          );
          // Higher composite wins; tie-break by higher raw power.
          if (
            breakdown.total > bestBreakdown.total ||
            (breakdown.total === bestBreakdown.total && sum > bestSum)
          ) {
            bestTeam = combo;
            bestSum = sum;
            bestBreakdown = breakdown;
          }
        }

        assignedTeam = bestTeam;
        chosenSum = bestSum;
        compositeBreakdown = bestBreakdown;
      }

      const power = chosenSum;
      const confidence = getConfidence(power, opponentPower);
      const marginPct = Math.round((power / opponentPower - 1) * 100);
      const reason = buildMarginReason(confidence, marginPct, marginFallback, safetyMargin);

      for (const char of assignedTeam) usedCharIds.add(char.id);
      assignments.set(room.id, {
        characters: assignedTeam,
        power,
        confidence,
        reason,
        marginPct,
        marginFallback,
        compositeScore: compositeBreakdown,
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
    // Legacy path (no real opponent power known) — use the deprecated single-arg
    // overload of getConfidence, which assumes opponentPower = power / 1.10.
    // This always returns "shouldWork" and yields marginPct ≈ 10.
    const confidence = getConfidence(power);
    const assumedOpponent = power / SAFETY_MARGIN_DEFAULT;
    const marginPct = Math.round((power / assumedOpponent - 1) * 100);

    let reason: string;
    if (confidence === "strong") {
      const surplus = Math.round((power - teamPower(sortedEligible.slice(0, teamSize))) / 1000);
      reason = surplus > 0
        ? `Your strongest viable team — ${surplus}k above minimum`
        : `Strong team with good margin above requirements`;
    } else if (confidence === "shouldWork") {
      reason = `Meets requirements with moderate margin — should clear comfortably (opponent data unavailable).`;
    } else {
      reason = `Barely meets minimum requirements — may struggle`;
    }

    for (const char of assignedTeam) usedCharIds.add(char.id);
    assignments.set(room.id, {
      characters: assignedTeam,
      power,
      confidence,
      reason,
      marginPct,
    });
  }

  return { assignments, unassignableRooms };
}
