/**
 * Curated data tables for the ability-aware tower scoring layer.
 *
 * Note on trait strings: MSF API returns trait IDs as human-readable strings
 * (e.g. "Mutant", "X-Men" — see room fixtures in
 * `src/app/api/tower/rooms/route.test.ts` and `src/lib/tower-readiness.test.ts`).
 * No canonical enum exists in `src/lib/characters` (no such directory yet).
 * The values below match the conventional in-game faction names exposed
 * through `Character.traits`. If a character's traits use a different
 * variant (e.g. "Avengers" vs "Avenger"), the scoring layer (US-002) will
 * be the place to normalize.
 */

export interface FactionPassive {
  /** Trait string that must appear on a character to count toward this passive. */
  trait: string;
  /** Minimum number of team members sharing the trait for the passive to activate. */
  minMembers: number;
  /** One-line human-readable summary used by the "Why this team?" breakdown. */
  description: string;
}

export type FactionPassiveMap = Record<string, FactionPassive>;

/**
 * Faction passives recognized by the tower scoring layer.
 *
 * Keys are stable identifiers (used internally for logging / UI breakdown);
 * `trait` is the string compared against `Character.traits`.
 *
 * Curated list — extend as more faction passives prove relevant for tower play.
 */
export const FACTION_PASSIVES: FactionPassiveMap = {
  Asgardian: {
    trait: "Asgardian",
    minMembers: 3,
    description: "Asgardian passive boosts damage and resistance when 3+ Asgardians are on the team.",
  },
  Avenger: {
    trait: "Avenger",
    minMembers: 3,
    description: "Avengers Assemble grants a chained assist when 3+ Avengers attack together.",
  },
  XMen: {
    trait: "X-Men",
    minMembers: 3,
    description: "X-Men passive grants extra turn meter and counter-attacks when 3+ X-Men ally.",
  },
  Inhuman: {
    trait: "Inhuman",
    minMembers: 3,
    description: "Inhumans gain offense and ability-energy synergy when 3+ Inhumans are on the team.",
  },
  AForce: {
    trait: "A-Force",
    minMembers: 3,
    description: "A-Force gains damage and Deflect/Defense Up when 3+ A-Force members ally.",
  },
  Wakandan: {
    trait: "Wakandan",
    minMembers: 3,
    description: "Wakandans gain Defense Up and counter-attack synergy when 3+ Wakandans ally.",
  },
  Hand: {
    trait: "Hand",
    minMembers: 3,
    description: "Hand gain stealth, evade, and bleed synergy when 3+ Hand members ally.",
  },
  Defender: {
    trait: "Defender",
    minMembers: 3,
    description: "Defenders gain Defense Up and assist chains when 3+ Defenders ally.",
  },
  Symbiote: {
    trait: "Symbiote",
    minMembers: 3,
    description: "Symbiotes gain heal-on-attack and offense synergy when 3+ Symbiotes ally.",
  },
  BlackOrder: {
    trait: "Black Order",
    minMembers: 3,
    description: "Black Order gain heavy offense and ability-block synergy when 3+ members ally.",
  },
  Brotherhood: {
    trait: "Brotherhood",
    minMembers: 3,
    description: "Brotherhood gain counter-attack and offense synergy when 3+ Brotherhood ally.",
  },
  MercsForMoney: {
    trait: "Mercenary",
    minMembers: 3,
    description: "Mercs for Money gain ability-energy and damage synergy when 3+ Mercs ally.",
  },
};
