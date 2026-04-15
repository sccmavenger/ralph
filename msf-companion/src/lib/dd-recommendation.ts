import type { CharacterFilter, EnemyCombat, EnemyUnit } from "@/lib/dd-service";
import type { RosterCharacter } from "@/lib/dd-eligibility";

// ── Types ──

export interface RecommendedCharacter {
  character: RosterCharacter;
  reasoning: string;
}

export interface RecommendationResult {
  primaryTeam: RecommendedCharacter[];
  confidence: number;
  alternatives: RecommendedCharacter[][];
  reasoning: string;
}

// ── Helpers ──

function traitId(t: string | { id: string }): string {
  return typeof t === "string" ? t : t.id;
}

function getCharTraits(char: RosterCharacter): string[] {
  const traits: string[] = [];
  if (char.info?.traits) {
    for (const t of char.info.traits) traits.push(traitId(t));
  }
  if (char.info?.invisibleTraits) {
    for (const t of char.info.invisibleTraits) traits.push(traitId(t));
  }
  return traits;
}

function getAllEnemyUnits(combat?: EnemyCombat): EnemyUnit[] {
  const units: EnemyUnit[] = [];
  if (combat?.left?.waves) {
    for (const wave of combat.left.waves) {
      units.push(...wave.units);
    }
  }
  if (combat?.right?.waves) {
    for (const wave of combat.right.waves) {
      units.push(...wave.units);
    }
  }
  return units;
}

function getTotalEnemyPower(enemies: EnemyUnit[]): number {
  let total = 0;
  for (const e of enemies) {
    if (e.stats?.power) {
      total += e.stats.power;
    } else {
      // Estimate power from level and gear tier
      total += (e.level ?? 1) * (e.gearTier ?? 1) * 100;
    }
  }
  return total;
}

function getEnemyTraits(enemies: EnemyUnit[]): Map<string, number> {
  const traitCounts = new Map<string, number>();
  for (const e of enemies) {
    if (e.info?.traits) {
      for (const t of e.info.traits) {
        const id = traitId(t);
        traitCounts.set(id, (traitCounts.get(id) ?? 0) + 1);
      }
    }
  }
  return traitCounts;
}

function getCharPower(char: RosterCharacter): number {
  return char.power ?? (char.level ?? 1) * (char.gearTier ?? 1) * 100;
}

/**
 * Score a character for a node based on multiple factors.
 * Higher score = better fit.
 */
function scoreCharacter(
  char: RosterCharacter,
  enemies: EnemyUnit[],
  enemyTraitCounts: Map<string, number>,
  totalEnemyPower: number,
): { score: number; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];
  const charTraits = getCharTraits(char);
  const charPower = getCharPower(char);

  // Factor 1: Power relative to enemies (0-30 points)
  if (totalEnemyPower > 0) {
    const powerRatio = charPower / (totalEnemyPower / Math.max(enemies.length, 1));
    const powerScore = Math.min(30, powerRatio * 15);
    score += powerScore;
    if (powerRatio > 1.5) {
      reasons.push("High power relative to enemies");
    }
  }

  // Factor 2: Trait synergies with team (0-25 points)
  // Characters sharing traits with many enemies tend to have ability interactions
  let traitOverlap = 0;
  for (const trait of charTraits) {
    const count = enemyTraitCounts.get(trait) ?? 0;
    traitOverlap += count;
  }
  const traitScore = Math.min(25, traitOverlap * 3);
  score += traitScore;
  if (traitOverlap > 3) {
    reasons.push("Strong trait overlap with enemy composition");
  }

  // Factor 3: Role-based scoring (0-20 points)
  const isProtector = charTraits.includes("Protector");
  const isSupport = charTraits.includes("Support");
  const isController = charTraits.includes("Controller");
  const isBrawler = charTraits.includes("Brawler");
  const isBlaster = charTraits.includes("Blaster");

  if (isProtector) {
    score += 15;
    reasons.push("Provides team protection (Protector role)");
  }
  if (isSupport) {
    score += 18;
    reasons.push("Provides healing/buffs (Support role)");
  }
  if (isController) {
    score += 12;
    reasons.push("Provides crowd control (Controller role)");
  }
  if (isBrawler || isBlaster) {
    score += 10;
    reasons.push("High damage output");
  }

  // Factor 4: Gear tier bonus (0-15 points)
  const gearTier = char.gearTier ?? 0;
  const gearScore = Math.min(15, gearTier);
  score += gearScore;

  // Factor 5: Star level bonus (0-10 points)
  const stars = char.activeYellow ?? 0;
  const redStars = char.activeRed ?? 0;
  score += Math.min(5, stars);
  score += Math.min(5, redStars);

  if (reasons.length === 0) {
    reasons.push("Meets node eligibility requirements");
  }

  return { score, reasons };
}

// ── Post-validation ──

