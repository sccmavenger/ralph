/**
 * Team analysis utilities for the Team Builder feature.
 * Provides trait overlap, synergy detection, stats calculation,
 * meta comparison, and character suggestion functionality.
 */

// --- Shared types ---

export interface TeamCharacter {
  id: string;
  name: string;
  portrait: string | null;
  power: number;
  level: number;
  gearTier: number;
  yellowStars: number;
  redStars: number;
  traits: string[];
  abilityKit: {
    basic: AbilityInfo | null;
    special: AbilityInfo | null;
    ultimate: AbilityInfo | null;
    passive: AbilityInfo | null;
  };
  stats: CharacterStats;
}

export interface AbilityInfo {
  id?: string;
  level?: number;
  maxLevel?: number;
  description?: string;
}

export interface CharacterStats {
  health: number;
  damage: number;
  armor: number;
  focus: number;
  resist: number;
  speed: number;
  critChance: number;
  critDamageBonus: number;
  dodgeChance: number;
  blockChance: number;
  blockAmount: number;
  accuracy: number;
}

// --- Trait Overlap Analysis (US-052) ---

type TraitCategory = "origin" | "role" | "affinity" | "team";

const ORIGIN_TRAITS = new Set(["Bio", "Mutant", "Skill", "Mystic", "Tech", "Cosmic"]);
const ROLE_TRAITS = new Set(["Brawler", "Blaster", "Controller", "Protector", "Support"]);
const AFFINITY_TRAITS = new Set(["Hero", "Villain"]);

export interface SharedTrait {
  trait: string;
  category: TraitCategory;
  count: number;
  characterIds: string[];
}

export interface TraitOverlapResult {
  sharedTraits: SharedTrait[];
}

function categorize(trait: string): TraitCategory {
  if (ORIGIN_TRAITS.has(trait)) return "origin";
  if (ROLE_TRAITS.has(trait)) return "role";
  if (AFFINITY_TRAITS.has(trait)) return "affinity";
  return "team";
}

export function analyzeTraitOverlap(characters: TeamCharacter[]): TraitOverlapResult {
  const traitMap = new Map<string, string[]>();

  for (const char of characters) {
    for (const trait of char.traits) {
      const existing = traitMap.get(trait);
      if (existing) {
        existing.push(char.id);
      } else {
        traitMap.set(trait, [char.id]);
      }
    }
  }

  const sharedTraits: SharedTrait[] = [];
  for (const [trait, characterIds] of traitMap) {
    if (characterIds.length >= 2) {
      sharedTraits.push({
        trait,
        category: categorize(trait),
        count: characterIds.length,
        characterIds,
      });
    }
  }

  // Sort by count descending
  sharedTraits.sort((a, b) => b.count - a.count);

  return { sharedTraits };
}

// --- Passive Synergy Detection (US-053) ---

const MODE_PATTERNS: { pattern: RegExp; mode: string }[] = [
  { pattern: /\bIn War\b/i, mode: "war" },
  { pattern: /\bDuring Alliance War\b/i, mode: "war" },
  { pattern: /\bIn Crucible\b/i, mode: "crucible" },
  { pattern: /\bDuring Crucible\b/i, mode: "crucible" },
  { pattern: /\bIn Raids?\b/i, mode: "raids" },
  { pattern: /\bIn Arena\b/i, mode: "arena" },
  { pattern: /\bIn Blitz\b/i, mode: "blitz" },
  { pattern: /\bIn Tower\b/i, mode: "tower" },
];

export interface PassiveSynergy {
  sourceCharacterId: string;
  sourceCharacterName: string;
  abilityName: string;
  description: string;
  targetTrait: string;
  isActive: boolean;
  beneficiaryCount: number;
  applicableMode: string | null;
}

export interface PassiveSynergyResult {
  synergies: PassiveSynergy[];
}

function detectApplicableMode(text: string): string | null {
  for (const { pattern, mode } of MODE_PATTERNS) {
    if (pattern.test(text)) return mode;
  }
  return null;
}

