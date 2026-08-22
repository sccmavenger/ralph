import type {
  CharacterFilter,
  Iso8State,
  NodeRequirements,
} from "@/lib/dd-service";

// ── Types ──

export interface RosterCharacter {
  id: string;
  level?: number;
  activeYellow?: number;
  activeRed?: number;
  gearTier?: number;
  power?: number;
  iso8?: Iso8State;
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

function matchesSingleFilter(
  char: RosterCharacter,
  filter: CharacterFilter,
): boolean {
  const charTraits = getCharacterTraits(char);

  // allTraits — character must have ALL of these traits (AND logic)
  if (filter.allTraits && filter.allTraits.length > 0) {
    for (const t of filter.allTraits) {
      if (!charTraits.includes(traitId(t))) return false;
    }
  }

  // anyTraits — character must have at least ONE of these traits (OR logic)
  if (filter.anyTraits && filter.anyTraits.length > 0) {
    const hasAny = filter.anyTraits.some((t) =>
      charTraits.includes(traitId(t)),
    );
    if (!hasAny) return false;
  }

  // exceptTraits — character must have NONE of these traits (NOT logic)
  if (filter.exceptTraits && filter.exceptTraits.length > 0) {
    for (const t of filter.exceptTraits) {
      if (charTraits.includes(traitId(t))) return false;
    }
  }

  // anyCharacters is another requirement inside this filter, not an
  // alternative to its trait requirements. The MSF contract says a character
  // must satisfy every field in at least one CharacterFilter.
  if (filter.anyCharacters && filter.anyCharacters.length > 0) {
    if (!filter.anyCharacters.includes(char.id)) return false;
  }

  return true;
}

export function getActiveIso8Level(iso8: Iso8State | undefined): number {
  const active = iso8?.active?.toLowerCase();
  if (!active) return 0;

  switch (active) {
    case "striker":
      return iso8?.striker ?? 0;
    case "fortifier":
      return iso8?.fortifier ?? 0;
    case "healer":
      return iso8?.healer ?? 0;
    case "skirmisher":
      return iso8?.skirmisher ?? 0;
    case "raider":
      return iso8?.raider ?? 0;
    default:
      return 0;
  }
}

export function getRequirementTarget(
  char: RosterCharacter,
  requirements: NodeRequirements,
): CharacterFilter | null {
  const matching = (requirements.anyCharacterFilters ?? []).filter((filter) =>
    matchesSingleFilter(char, filter),
  );
  if (matching.length === 0) return null;

  // A character only needs to satisfy one filter. Choose the matching path
  // with the smallest remaining upgrade burden instead of combining the
  // strictest values from unrelated OR filters.
  return matching.sort((a, b) => {
    const burden = (filter: CharacterFilter) =>
      Math.max(0, (filter.gearTier ?? 0) - (char.gearTier ?? 0)) * 10 +
      Math.max(0, (filter.level ?? 0) - (char.level ?? 0)) +
      Math.max(0, (filter.activeYellow ?? 0) - (char.activeYellow ?? 0)) * 5 +
      Math.max(0, (filter.activeRed ?? 0) - (char.activeRed ?? 0)) * 5 +
      Math.max(
        0,
        (filter.iso8ClassLevel ?? 0) - getActiveIso8Level(char.iso8),
      ) *
        5 +
      (filter.iso8Class &&
      char.iso8?.active?.toLowerCase() !== filter.iso8Class.toLowerCase()
        ? 10
        : 0);
    return burden(a) - burden(b);
  })[0];
}

function isEligible(
  char: RosterCharacter,
  requirements: NodeRequirements,
): boolean {
  const filters = requirements.anyCharacterFilters;
  if (!filters || filters.length === 0) {
    // No filters means any character is eligible
    return true;
  }

  // OR logic across multiple CharacterFilter objects
  for (const filter of filters) {
    if (matchesSingleFilter(char, filter)) return true;
  }

  return false;
}

function isCompliant(
  char: RosterCharacter,
  requirements: NodeRequirements,
): boolean {
  const filters = requirements.anyCharacterFilters;
  if (!filters || filters.length === 0) return true;

  // Find which filter(s) this character matches for eligibility,
  // then check stat minimums from that filter
  for (const filter of filters) {
    if (!matchesSingleFilter(char, filter)) continue;

    // Check stat minimums from this filter
    if (filter.gearTier != null && (char.gearTier ?? 0) < filter.gearTier)
      continue;
    if (filter.level != null && (char.level ?? 0) < filter.level) continue;
    if (
      filter.activeYellow != null &&
      (char.activeYellow ?? 0) < filter.activeYellow
    )
      continue;
    if (filter.activeRed != null && (char.activeRed ?? 0) < filter.activeRed)
      continue;

    // ISO-8 checks
    if (filter.iso8Class != null) {
      if (char.iso8?.active?.toLowerCase() !== filter.iso8Class.toLowerCase()) {
        continue;
      }
    }
    if (filter.iso8ClassLevel != null) {
      if (getActiveIso8Level(char.iso8) < filter.iso8ClassLevel) continue;
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