function matchesCharacterFilter(
  char: RosterCharacter,
  filters?: CharacterFilter[],
): boolean {
  if (!filters || filters.length === 0) return true;

  const charTraits = getCharTraits(char);

  for (const filter of filters) {
    let matches = true;

    if (filter.allTraits && filter.allTraits.length > 0) {
      for (const t of filter.allTraits) {
        if (!charTraits.includes(traitId(t))) {
          matches = false;
          break;
        }
      }
    }

    if (matches && filter.anyTraits && filter.anyTraits.length > 0) {
      matches = filter.anyTraits.some((t) => charTraits.includes(traitId(t)));
    }

    if (matches && filter.exceptTraits && filter.exceptTraits.length > 0) {
      for (const t of filter.exceptTraits) {
        if (charTraits.includes(traitId(t))) {
          matches = false;
          break;
        }
      }
    }

    if (matches && filter.anyCharacters && filter.anyCharacters.length > 0) {
      if (!filter.anyCharacters.includes(char.id)) {
        // Only fail if there are no trait filters to match on
        if (!filter.allTraits?.length && !filter.anyTraits?.length) {
          matches = false;
        }
      }
    }

    if (matches) return true;
  }

  return false;
}

// ── Main Function ──

export function generateRecommendation(
  compliantCharacters: RosterCharacter[],
  nodeCombat: EnemyCombat | undefined,
  maxCharacters: number,
  characterFilters?: CharacterFilter[],
): RecommendationResult {
  const enemies = getAllEnemyUnits(nodeCombat);
  const enemyTraitCounts = getEnemyTraits(enemies);
  const totalEnemyPower = getTotalEnemyPower(enemies);

  // Score all compliant characters
  const scored = compliantCharacters.map((char) => {
    const { score, reasons } = scoreCharacter(
      char,
      enemies,
      enemyTraitCounts,
      totalEnemyPower,
    );
    return { char, score, reasons };
  });

  // Sort by score descending (deterministic: tie-break by character ID)
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.char.id.localeCompare(b.char.id);
  });

  // Select primary team
  const primaryCount = Math.min(maxCharacters, scored.length);
  const primaryScored = scored.slice(0, primaryCount);

  // Post-validation: ensure all characters pass CharacterFilter
  const validPrimary: typeof primaryScored = [];
  for (const entry of primaryScored) {
    if (matchesCharacterFilter(entry.char, characterFilters)) {
      validPrimary.push(entry);
    } else {
      console.warn(
        `Data integrity violation: Character ${entry.char.id} failed CharacterFilter re-check — excluded from recommendation`,
      );
    }
  }

  const primaryTeam: RecommendedCharacter[] = validPrimary.map((entry) => ({
    character: entry.char,
    reasoning: entry.reasons[0] ?? "Meets node requirements",
  }));

  // Calculate confidence score (0-100)
  let confidence = 0;

  // Factor 1: Character count vs required (0-40)
  const countRatio = validPrimary.length / maxCharacters;
  confidence += Math.min(40, countRatio * 40);

  // Factor 2: Team power vs enemy power (0-40)
  const teamPower = validPrimary.reduce(
    (sum, e) => sum + getCharPower(e.char),
    0,
  );
  if (totalEnemyPower > 0) {
    const powerRatio = teamPower / totalEnemyPower;
    confidence += Math.min(40, powerRatio * 20);
  } else {
    confidence += 40; // No enemies = max confidence for power
  }

  // Factor 3: Role coverage (0-20)
  const teamTraits = new Set<string>();
  for (const entry of validPrimary) {
    for (const t of getCharTraits(entry.char)) {
      teamTraits.add(t);
    }
  }
  const roles = ["Protector", "Support", "Controller", "Brawler", "Blaster"];
  const roleCoverage = roles.filter((r) => teamTraits.has(r)).length;
  confidence += Math.min(20, (roleCoverage / roles.length) * 20);

  confidence = Math.round(Math.min(100, Math.max(0, confidence)));

  // Generate alternatives if enough candidates
  const alternatives: RecommendedCharacter[][] = [];
  if (scored.length >= 2 * maxCharacters) {
    const altScored = scored.slice(primaryCount, primaryCount + maxCharacters);
    const validAlt: typeof altScored = [];
    for (const entry of altScored) {
      if (matchesCharacterFilter(entry.char, characterFilters)) {
        validAlt.push(entry);
      }
    }
    if (validAlt.length > 0) {
      alternatives.push(
        validAlt.map((entry) => ({
          character: entry.char,
          reasoning: entry.reasons[0] ?? "Alternative candidate",
        })),
      );
    }
  }

  // Generate reasoning summary
  let reasoning = `Recommended ${validPrimary.length} of ${maxCharacters} characters`;
  if (enemies.length > 0) {
    reasoning += ` against ${enemies.length} enemies`;
  }
  if (validPrimary.length < maxCharacters) {
    reasoning += `. Only ${compliantCharacters.length} compliant characters available`;
  }

  return {
    primaryTeam,
    confidence,
    alternatives,
    reasoning,
  };
}
