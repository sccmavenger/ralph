# PRD: Difficulty-Aware Tower Planner (v2 — API-grounded)

## 1. Introduction / Overview

The Tower Planner (`/analyze/tower-planner`) currently recommends the **weakest team that meets a room's listed entry requirements**. The listed requirements are the floor to *enter* a room — not what is needed to *win*. The current solver routinely recommends teams that are dramatically under-powered for the actual fight (confirmed: War Tower cell 1, "team died fast — clearly outclassed").

API probing (`scripts/probe-node-combats.ts`, `scripts/probe-nc-raw.ts`) confirmed that **`GET /game/v1/nodeCombats/{combatId}`** returns the full enemy team for every tower cell, including each unit's `power`, `level`, `gearTier`, `activeYellow`, `activeRed`, `iso8`, `nodeEffects`, and per-stat `stats` object. This means we no longer need to estimate opponent strength — we can read it directly.

This PRD replaces "weakest viable" with "safest viable above margin," using real opponent power per cell.

## 2. Goals

- Stop recommending teams that lose because they were sized to entry floor instead of actual fight.
- Use real opponent power from `/game/v1/nodeCombats/{combatId}` for every room.
- Allocate scarce strong characters to the hardest cells first, not the easiest cells.
- Replace the self-referential confidence score with an honest power-margin signal the user can act on.
- Add a lightweight outcome feedback loop so the user's personal safety margin tunes itself over time.

## 3. User Stories

### US-001: Enemy team fetcher for tower cells
Fetch and cache the enemy team for every cell in the active tower so downstream logic has real opponent data.

**Acceptance:**
- New module `src/lib/tower-enemy-fetcher.ts` exports `getEnemyTeam(combatId, towerId)` and `getEnemyTeamsForRooms(rooms, towerId)`.
- Calls `/game/v1/nodeCombats/{combatId}?charInfo=full&difficulty=0&difficultyGroup={towerId}` via existing `msfApiFetch` helper.
- Returns typed `EnemyTeam { combatId, units: EnemyUnit[], totalPower: number }` where `EnemyUnit` includes `id, name, level, gearTier, activeYellow, activeRed, power, stats, nodeEffects, iso8`.
- Skips rooms with no `combatId`, returns null for those entries.
- In-memory cache keyed by `combatId`, invalidated when `meta.hashes.nodes` changes (matches existing `dd-service.ts` pattern).
- Unit tests in `src/lib/tower-enemy-fetcher.test.ts` cover: successful fetch, missing combatId, cache hit, cache invalidation on hash change.
- Typecheck passes.
- Tests pass.

### US-002: Solve API returns opponent power per room
Surface enemy power data through the existing `/api/tower/solve` route so the client and solver see the same numbers.

**Acceptance:**
- `src/app/api/tower/solve/route.ts` GET/POST handler calls `getEnemyTeamsForRooms` for the active tower's room list.
- Response JSON adds `opponentPowers: Record<string, number>` (roomId → total opponent power) and `opponentTeams: Record<string, EnemyTeam>` alongside the existing assignment payload.
- Fetch failures for individual rooms degrade gracefully — the response includes successful rooms and a `roomFetchErrors: string[]` field listing the failed `combatId`s.
- Existing response shape preserved (no breaking changes for fields already consumed by the UI).
- Unit test in `src/app/api/tower/solve/route.test.ts` mocks the fetcher and asserts the new fields appear with correct values.
- Typecheck passes.
- Tests pass.

### US-003: Margin-aware team selection in the solver
Replace "weakest viable team" with "lowest-power viable team that beats opponent by safety margin."

**Acceptance:**
- `src/lib/tower-solver.ts` `solveTowerAllocation` accepts new `opponentPowers: Map<string, number>` and `safetyMargin: number` (default `1.10`) options.
- For each room, after `meetsRequirements` filtering, eligible characters are sorted ascending by power, and the solver picks the smallest contiguous prefix whose summed power ≥ `opponentPower × safetyMargin`.
- If no eligible subset meets the margin, the solver picks the **strongest** eligible team (descending sort, take top N) and tags that room's result with `marginFallback: true`.
- "Harder rooms first" allocation order is preserved — rooms are processed in descending `opponentPower` order so scarce strong characters are reserved for the cells that need them.
- All existing `tower-solver.test.ts` cases still pass after updating expected outputs where the new logic legitimately picks different teams.
- Three new tests added: (a) comfortable margin selects mid-power team not weakest, (b) no-viable-margin falls back to strongest with `marginFallback: true`, (c) ordering reserves top characters for the highest-opponent-power room.
- Typecheck passes.
- Tests pass.