/**
 * Convert a camelCase/PascalCase trait ID into the display forms used in passive descriptions.
 * e.g. "HeroesForHire" -> ["heroes for hire", "heroesforhire"]
 *      "SpiderVerse" -> ["spider verse", "spiderverse", "spider-verse"]
 *      "XForce" -> ["x force", "xforce", "x-force"]
 *      "Shield" -> ["shield", "s.h.i.e.l.d."]
 */
function traitIdToDisplayForms(traitId: string): string[] {
  const forms: string[] = [];
  // Split on camelCase boundaries: "HeroesForHire" -> ["Heroes", "For", "Hire"]
  const words = traitId.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2");
  const spaced = words.toLowerCase();
  forms.push(spaced);                          // "heroes for hire"
  forms.push(traitId.toLowerCase());           // "heroesforhire"
  // Hyphenated form: "x-force", "spider-verse"
  const hyphenated = words.toLowerCase().replace(/ /g, "-");
  if (hyphenated !== spaced) forms.push(hyphenated);
  // Special cases for MSF naming
  const lc = traitId.toLowerCase();
  if (lc === "shield") forms.push("s.h.i.e.l.d.", "s.h.i.e.l.d");
  if (lc === "yourewelcome") forms.push("you're welcome");
  return forms;
}

export function detectPassiveSynergies(
  characters: TeamCharacter[],
  selectedMode?: string | null
): PassiveSynergyResult {
  const teamTraits = new Set<string>();
  const traitOwners = new Map<string, string[]>();

  for (const char of characters) {
    for (const trait of char.traits) {
      teamTraits.add(trait);
      const lowerTrait = trait.toLowerCase();
      const owners = traitOwners.get(lowerTrait);
      if (owners) {
        owners.push(char.id);
      } else {
        traitOwners.set(lowerTrait, [char.id]);
      }
    }
  }

  // Build a lookup: for each display form of each trait, map to the canonical trait ID
  const displayFormToTraitId = new Map<string, string>();
  for (const trait of teamTraits) {
    for (const form of traitIdToDisplayForms(trait)) {
      displayFormToTraitId.set(form, trait);
    }
  }

  const synergies: PassiveSynergy[] = [];

  for (const char of characters) {
    const passive = char.abilityKit.passive;
    if (!passive?.description) continue;

    const description = passive.description;
    const descLower = description.toLowerCase();
    const applicableMode = detectApplicableMode(description);

    // Check which team traits are referenced in this passive description
    const matchedTraits = new Set<string>();
    for (const [form, traitId] of displayFormToTraitId) {
      // Skip generic/non-team traits that would produce false positives
      if (SKIP_TRAITS.has(traitId.toLowerCase())) continue;
      if (descLower.includes(form)) {
        matchedTraits.add(traitId);
      }
    }

    for (const traitId of matchedTraits) {
      const lowerTrait = traitId.toLowerCase();
      const matchingOwners = traitOwners.get(lowerTrait) ?? [];
      const beneficiaryCount = matchingOwners.length;
      const isTraitActive = beneficiaryCount > 0;

      let isActive = isTraitActive;
      if (applicableMode && selectedMode && selectedMode !== "all") {
        if (applicableMode !== selectedMode) {
          isActive = false;
        }
      }

      synergies.push({
        sourceCharacterId: char.id,
        sourceCharacterName: char.name,
        abilityName: passive.id ?? "Passive",
        description: description.split(".")[0] + ".",
        targetTrait: traitId,
        isActive,
        beneficiaryCount,
        applicableMode,
      });
    }
  }

  return { synergies };
}

// Traits to skip in synergy detection (too generic / not team-related)
const SKIP_TRAITS = new Set([
  "hero", "villain", "bio", "mutant", "skill", "mystic", "tech", "cosmic",
  "global", "city", "brawler", "blaster", "controller", "protector", "support",
  "minion",
]);

// --- Combined Team Stats (US-054) ---

const TOTAL_STATS = ["health", "damage", "armor", "focus", "resist", "speed"] as const;
const PERCENT_STATS = ["critChance", "critDamageBonus", "dodgeChance", "blockChance", "accuracy"] as const;

