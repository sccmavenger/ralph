import type { CharacterFilter, NodeRequirements } from "@/lib/dd-service";

// ── Types ──

export interface RosterCharacter {
  id: string;
  level?: number;
  activeYellow?: number;
  activeRed?: number;
  gearTier?: number;
  power?: number;
  iso8?: { active?: string; level?: number; pips?: number };
  info?: {
    id?: string;
    name?: string;
    portrait?: string;
    traits?: (string | { id: string })[];
    invisibleTraits?: (string | { id: string })[];
  };
}

export interface EligibilityResult {
  eligible: RosterCharacter[];
  compliant: RosterCharacter[];
  maxCharacters: number;
  minCharacters: number;
}

// ── Helpers ──

function traitId(t: string | { id: string }): string {
  return typeof t === "string" ? t : t.id;
}

function getCharacterTraits(char: RosterCharacter): string[] {
  const traits: string[] = [];
  if (char.info?.traits) {
    for (const t of char.info.traits) traits.push(traitId(t));
  }
  if (char.info?.invisibleTraits) {
    for (const t of char.info.invisibleTraits) traits.push(traitId(t));
  }
  return traits;
}

function matchesSingleFilter(char: RosterCharacter, filter: CharacterFilter): boolean {
  const charTraits = getCharacterTraits(char);

  // allTraits — character must have ALL of these traits (AND logic)
  if (filter.allTraits && filter.allTraits.length > 0) {
    for (const t of filter.allTraits) {
      if (!charTraits.includes(traitId(t))) return false;
    }
  }

  // anyTraits — character must have at least ONE of these traits (OR logic)
  if (filter.anyTraits && filter.anyTraits.length > 0) {
    const hasAny = filter.anyTraits.some((t) => charTraits.includes(traitId(t)));
    if (!hasAny) return false;
  }

  // exceptTraits — character must have NONE of these traits (NOT logic)
  if (filter.exceptTraits && filter.exceptTraits.length > 0) {
    for (const t of filter.exceptTraits) {
      if (charTraits.includes(traitId(t))) return false;
    }
  }

  // anyCharacters — character ID must be in this list
  if (filter.anyCharacters && filter.anyCharacters.length > 0) {
    // If anyCharacters is present alongside trait filters, it's OR with the trait match
    // But at the single-filter level, anyCharacters is an alternative match
    // The API uses anyCharacters as "these specific characters are allowed"
    // This is handled at the top level — if traits don't match, anyCharacters can still qualify
  }

  return true;
}

function matchesFilterByCharacterId(charId: string, filter: CharacterFilter): boolean {
  if (filter.anyCharacters && filter.anyCharacters.length > 0) {
    return filter.anyCharacters.includes(charId);
  }
  return false;
}

function isEligible(char: RosterCharacter, requirements: NodeRequirements): boolean {
  const filters = requirements.anyCharacterFilters;
  if (!filters || filters.length === 0) {
    // No filters means any character is eligible
    return true;
  }

  // OR logic across multiple CharacterFilter objects
  for (const filter of filters) {
    if (matchesSingleFilter(char, filter)) return true;
    if (matchesFilterByCharacterId(char.id, filter)) return true;
  }

  return false;
}

function isCompliant(char: RosterCharacter, requirements: NodeRequirements): boolean {
  const filters = requirements.anyCharacterFilters;
  if (!filters || filters.length === 0) return true;

  // Find which filter(s) this character matches for eligibility,
  // then check stat minimums from that filter
  for (const filter of filters) {
    const traitMatch = matchesSingleFilter(char, filter);
    const idMatch = matchesFilterByCharacterId(char.id, filter);

    if (!traitMatch && !idMatch) continue;

    // Check stat minimums from this filter
    if (filter.gearTier != null && (char.gearTier ?? 0) < filter.gearTier) continue;
    if (filter.level != null && (char.level ?? 0) < filter.level) continue;
    if (filter.activeYellow != null && (char.activeYellow ?? 0) < filter.activeYellow) continue;
    if (filter.activeRed != null && (char.activeRed ?? 0) < filter.activeRed) continue;

    // ISO-8 checks
    if (filter.iso8ClassLevel != null) {
      if (!char.iso8 || !char.iso8.active) continue; // No iso8 equipped
      if ((char.iso8.level ?? 0) < filter.iso8ClassLevel) continue;
    }
    if (filter.iso8Class != null) {
      if (!char.iso8 || !char.iso8.active) continue;
      // iso8Class check — the active class must match
      // Note: iso8Class from filter might be a required class type
    }

    // Character passes all stat checks for this filter
    return true;
  }

  return false;
}

// ── Main Function ──

export function filterEligible(
  roster: RosterCharacter[],
  requirements: NodeRequirements,
): EligibilityResult {
  const eligible: RosterCharacter[] = [];
  const compliant: RosterCharacter[] = [];

  for (const char of roster) {
    if (isEligible(char, requirements)) {
      eligible.push(char);
      if (isCompliant(char, requirements)) {
        compliant.push(char);
      }
    }
  }

  return {
    eligible,
    compliant,
    maxCharacters: requirements.maxCharacters ?? 5,
    minCharacters: requirements.minCharacters ?? 1,
  };
}