### US-004: Honest confidence score from real margin
Replace `getConfidence`'s self-referential `minCharPower * 5` baseline with a function of `myPower / opponentPower`.

**Acceptance:**
- `src/lib/tower-solver.ts` `getConfidence(teamPower, opponentPower)` returns one of `strong | shouldWork | risky | likelyLoss` using thresholds: ≥1.30 strong, 1.10–1.30 shouldWork, 0.95–1.10 risky, <0.95 likelyLoss.
- Each result includes `marginPct` (rounded to nearest integer) and a one-line `reason` string referencing the margin (e.g. `"Your team is ~18% stronger than the opponent."`).
- Old signature kept as a deprecated overload that delegates to the new function with `opponentPower = teamPower / 1.10` so existing call sites compile until US-005 migrates the UI.
- Unit tests cover all four thresholds and the boundary values.
- Typecheck passes.
- Tests pass.

### US-005: Tower planner UI shows opponent power and margin per cell
Surface the new data on each room card so the user sees *why* a team is or isn't recommended.

**Acceptance:**
- `src/app/(app)/analyze/tower-planner/TowerPlannerClient.tsx` renders for each room: opponent power, your team's total power, margin % (color-coded: green ≥25%, yellow 10–25%, red <10%), and the new confidence chip including the `likelyLoss` state.
- Cards with `marginFallback: true` show a visible warning banner: `"No team meets the recommended {margin}× safety margin — best available shown."`
- Rooms whose enemy fetch failed show a muted `"Opponent data unavailable"` line and fall back to the legacy entry-requirement-based selection silently (no broken UI).
- E2E test `e2e/dd-planner-page.spec.ts` style test added at `e2e/tower-planner-difficulty.spec.ts` that loads the planner, asserts margin % renders on at least one room card, and asserts the warning banner renders when forced into fallback mode.
- Typecheck passes.
- Tests pass.

### US-006: User-tunable safety margin slider
Let the user dial the safety margin up or down for their whole run without re-fetching.

**Acceptance:**
- A slider in the planner header (range 1.00–1.50, step 0.05, default 1.10) labeled `"Safety margin"`.
- Changing the slider re-runs the client-side solve against already-fetched opponent data — no new API calls.
- Value persists in `localStorage` keyed by `towerEventId`; clears when a new tower event starts.
- Slider has a `"Reset to default"` link that snaps back to `1.10`.
- Unit test covers persistence read/write helper; e2e test covers slider drag → margin recompute.
- Typecheck passes.
- Tests pass.

### US-007: Post-fight outcome feedback
Capture user-reported outcomes so future recommendations adapt.

**Acceptance:**
- Each room card has three small buttons: `Won easily`, `Won barely`, `Lost`.
- Clicking a button stores `{ towerEventId, roomId, outcome, recommendedTeam, opponentPower, timestamp }` in `localStorage` under key `tower-planner-outcomes`.
- A rolling tally (last 20 outcomes) feeds a "suggested personal margin" displayed next to the safety-margin slider: e.g. `"Suggested: 1.20× — your last 10 fights at 1.10× lost 30% of the time."`
- Suggestion is informational only — never auto-changes the slider.
- Unit tests cover outcome storage, rolling-window math, and suggestion logic.
- Typecheck passes.
- Tests pass.

### US-008: Node-effect-aware opponent power adjustment
Account for per-character `nodeEffects.boosts` (extra hp/dmg/armor) so buffed enemies are weighted correctly.

**Acceptance:**
- `tower-enemy-fetcher.ts` exports `applyNodeEffects(unit)` that multiplies the unit's `power` by `1 + sum(boosts) / 1000` (rough heuristic — boosts CSV is `health,damage,armor,focus,resist` in tenths of a percent).
- `EnemyTeam.totalPower` reflects the adjusted values.
- Unit test verifies an unboosted unit's adjusted power equals its base power and a boosted unit's adjusted power is higher by the expected ratio (within ±2%).
- Documented as a heuristic in code comments — refined later when devs answer Q1 about difficulty scaling.
- Typecheck passes.
- Tests pass.