export interface TeamStatsResult {
  total: CharacterStats;
  average: CharacterStats;
  individual: { characterId: string; name: string; stats: CharacterStats }[];
}

export function calculateTeamStats(characters: TeamCharacter[]): TeamStatsResult {
  const count = characters.length || 1;

  const total: CharacterStats = {
    health: 0, damage: 0, armor: 0, focus: 0, resist: 0, speed: 0,
    critChance: 0, critDamageBonus: 0, dodgeChance: 0, blockChance: 0,
    blockAmount: 0, accuracy: 0,
  };

  for (const char of characters) {
    for (const stat of TOTAL_STATS) {
      total[stat] += char.stats[stat] ?? 0;
    }
    for (const stat of PERCENT_STATS) {
      total[stat] += char.stats[stat] ?? 0;
    }
    total.blockAmount += char.stats.blockAmount ?? 0;
  }

  const average: CharacterStats = { ...total };
  // Total stats: sum is total, average is total/count
  // Percent stats: average makes more sense
  for (const stat of TOTAL_STATS) {
    average[stat] = Math.round(total[stat] / count);
  }
  for (const stat of PERCENT_STATS) {
    average[stat] = total[stat] / count;
  }
  average.blockAmount = total.blockAmount / count;

  const individual = characters.map((c) => ({
    characterId: c.id,
    name: c.name,
    stats: { ...c.stats },
  }));

  return { total, average, individual };
}

// --- Meta Comparison (US-055) ---

export interface MetaModeData {
  mode: string;
  teams: { squad: string[]; total: number }[];
}

export interface MetaMatch {
  mode: string;
  matchedIds: string[];
  total: number;
  metaSquad: string[];
}

export interface MetaComparisonResult {
  exactMatch: { mode: string; total: number } | null;
  partialMatches: MetaMatch[];
  popularityRank: "Meta Team" | "Common Variant" | "Uncommon" | "Unique";
}

function arraysMatchUnordered(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sorted1 = [...a].sort();
  const sorted2 = [...b].sort();
  return sorted1.every((v, i) => v === sorted2[i]);
}

function countOverlap(team: string[], squad: string[]): string[] {
  const squadSet = new Set(squad);
  return team.filter((id) => squadSet.has(id));
}

export function compareToMeta(
  teamIds: string[],
  metaData: MetaModeData[],
  selectedMode?: string | null
): MetaComparisonResult {
  const modesData = selectedMode && selectedMode !== "all"
    ? metaData.filter((m) => m.mode === selectedMode)
    : metaData;

  let exactMatch: { mode: string; total: number } | null = null;
  const partialMatches: MetaMatch[] = [];

  for (const modeEntry of modesData) {
    for (const team of modeEntry.teams) {
      if (!team.squad || team.squad.length !== 5) continue;

      if (arraysMatchUnordered(teamIds, team.squad)) {
        if (!exactMatch || team.total > exactMatch.total) {
          exactMatch = { mode: modeEntry.mode, total: team.total };
        }
      } else {
        const overlap = countOverlap(teamIds, team.squad);
        if (overlap.length >= 3) {
          partialMatches.push({
            mode: modeEntry.mode,
            matchedIds: overlap,
            total: team.total,
            metaSquad: team.squad,
          });
        }
      }
    }
  }

  // Sort partial matches by overlap count desc, then total desc
  partialMatches.sort((a, b) => {
    if (b.matchedIds.length !== a.matchedIds.length) {
      return b.matchedIds.length - a.matchedIds.length;
    }
    return b.total - a.total;
  });

  // Limit to top 10 partial matches
  const topPartials = partialMatches.slice(0, 10);

  // Determine popularity rank
  let popularityRank: MetaComparisonResult["popularityRank"] = "Unique";
  if (exactMatch) {
    popularityRank = exactMatch.total >= 100 ? "Meta Team" : "Common Variant";
  } else if (topPartials.some((m) => m.matchedIds.length >= 4)) {
    popularityRank = "Common Variant";
  } else if (topPartials.length > 0) {
    popularityRank = "Uncommon";
  }

  return { exactMatch, partialMatches: topPartials, popularityRank };
}

