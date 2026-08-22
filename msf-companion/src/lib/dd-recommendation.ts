import type { CharacterFilter, EnemyCombat, EnemyUnit } from "@/lib/dd-service";
import type { RosterCharacter } from "@/lib/dd-eligibility";

export const RECOMMENDATION_MODES = [
  "fastest-clear",
  "lowest-investment",
  "cross-mode-value",
] as const;

export type RecommendationMode = (typeof RECOMMENDATION_MODES)[number];

export interface CharacterModeEvidence {
  modes: string[];
  totalAppearances: number;
}

export type CharacterModeEvidenceMap = Record<string, CharacterModeEvidence>;

export interface RecommendedCharacter {
  character: RosterCharacter;
  reasoning: string;
}

export interface RecommendationResult {
  primaryTeam: RecommendedCharacter[];
  rosterReadiness: number;
  alternatives: RecommendedCharacter[][];
  reasoning: string;
  mode: RecommendationMode;
  modeEvidenceAvailable: boolean;
}

function traitId(t: string | { id: string }): string {
  return typeof t === "string" ? t : t.id;
}

function getCharTraits(char: RosterCharacter): string[] {
  const traits: string[] = [];
  for (const trait of char.info?.traits ?? []) traits.push(traitId(trait));
  for (const trait of char.info?.invisibleTraits ?? []) {
    traits.push(traitId(trait));
  }
  return traits;
}

function getAllEnemyUnits(combat?: EnemyCombat): EnemyUnit[] {
  const units: EnemyUnit[] = [];
  for (const wave of combat?.left?.waves ?? []) units.push(...wave.units);
  for (const wave of combat?.right?.waves ?? []) units.push(...wave.units);
  return units;
}

function getTotalEnemyPower(enemies: EnemyUnit[]): number {
  return enemies.reduce((total, enemy) => {
    if (enemy.stats?.power) return total + enemy.stats.power;
    return total + (enemy.level ?? 1) * (enemy.gearTier ?? 1) * 100;
  }, 0);
}

function getCharPower(char: RosterCharacter): number {
  return char.power ?? (char.level ?? 1) * (char.gearTier ?? 1) * 100;
}

const MODE_LABELS: Record<string, string> = {
  raids: "Raids",
  arena: "Arena",
  war: "War",
  crucible: "Crucible",
  tower: "Tower",
  blitz: "Blitz",
};

function formatModes(modes: string[]): string {
  return modes.map((mode) => MODE_LABELS[mode] ?? mode).join(", ");
}

/**
 * Rank one already-compliant character for the selected planning goal.
 * This never treats shared enemy traits as counter evidence: matching an
 * enemy's origin, location, or alignment says nothing about matchup quality.
 */
function scoreCharacter(
  char: RosterCharacter,
  enemies: EnemyUnit[],
  totalEnemyPower: number,
  mode: RecommendationMode,
  modeEvidence: CharacterModeEvidenceMap,
  maxModeAppearances: number,
): { score: number; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];
  const charTraits = getCharTraits(char);
  const charPower = getCharPower(char);

  // Combat strength is readiness evidence, not observed clear evidence.
  const maxPowerScore = mode === "fastest-clear" ? 55 : 35;
  if (totalEnemyPower > 0) {
    const powerRatio =
      charPower / (totalEnemyPower / Math.max(enemies.length, 1));
    score += Math.min(maxPowerScore, powerRatio * 20);
    if (powerRatio > 1.5) {
      reasons.push("High available combat power for this node");
    }
  } else {
    score += Math.min(maxPowerScore, charPower / 20_000);
  }

  const evidence = modeEvidence[char.id];
  if (mode === "cross-mode-value" && evidence) {
    const breadthScore = Math.min(45, evidence.modes.length * 9);
    const usageScore =
      maxModeAppearances > 0
        ? (Math.log1p(evidence.totalAppearances) /
            Math.log1p(maxModeAppearances)) *
          20
        : 0;
    score += breadthScore + usageScore;
    reasons.unshift(
      `Observed across ${evidence.modes.length} current mode dataset${evidence.modes.length === 1 ? "" : "s"} (${formatModes(evidence.modes)}); usage is not a win guarantee`,
    );
  } else if (mode === "lowest-investment") {
    // All candidates at this point already satisfy the node. Their additional
    // entry investment is therefore zero; existing power is the tie-breaker.
    score += 25;
    reasons.unshift("Already meets every node entry requirement");
  }

  const isProtector = charTraits.includes("Protector");
  const isSupport = charTraits.includes("Support");
  const isController = charTraits.includes("Controller");
  const isDamage =
    charTraits.includes("Brawler") || charTraits.includes("Blaster");

  if (isProtector) {
    score += 10;
    reasons.push("Adds protection to the available team");
  }
  if (isSupport) {
    score += 12;
    reasons.push("Adds sustain or buffs to the available team");
  }
  if (isController) {
    score += 12;
    reasons.push("Adds crowd-control potential to the available team");
  }
  if (isDamage) {
    score += mode === "fastest-clear" ? 12 : 6;
    reasons.push("Adds damage pressure to the available team");
  }

  // Existing build is a deterministic tie-breaker, not an instruction to
  // spend additional resources.
  score += Math.min(10, (char.gearTier ?? 0) / 2);
  score += Math.min(4, (char.activeYellow ?? 0) / 2);
  score += Math.min(4, (char.activeRed ?? 0) / 2);

  if (reasons.length === 0) {
    reasons.push("Meets every node entry requirement");
  }

  return { score, reasons };
}