## 4. Functional Requirements

- **FR-1:** System fetches real enemy team data from `/game/v1/nodeCombats/{combatId}` for every tower cell with a `combatId`.
- **FR-2:** Opponent total power = `Σ unit.power` across all units in `right.waves[0].units`, optionally adjusted by US-008 node-effect heuristic.
- **FR-3:** Solver picks lowest-power eligible team whose summed power ≥ `opponentPower × safetyMargin`; falls back to strongest eligible team with explicit warning when no team meets margin.
- **FR-4:** Rooms processed in descending opponent-power order so scarce strong characters land in the hardest cells.
- **FR-5:** Confidence pill computed from `myPower / opponentPower` ratio, never self-referential.
- **FR-6:** UI shows per-room: opponent power, team power, margin %, confidence chip, fallback warning when applicable.
- **FR-7:** Safety margin user-tunable via header slider; persists per `towerEventId` in `localStorage`.
- **FR-8:** Outcome feedback (Won easily / Won barely / Lost) stored in `localStorage` and surfaced as a suggested personal margin.
- **FR-9:** Enemy fetch failures degrade gracefully — affected rooms fall back to legacy selection with a muted "opponent data unavailable" label.
- **FR-10:** Enemy-team cache invalidated when `meta.hashes.nodes` changes, matching the existing DD service pattern.

## 5. Non-Goals (Out of Scope)

- PvP towers / player-vs-player opponent rosters (the `left` side of `NodeCombat` is always empty for survival towers).
- Multi-difficulty selector (pending dev answer on whether `difficulty` parameter scales tower enemies — current observation: it does not).
- Auto-detecting in-progress tower runs from a player-scoped endpoint (no such endpoint exists; user still picks current cell manually).
- Crowd-sourced opponent power values between commanders.
- Changes to Crucible, Dark Dimensions, or any non-tower analyzer.
- A database table for outcomes — `localStorage` is sufficient for v1.

## 6. Design Considerations

- Per-room display uses the existing room card component; add a compact "Opponent: 287,400 • You: 312,800 • +9%" line.
- Safety-margin slider lives in the existing planner header near the tower switcher.
- Color thresholds for margin: green ≥25%, yellow 10–25%, red <10%, deep-red <0%.
- Warning banner for `marginFallback: true` uses the existing destructive alert style.
- Outcome buttons (Won easily / Won barely / Lost) are small icon buttons in a row under the team list, not modal.

## 7. Technical Considerations

- **New file:** `msf-companion/src/lib/tower-enemy-fetcher.ts` (US-001).
- **Updated files:** `src/lib/tower-solver.ts` (US-003, US-004), `src/app/api/tower/solve/route.ts` (US-002), `src/app/(app)/analyze/tower-planner/TowerPlannerClient.tsx` (US-005, US-006, US-007).
- **Test files:** `tower-enemy-fetcher.test.ts`, updates to `tower-solver.test.ts`, new `route.test.ts`, new `e2e/tower-planner-difficulty.spec.ts`.
- Reuse `msfApiFetch` from `src/lib/msf-api.ts` for the new endpoint.
- Hash-invalidation utility from `src/lib/dd-service.ts` is the reference pattern — extract to a shared helper if duplication appears.
- Keep the 5-minute room cache in `tower-fetcher.ts` untouched; add a separate cache layer for `nodeCombats` keyed by `combatId`.
- Default constants (`SAFETY_MARGIN_DEFAULT = 1.10`, threshold ratios) live in `tower-solver.ts` as exported named constants.

## 8. Success Metrics

- Zero "recommended team lost" reports in the next two tower runs, measured via US-007 outcome capture.
- ≥95% of room cards show an opponent power value (rest show "unavailable" with graceful fallback).
- No regressions in existing tower e2e tests.
- New unit test coverage ≥90% line for `tower-enemy-fetcher.ts` and the changed portion of `tower-solver.ts`.

## 9. Open Questions (Tracked for Devs, Not Blocking Build)

- Does `difficultyGroup`/`difficulty` actually scale survival-tower enemy stats? (Probe says no.) — Once answered, US-008 may be replaced by a real difficulty multiplier.
- Is `meta.hashes.nodes` the right invalidation key for `nodeCombats`, or do we need a finer-grained hash?
- Why is `NodeCombat.left` always empty for survival towers — intentional convention?