// --- Team Suggestion Engine (US-056) ---

export interface CharacterSuggestion {
  characterId: string;
  name: string;
  portrait: string | null;
  score: number;
  reasons: string[];
}

export function suggestCharacters(
  selectedIds: string[],
  roster: TeamCharacter[],
  metaData: MetaModeData[],
  selectedMode?: string | null
): CharacterSuggestion[] {
  const selectedSet = new Set(selectedIds);
  const selectedChars = roster.filter((c) => selectedSet.has(c.id));
  const candidates = roster.filter((c) => !selectedSet.has(c.id));

  // Collect selected team traits
  const teamTraitCounts = new Map<string, number>();
  for (const char of selectedChars) {
    for (const trait of char.traits) {
      teamTraitCounts.set(trait, (teamTraitCounts.get(trait) ?? 0) + 1);
    }
  }

  // Build meta co-occurrence map for the selected mode
  const modesData = selectedMode && selectedMode !== "all"
    ? metaData.filter((m) => m.mode === selectedMode)
    : metaData;

  const coOccurrence = new Map<string, number>();
  for (const modeEntry of modesData) {
    for (const team of modeEntry.teams) {
      if (!team.squad) continue;
      const squadSet = new Set(team.squad);
      const overlap = selectedIds.filter((id) => squadSet.has(id));
      if (overlap.length === 0) continue;
      // Characters in this squad that aren't already selected
      for (const charId of team.squad) {
        if (!selectedSet.has(charId)) {
          coOccurrence.set(charId, (coOccurrence.get(charId) ?? 0) + team.total);
        }
      }
    }
  }

  const scored = candidates.map((candidate) => {
    let score = 0;
    const reasons: string[] = [];

    // (a) Shared traits
    let sharedTraitCount = 0;
    const sharedTraitNames: string[] = [];
    for (const trait of candidate.traits) {
      const teamCount = teamTraitCounts.get(trait);
      if (teamCount && teamCount > 0) {
        sharedTraitCount++;
        sharedTraitNames.push(trait);
        score += teamCount; // Weight by how many team members share it
      }
    }
    if (sharedTraitCount > 0) {
      reasons.push(`Shares ${sharedTraitNames.slice(0, 3).join(", ")} trait${sharedTraitCount > 1 ? "s" : ""} with ${sharedTraitCount} team member${sharedTraitCount > 1 ? "s" : ""}`);
    }

    // (b) Passive synergies (simplified — check if passive mentions team traits)
    const passive = candidate.abilityKit.passive;
    if (passive?.description) {
      const descLower = passive.description.toLowerCase();
      const matchingRefs: string[] = [];
      for (const trait of teamTraitCounts.keys()) {
        if (SKIP_TRAITS.has(trait.toLowerCase())) continue;
        for (const form of traitIdToDisplayForms(trait)) {
          if (descLower.includes(form)) {
            matchingRefs.push(trait);
            break;
          }
        }
      }
      if (matchingRefs.length > 0) {
        const modeLabel = detectApplicableMode(passive.description);
        score += matchingRefs.length * 2;
        const modeStr = modeLabel ? ` in ${modeLabel.charAt(0).toUpperCase() + modeLabel.slice(1)}` : "";
        reasons.push(`Passive buffs ${matchingRefs.join(", ")} allies${modeStr}`);
      }
    }

    // (c) Meta co-occurrence
    const metaCount = coOccurrence.get(candidate.id) ?? 0;
    if (metaCount > 0) {
      score += Math.log10(metaCount + 1) * 3; // Log scale so huge counts don't dominate
      const modeLabel = selectedMode && selectedMode !== "all" ? ` ${selectedMode}` : "";
      reasons.push(`Appears in ${metaCount.toLocaleString()}${modeLabel} teams with your picks`);
    }

    return {
      characterId: candidate.id,
      name: candidate.name,
      portrait: candidate.portrait,
      score,
      reasons,
    };
  });

  // Sort by score descending, return top 10
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, 10);
}
