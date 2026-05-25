# PRD — Tower Planner: Ability-Aware Team Scoring

## Problem

The tower planner solver currently selects teams using only:

- Trait/filter eligibility (e.g. "any of Hero", "Villain+Cosmic")
- Total team power × user-configured safety margin ≥ opponent power
- Tiebreaker: highest summed power among eligible teams

This produces recommendations that look great on paper — e.g. "+56% margin, Strong pick" — but lose in-game because power does not capture:

- **Ability/kit synergies** within the team (faction passives, team-up bonuses)
- **Counters/anti-counters** vs the specific opponent kit (immunity to Bleed/Disrupted/Slow, dispels, ability-block, revive interaction, heal-block vs heal-heavy teams)
- **Role mix** (healer + tank + DPS vs a pure-DPS stack)
- **Speed-bar / turn order** advantage
- **Positive/negative effect interactions** vs the opponent's debuffs/buffs

Real-world example that triggered this PRD: cell 3 of WAR TOWER (OMEGA), `any of Hero` filter. Solver recommended Beta Ray Bill / Iron Man (IW) / Star-Lord (Annihilation) / Victoria Hand / Captain Marvel with team 1,141k vs opp 733k (+56%, "Strong pick"). User lost the fight on this recommendation twice in a row at safety margin 1.50. None of those 5 share a faction passive, and the recommendation didn't consider opponent abilities.

## Goal

Make tower-planner recommendations consider opponent abilities and team-internal synergy when scoring candidate teams, not just power-margin. A recommendation labelled "Strong pick" should actually be a strong pick.

## Non-goals

- Replacing the safety-margin slider or outcome-feedback loop (both stay).
- Computing exact damage simulations.
- Changing the solver's eligibility-filter behavior.
- Building a separate "battle simulator" page.

## Users

Commanders using the tower planner (single user role today). Power users will benefit most because they have rosters deep enough to allow synergy-based picks; lower-level users get value when the synergy bonus surfaces strictly-better teams within the same power band.

## Data sources available

| Source | What it gives us | Status |
|---|---|---|
| `/api/tower/solve` `opponentTeams[roomId].units[]` | Real opponent 5-character lineup with id, name, level, gear, power, ISO-8 | Already fetched server-side; now exposed to UI via "Show opponent" expander |
| MSF API `getCharacterAbilities` | Per-character ability descriptions (basic / special / ultimate / passive), tags (`buff`, `debuff`, `assist`, `heal`, `revive`, `dispel`, `immune-to-bleed`, etc.) | Used elsewhere in the codebase; needs wiring into the solver path |
| Character traits (already on `Character`) | Faction tags (Asgardian, Avenger, X-Men, Hero/Villain, Skill/Mystic/Tech/Mutant/Bio, etc.) | Available today |

## Proposed design

Introduce a **scoring layer** that runs on top of the existing eligibility filter and power calculation, producing a `compositeScore` per candidate team. Final team selection picks the highest `compositeScore` (not raw power) among teams that pass the safety-margin gate.

### Component scores (0–100 each, blended)

1. **Power-margin score** — current logic, normalized.
2. **Faction-synergy score** — bonus when team shares ≥3-character faction passive (Asgardian, Avenger, Inhuman, X-Men, etc.). Drawn from a curated faction-passive map (kept small and editable, not API-generated).
3. **Counter score (opp-aware)** — for each opponent ability tag, reward characters whose own ability tags counter it (e.g. opponent has `revive` → our `heal-block` or `revive-block` is rewarded; opponent has `bleed` → our `immune-to-bleed` is rewarded; opponent has `heavy buffs` → our `dispel` is rewarded).
4. **Role-balance score** — small bonus for teams with at least 1 healer/support + 1 tank/disruptor + ≥2 damage dealers (computed from ability tags).

### Composite

```
compositeScore = 0.45 * powerMarginScore
               + 0.20 * factionSynergyScore
               + 0.25 * counterScore
               + 0.10 * roleBalanceScore
```

Weights are constants in `tower-solver-scoring.ts`; iterate after live data.

### Confidence label

Composite score also feeds confidence:

| compositeScore | Label |
|---|---|
| ≥ 75 | Strong pick |
| 55–74 | Should work |
| 35–54 | Risky |
| < 35 | Likely loss |

A "Strong pick" now requires meaningful counter / synergy, not just raw power.

### "Why this team?" expansion

Update the existing "Why this team?" reason text to break down the four sub-scores (e.g. *"Power +56% (45/45) · X-Men synergy (15/20) · Counters opp Asgardian revive via Phoenix dispel (22/25) · Role mix (8/10) — composite 90/100"*).

## User stories

- **US-001**: Curate a faction-passive map (e.g. Asgardian, Avenger, X-Men, Inhuman, A-Force, Wakandan, Hand, Defenders, Symbiote, Black Order, Brotherhood, etc.) listing the trait tag and required threshold. Stored as a JSON constant. ~30 entries.
- **US-002**: Add `factionSynergyScore(team, factionPassiveMap)` pure function with unit tests.
- **US-003**: Extract opponent ability tags from `EnemyTeam.units[]` (via cached `getCharacterAbilities`). Add `extractAbilityTags(charIds)` with on-disk/in-memory cache.
- **US-004**: Add `counterScore(team, opponentTags)` pure function with unit tests. Counter map (debuff → counter) is a curated constant — start with ~20 high-value entries (revive, heal, bleed, disrupted, slow, blind, offense-down, defense-down, stun, ability-block, immune-to-debuffs, taunt, dispel).
- **US-005**: Add `roleBalanceScore(team, roleTags)` pure function with unit tests.
- **US-006**: Blend into `solveTowerAllocation` — final pick is highest composite, not highest power. Existing safety-margin gate still filters first.
- **US-007**: Update `assignment.reason` to break down sub-scores. Update confidence thresholds to use composite. Update "Strong pick / Should work / Risky / Likely loss" labels accordingly.
- **US-008**: Surface opponent ability tags in the UI's existing "Show opponent" expander (e.g. "Asgardian · revive · counter-attack").
- **US-009**: E2E test verifying that for a synthetic opponent with `bleed`-heavy kit, a candidate team with `immune-to-bleed` is preferred over an equivalent-power team without it.

## Risks

- **Ability-tag quality** — MSF API ability descriptions are free-text; tagging is heuristic. Mitigation: start with a curated tag map for ~150 high-usage tower characters, fall back to power-only when uncovered.
- **Compute cost** — fetching abilities for every roster character × every cell. Mitigation: per-character ability cache (in-memory + localStorage) keyed by ability-hash.
- **Weight tuning** — initial weights are guesses. Mitigation: the existing outcome-feedback loop (Won easily / Won barely / Lost) already gives us a signal — log composite scores alongside outcomes and re-tune.

## Success metrics

- Of cells flagged "Strong pick" by the new scorer, ≥85% should be logged as "Won easily" or "Won barely" by the user (vs current ~unknown — but we have observed at least one "Strong pick" lose).
- The composite-score breakdown should make the recommendation defensible to the user when they ask "why this team?".

## Open questions

- Should faction-passive bonuses scale with how many characters share the trait, or be binary (≥3 yes/no)?
- Do we let the user disable counter-scoring per cell when they want to brute-force with power?
- Should losing fights penalize previously-recommended teams for future cells in the same week (avoid repeat losses)?