function matchesCharacterFilter(
  char: RosterCharacter,
  filters?: CharacterFilter[],
): boolean {
  if (!filters || filters.length === 0) return true;

  const charTraits = getCharTraits(char);

  for (const filter of filters) {
    let matches = true;

    if (filter.allTraits?.length) {
      for (const trait of filter.allTraits) {
        if (!charTraits.includes(traitId(trait))) {
          matches = false;
          break;
        }
      }
    }

    if (matches && filter.anyTraits?.length) {
      matches = filter.anyTraits.some((trait) =>
        charTraits.includes(traitId(trait)),
      );
    }

    if (matches && filter.exceptTraits?.length) {
      for (const trait of filter.exceptTraits) {
        if (charTraits.includes(traitId(trait))) {
          matches = false;
          break;
        }
      }
    }

    if (matches && filter.anyCharacters?.length) {
      matches = filter.anyCharacters.includes(char.id);
    }

    if (matches) return true;
  }

  return false;
}

export function generateRecommendation(
  compliantCharacters: RosterCharacter[],
  nodeCombat: EnemyCombat | undefined,
  maxCharacters: number,
  characterFilters?: CharacterFilter[],
  requiredCharacterIds: string[] = [],
  mode: RecommendationMode = "fastest-clear",
  modeEvidence: CharacterModeEvidenceMap = {},
): RecommendationResult {
  const enemies = getAllEnemyUnits(nodeCombat);
  const totalEnemyPower = getTotalEnemyPower(enemies);
  const maxModeAppearances = Math.max(
    0,
    ...Object.values(modeEvidence).map((entry) => entry.totalAppearances),
  );
  const modeEvidenceAvailable = Object.keys(modeEvidence).length > 0;
  const scoringMode =
    mode === "cross-mode-value" && !modeEvidenceAvailable
      ? "fastest-clear"
      : mode;

  const scored = compliantCharacters.map((char) => {
    const { score, reasons } = scoreCharacter(
      char,
      enemies,
      totalEnemyPower,
      scoringMode,
      modeEvidence,
      maxModeAppearances,
    );
    return { char, score, reasons };
  });

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.char.id.localeCompare(b.char.id);
  });

  // Re-check the full CharacterFilter contract independently so malformed
  // upstream data cannot leak an ineligible character into a recommendation.
  const validScored: typeof scored = [];
  for (const entry of scored) {
    if (matchesCharacterFilter(entry.char, characterFilters)) {
      validScored.push(entry);
    } else {
      console.warn(
        `Data integrity violation: Character ${entry.char.id} failed CharacterFilter re-check — excluded from recommendation`,
      );
    }
  }

  // Every compliant specificCharacters entry is a team-level requirement and
  // must receive a reserved slot before optional candidates are ranked.
  const requiredIds = [...new Set(requiredCharacterIds)];
  const requiredSet = new Set(requiredIds);
  const requiredScored = requiredIds
    .map((id) => validScored.find((entry) => entry.char.id === id))
    .filter((entry): entry is (typeof validScored)[number] => entry != null)
    .slice(0, maxCharacters);
  const optionalScored = validScored.filter(
    (entry) => !requiredSet.has(entry.char.id),
  );
  const optionalSlots = Math.max(0, maxCharacters - requiredScored.length);
  const primaryScored = [
    ...requiredScored,
    ...optionalScored.slice(0, optionalSlots),
  ];

  const primaryTeam: RecommendedCharacter[] = primaryScored.map((entry) => ({
    character: entry.char,
    reasoning: entry.reasons[0] ?? "Meets every node entry requirement",
  }));

  // Roster readiness is transparent build/readiness information. It is not an
  // observed clear rate and must never be labelled as confidence.
  let rosterReadiness = 0;
  const countRatio =
    maxCharacters > 0 ? primaryScored.length / maxCharacters : 0;
  rosterReadiness += Math.min(50, countRatio * 50);

  const teamPower = primaryScored.reduce(
    (sum, entry) => sum + getCharPower(entry.char),
    0,
  );
  if (totalEnemyPower > 0) {
    rosterReadiness += Math.min(30, (teamPower / totalEnemyPower) * 20);
  }

  const teamTraits = new Set<string>();
  for (const entry of primaryScored) {
    for (const trait of getCharTraits(entry.char)) teamTraits.add(trait);
  }
  const roles = ["Protector", "Support", "Controller", "Brawler", "Blaster"];
  const roleCoverage = roles.filter((role) => teamTraits.has(role)).length;
  rosterReadiness += Math.min(20, (roleCoverage / roles.length) * 20);
  rosterReadiness = Math.round(Math.min(100, Math.max(0, rosterReadiness)));

  const alternatives: RecommendedCharacter[][] = [];
  if (optionalSlots > 0 && optionalScored.length >= optionalSlots * 2) {
    const alternative = [
      ...requiredScored,
      ...optionalScored.slice(optionalSlots, optionalSlots * 2),
    ];
    if (alternative.length > requiredScored.length) {
      alternatives.push(
        alternative.map((entry) => ({
          character: entry.char,
          reasoning: entry.reasons[0] ?? "Alternative ready candidate",
        })),
      );
    }
  }

  let reasoning = `Recommended ${primaryScored.length} of ${maxCharacters} roster-ready characters`;
  if (enemies.length > 0) reasoning += ` against ${enemies.length} enemies`;
  if (primaryScored.length < maxCharacters) {
    reasoning += `. Only ${compliantCharacters.length} compliant characters are available`;
  }

  return {
    primaryTeam,
    rosterReadiness,
    alternatives,
    reasoning,
    mode,
    modeEvidenceAvailable,
  };
}
