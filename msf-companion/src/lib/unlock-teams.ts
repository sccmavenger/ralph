/**
 * "Unlock X" required-teams selector (US-008) — PURE, no network/DB.
 *
 * Turns the per-encounter data shipped in `planner-events.ts` into the
 * blocking-teams / under-gate view rendered on the "Unlock X" detail screen:
 *
 *   • Every NON-mission encounter is one team gate ("team") — mission tiers
 *     (`missionCharacters: true`) are excluded because the game supplies that
 *     team, so they are never a roster gap.
 *   • Each team lists its required characters with current vs required gear
 *     (and stars) plus an `ok` / `under` indicator.
 *   • Prerequisite campaigns (from `event.prerequisites`) are surfaced when
 *     present and simply absent when there are none.
 *   • Characters shared across teams are resolved by the same rule, so their
 *     gear status is presented consistently (never contradictory) team-to-team.
 *
 * Everything is passed in by the caller (event + roster), so the selector is
 * deterministic and trivially unit-testable — it is the shared brain the
 * planner gaps route feeds to the UI.
 */

import type {
  NormalizedEvent,
  NormalizedEncounter,
  PrerequisiteRef,
} from "./planner-events";

/** The subset of a roster character the selector needs. */
export interface RosterEntry {
  id: string;
  name: string;
  portrait?: string;
  traits: string[];
  gearTier: number;
  stars: number;
}

/** Whether a required character currently clears its gate. */
export type GateStatus = "ok" | "under";

/** One required character within a blocking team. */
export interface RequiredCharacter {
  id: string;
  name: string;
  portrait: string;
  owned: boolean;
  currentGear: number;
  requiredGear: number;
  currentStars: number;
  requiredStars: number;
  /** `ok` when owned AND meets the gear + star gate; otherwise `under`. */
  status: GateStatus;
}

/** One blocking team — corresponds to a single non-mission encounter. */
export interface BlockingTeam {
  chapter: number;
  tier: number;
  /** How many characters the team needs (from the encounter). */
  minCharacters: number | null;
  /** Required characters resolved from the encounter's filters. */
  characters: RequiredCharacter[];
}

/** The full "Unlock X" required-teams view for one event. */
export interface UnlockTeamsView {
  /** One entry per non-mission encounter (mission tiers excluded). */
  teams: BlockingTeam[];
  /** Distinct campaigns that must be completed first (may be empty). */
  prerequisites: PrerequisiteRef[];
  /**
   * Distinct characters that are `under` the gate in at least one team,
   * deduped by id — the roster gap the commander must fix.
   */
  underGate: RequiredCharacter[];
}

/** Build a RequiredCharacter for an owned roster entry against a gate. */
function ownedRequired(
  char: RosterEntry,
  requiredGear: number,
  requiredStars: number,
): RequiredCharacter {
  const meets = char.gearTier >= requiredGear && char.stars >= requiredStars;
  return {
    id: char.id,
    name: char.name,
    portrait: char.portrait ?? "",
    owned: true,
    currentGear: char.gearTier,
    requiredGear,
    currentStars: char.stars,
    requiredStars,
    status: meets ? "ok" : "under",
  };
}

/** Build a RequiredCharacter for a named-but-unowned character. */
function unownedRequired(
  id: string,
  requiredGear: number,
  requiredStars: number,
): RequiredCharacter {
  return {
    id,
    name: id,
    portrait: "",
    owned: false,
    currentGear: 0,
    requiredGear,
    currentStars: 0,
    requiredStars,
    status: "under",
  };
}

/** Resolve one encounter (team) into its required characters. */
function resolveTeam(
  enc: NormalizedEncounter,
  rosterMap: Map<string, RosterEntry>,
  roster: RosterEntry[],
): RequiredCharacter[] {
  const chars: RequiredCharacter[] = [];
  const seen = new Set<string>();

  const add = (rc: RequiredCharacter) => {
    if (seen.has(rc.id)) return;
    seen.add(rc.id);
    chars.push(rc);
  };

  for (const f of enc.filters) {
    const requiredGear = f.minGearTier ?? 0;
    const requiredStars = f.minStars ?? 0;

    if (f.specificCharacters.length > 0) {
      // Named characters: resolve each from the roster or mark unowned.
      for (const id of f.specificCharacters) {
        const owned = rosterMap.get(id);
        add(
          owned
            ? ownedRequired(owned, requiredGear, requiredStars)
            : unownedRequired(id, requiredGear, requiredStars),
        );
      }
    } else if (f.traits.length > 0) {
      // Trait gate: the candidate pool is every roster character with the trait.
      for (const char of roster) {
        if (f.traits.some((t) => char.traits.includes(t))) {
          add(ownedRequired(char, requiredGear, requiredStars));
        }
      }
    }
    // A bare gear filter (no identity) has no nameable required characters.
  }

  return chars;
}

/**
 * Derive the "Unlock X" required-teams view from a normalized event + roster.
 * Mission-only encounters are excluded (the game supplies that team).
 */
export function selectUnlockTeams(
  event: NormalizedEvent,
  roster: RosterEntry[],
): UnlockTeamsView {
  const rosterMap = new Map(roster.map((c) => [c.id, c]));

  const teams: BlockingTeam[] = event.encounters
    .filter((enc) => !enc.missionCharacters)
    .map((enc) => ({
      chapter: enc.chapter,
      tier: enc.tier,
      minCharacters: enc.minCharacters,
      characters: resolveTeam(enc, rosterMap, roster),
    }));

  // Dedupe under-gate characters across teams by id (shared characters counted
  // once). Because status is derived from the same current gear/stars, a shared
  // character is presented consistently team-to-team.
  const underGate: RequiredCharacter[] = [];
  const seenUnder = new Set<string>();
  for (const team of teams) {
    for (const rc of team.characters) {
      if (rc.status !== "under") continue;
      if (seenUnder.has(rc.id)) continue;
      seenUnder.add(rc.id);
      underGate.push(rc);
    }
  }

  return {
    teams,
    prerequisites: event.prerequisites,
    underGate,
  };
}
