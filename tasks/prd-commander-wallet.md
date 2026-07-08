# PRD — Commander Wallet: Manual Gold & Cores → Affordability Planning

## Problem

The MSF Companion already knows **what** a commander should build (Investment Planner priorities, per-encounter team gates) and **what it costs** in API-readable resources (gear pieces, ability materials, training XP). But the two currencies that actually gate progression during the current in-game resource crunch — **Gold** and **Power Cores** — are **not exposed by the MSF API** (proven this session: they appear nowhere in inventory, player card, or any itemType).

Because of that gap, every cost/priority view can only give **advice** ("build Rogue to G15"), never an **affordability answer** ("that costs 4.2M gold; you have 1.8M; you're 2.4M short"). Affordability is precisely the anxiety commanders feel during a scarcity economy.

## Goal

Let a commander **enter their Gold and Power Cores once** so the app's existing cost machinery graduates from advice into a real **"can I afford it / what am I short on"** answer — especially for the outcome-first question *"What will it cost to unlock character X, and can I afford it now?"*

Ground truth for the experience: the approved mockup at
`session-state/.../files/wallet-integration-mockup.html` (4 screens: one-time prompt → wallet strip on Planner → full-bill outcome screen → short/gap view).

## Users

Commanders using the Investment Planner (single user role today). Highest value for mid/late-game players juggling multiple new-team investments under constrained Gold/Cores.

## Data sources

| Source | What it gives us | Status |
|---|---|---|
| **Commander manual input** | Gold balance, Power Cores balance | NEW — the only two values we ask for |
| MSF API `/player/v1/roster` | Character gear tier, stars, level, traits | Already used (gaps route) |
| MSF API inventory | Ability materials, training XP balances | Readable (proven) — Gold/Cores are NOT |
| `planner-events.ts` `NormalizedEncounter[]` | Per-encounter team gates for an outcome | Shipped this session |
| `upgrade-calculator.ts` | Gear/ability/star item costs to a target | Exists; does NOT yet compute training-XP level cost or gold cost |
| Prisma / PostgreSQL | Per-account persistence | Available |

## Proposed design

A small **wallet** owned by the account: two self-reported integers (`gold`, `cores`) plus a `confirmedAt` timestamp. It is surfaced as a **wallet strip** on `/planner`, and it feeds an **affordability layer** that compares a computed cost bundle (gold + cores + ability mats + training XP) against the wallet + API-readable balances, producing a per-outcome verdict: **affordable now** or **short by X**.

Everything is **additive and optional** — all existing planner/cost views keep working with no wallet; entering balances *upgrades* them.

### Phasing

- **Phase 1 — Foundation:** wallet data model + storage + API, the input sheet, the wallet strip on `/planner`, edit flow. Independently shippable and useful.
- **Phase 2 — Affordability core:** a cost engine that produces a full cost bundle (incl. gold + training-XP level cost), and the have/short comparison surfaced as a one-line badge on existing planner event cards.
- **Phase 3 — Full-bill outcome screen:** the "Unlock X" detail view combining per-encounter teams + cost-vs-wallet table + verdict.
- **Phase 4 — Offers cost side + freshness nudge:** offer scoring gains a "% of your cores" cost view; a gentle "confirm your gold?" staleness nudge.

---

## Goals (measurable)

- A commander can enter and persist Gold + Cores in ≤ 10 seconds, and see them reflected across the planner.
- Any planner event with a computable cost shows an **affordable / short-by-X** badge when a wallet exists.
- The "Unlock X" screen shows a complete cost-vs-wallet table (Gold, Cores, Ability Mats, Training XP) with a single top-line verdict.
- Wallet values are always clearly labeled **self-reported** with a last-confirmed timestamp — never presented as live API data.
- Zero regressions: all existing planner/offers views work identically when no wallet is set.

---

## User Stories

**Testing convention:** Every story has **Acceptance Criteria** (what "done" means) and **Test Cases** (how it's proven). Each test case states a setup/action and an explicit **Pass Criteria** — the observable result that must be true. **A story's testing is complete only when every one of its test cases meets its Pass Criteria.** If any test case fails, the story is not done. Test cases marked as pure-function or API behavior should be automated (vitest/e2e); UI test cases may be verified via component tests or manual QA against the stated pass criteria.

### Phase 1 — Foundation

#### US-001: Wallet data model & persistence
**Description:** As a commander, I want my Gold and Cores stored on my account so I only enter them once.

**Acceptance Criteria:**
- [ ] Prisma model (e.g. `CommanderWallet`) with `gold: BigInt/Int`, `cores: Int`, `confirmedAt: DateTime`, `updatedAt`, and a unique relation to the account/user.
- [ ] Migration created and `npx prisma migrate status` is internally consistent.
- [ ] Values are non-negative integers; nullable/absent wallet is a valid state (feature is optional).
- [ ] Typecheck/lint passes; `npx next build` succeeds.

**Test Cases:**
- [ ] **TC-001.1 — Migration applies cleanly.** Setup: run the generated migration against a fresh DB. *Pass criteria:* `npx prisma migrate status` reports the schema up to date with no pending/failed migrations; the `CommanderWallet` table exists with columns `gold`, `cores`, `confirmedAt`, `updatedAt`, and the account relation.
- [ ] **TC-001.2 — Persist and read back a wallet.** Setup: create a wallet row `{gold: 1840000, cores: 6120}` for a test account, then re-fetch by account. *Pass criteria:* the returned row equals the written values and `confirmedAt` is a valid timestamp.
- [ ] **TC-001.3 — One wallet per account (uniqueness).** Setup: attempt to create a second wallet row for the same account. *Pass criteria:* the unique constraint rejects it (error thrown), so an account can have at most one wallet.
- [ ] **TC-001.4 — Absent wallet is valid.** Setup: query wallet for an account that has none. *Pass criteria:* the query returns null/empty without error (feature remains optional).
- [ ] **TC-001.5 — Non-negative integer enforcement.** Setup: attempt to persist `gold: -1`. *Pass criteria:* the write is rejected by validation/constraint (no negative row persisted).
- [ ] **TC-001.6 — Build/typecheck gate.** *Pass criteria:* `npx next build` exits 0 and lint passes.

#### US-002: Wallet read/write API
**Description:** As a commander, I want endpoints to read and update my wallet so the UI can load and save it.

**Acceptance Criteria:**
- [ ] `GET /api/msf/wallet` returns `{ gold, cores, confirmedAt }` or an empty/absent state; 401 when unauthenticated.
- [ ] `PUT /api/msf/wallet` accepts `{ gold, cores }`, validates non-negative integers, sets `confirmedAt = now`, returns the saved wallet; 401 when unauthenticated; 400 on invalid input.
- [ ] Wallet is scoped to the authenticated account only (no cross-account read/write).
- [ ] Unit/integration tests for validation, auth, and round-trip persistence.
- [ ] Typecheck/lint passes.

**Test Cases:**
- [ ] **TC-002.1 — GET unauthenticated → 401.** Action: `GET /api/msf/wallet` with no session. *Pass criteria:* HTTP 401.
- [ ] **TC-002.2 — GET with no wallet set.** Setup: authenticated account with no wallet. Action: `GET /api/msf/wallet`. *Pass criteria:* HTTP 200 with an explicit empty/absent state (e.g. `null` or `{exists:false}`), not an error.
- [ ] **TC-002.3 — PUT then GET round-trip.** Action: `PUT {gold:1840000, cores:6120}` then `GET`. *Pass criteria:* PUT returns 200 with the saved values and a fresh `confirmedAt`; subsequent GET returns the same values.
- [ ] **TC-002.4 — PUT unauthenticated → 401.** Action: `PUT` with no session. *Pass criteria:* HTTP 401 and nothing persisted.
- [ ] **TC-002.5 — PUT invalid input → 400.** Action: `PUT {gold:-5, cores:"abc"}`. *Pass criteria:* HTTP 400; existing wallet (if any) is unchanged.
- [ ] **TC-002.6 — Account isolation.** Setup: account A has a wallet. Action: authenticate as account B and `GET`/`PUT`. *Pass criteria:* B never reads or overwrites A's wallet; B operates only on its own row.
- [ ] **TC-002.7 — confirmedAt updates on write.** Action: PUT twice with a delay. *Pass criteria:* the second response's `confirmedAt` is strictly later than the first.

#### US-003: Wallet input sheet
**Description:** As a commander, I want a simple 2-field sheet to enter Gold and Cores so setup is trivial.

**Acceptance Criteria:**
- [ ] Mobile-first sheet with two numeric inputs (Gold, Cores), thousands-formatted display, matching app theme tokens.
- [ ] Save calls `PUT /api/msf/wallet`; a "Skip for now" path dismisses without saving.
- [ ] Helper text explains these two values aren't in the API and are stored as self-reported.
- [ ] Input rejects non-numeric/negative values gracefully.
- [ ] Typecheck/lint passes.

**Test Cases:**
- [ ] **TC-003.1 — Save happy path.** Action: open sheet, enter Gold `1840000` and Cores `6120`, tap Save. *Pass criteria:* a `PUT /api/msf/wallet` fires with `{gold:1840000, cores:6120}`; on success the sheet closes and the new values are shown by the caller.
- [ ] **TC-003.2 — Thousands formatting.** Action: type `1840000` in Gold. *Pass criteria:* display shows `1,840,000` while the value sent to the API is the raw integer `1840000`.
- [ ] **TC-003.3 — Reject non-numeric.** Action: type `abc` / paste `12.3.4`. *Pass criteria:* field does not accept invalid characters (or shows a validation error) and Save is blocked until valid.
- [ ] **TC-003.4 — Reject negative.** Action: attempt `-100`. *Pass criteria:* value is rejected; no PUT with a negative number is sent.
- [ ] **TC-003.5 — Skip path.** Action: open sheet, tap "Skip for now." *Pass criteria:* no PUT is sent, sheet dismisses, no wallet is created.
- [ ] **TC-003.6 — Self-reported disclosure present.** *Pass criteria:* helper text stating the values are self-reported / not from the API is visible in the sheet.
- [ ] **TC-003.7 — Save failure handling.** Setup: API returns 400/500. *Pass criteria:* the sheet surfaces an error and does not falsely report success or close as if saved.

#### US-004: Wallet strip on Planner
**Description:** As a commander, I want to see my wallet at the top of the planner so my balances are always in context.

**Acceptance Criteria:**
- [ ] `/planner` renders a "Your Wallet" strip above existing event cards showing Gold + Cores, formatted, with a "self-reported" label and "confirmed Nd ago" from `confirmedAt`.
- [ ] Each balance has an "edit" affordance that opens the US-003 sheet pre-filled.
- [ ] When no wallet exists, the strip shows an "Add your wallet" prompt instead (first-run).
- [ ] Existing planner readiness bars/cards render unchanged when the strip is present.
- [ ] Typecheck/lint passes; existing planner e2e/unit tests still pass.

**Test Cases:**
- [ ] **TC-004.1 — Strip renders with values.** Setup: account has wallet `{1.84M, 6120}`. *Pass criteria:* `/planner` shows a wallet strip with Gold `1.84M`/`1,840,000` and Cores `6,120`, positioned above the first event card.
- [ ] **TC-004.2 — Self-reported + age label.** Setup: `confirmedAt` = 2 days ago. *Pass criteria:* strip shows a "self-reported" label and "confirmed 2d ago" (or equivalent relative age).
- [ ] **TC-004.3 — First-run prompt.** Setup: account has no wallet. *Pass criteria:* strip shows an "Add your wallet" prompt (not zeros), and tapping it opens the input sheet.
- [ ] **TC-004.4 — Edit opens pre-filled sheet.** Action: tap "edit" on Gold. *Pass criteria:* the US-003 sheet opens pre-populated with the current values; saving updates the strip in place.
- [ ] **TC-004.5 — No regression to planner.** *Pass criteria:* existing planner unit/e2e tests still pass; readiness bars and event cards render identically to before the strip was added.

### Phase 2 — Affordability core

#### US-005: Cost bundle engine (gold + training-XP + mats)
**Description:** As the system, I want to compute the full resource cost to take a character from its current state to a target so affordability can be evaluated.

**Acceptance Criteria:**
- [ ] A pure function computes a `CostBundle { gold, cores, abilityMats: Record<itemId,qty>, trainingXp }` for a character delta (current gear/level/stars → target).
- [ ] Reuses `upgrade-calculator.ts` for gear/ability/star item costs; adds training-XP level cost and gold cost sourcing (documented; see Technical Considerations).
- [ ] Handles the "unowned character" case (full cost from zero) and the "already meets target" case (zero cost).
- [ ] Unit tests cover a known character delta with expected quantities from the API cost book / fixtures.
- [ ] Typecheck/lint passes.

**Test Cases:**
- [ ] **TC-005.1 — Known gear delta cost.** Setup: fixture character G13→G15. *Pass criteria:* returned `abilityMats`/gear quantities match the values from the cost book fixture exactly; `gold` and `trainingXp` are computed (non-null).
- [ ] **TC-005.2 — Already at/above target → zero.** Setup: character already at target gear/level/stars. *Pass criteria:* `CostBundle` is all zeros / empty mats.
- [ ] **TC-005.3 — Unowned character → full cost.** Setup: character not on roster, target G13. *Pass criteria:* cost is computed from zero (level 1 / gear 1), strictly greater than an owned same-target character.
- [ ] **TC-005.4 — Training-XP level cost.** Setup: level delta e.g. 50→70. *Pass criteria:* `trainingXp` equals the sum of the per-level XP curve over the delta (documented source), and is 0 when there is no level delta.
- [ ] **TC-005.5 — Gold cost sourced.** *Pass criteria:* `gold` is derived from the resolved gold-cost source (Open Question #1) and documented in code; a fixture delta yields the expected gold amount.
- [ ] **TC-005.6 — Purity.** *Pass criteria:* function has no network/DB calls (data passed in); identical inputs always yield identical output.

#### US-006: Affordability comparison
**Description:** As a commander, I want to know whether I can afford a cost bundle so I can decide what to build.

**Acceptance Criteria:**
- [ ] A pure function compares a `CostBundle` against `{ wallet.gold, wallet.cores, api.abilityMats, api.trainingXp }` and returns per-resource `{ required, have, short }` plus an overall `affordable: boolean`.
- [ ] Gracefully degrades: if no wallet, gold/cores are reported as "unknown" (not "short"), and overall verdict is "wallet needed" rather than a false negative.
- [ ] Unit tests cover affordable, short-on-one-resource, and no-wallet cases.
- [ ] Typecheck/lint passes.

**Test Cases:**
- [ ] **TC-006.1 — Fully affordable.** Setup: every `have ≥ required`. *Pass criteria:* each resource `short = 0` and overall `affordable = true`.
- [ ] **TC-006.2 — Short on one resource.** Setup: gold `have < required`, others sufficient. *Pass criteria:* gold `short = required − have` (correct amount), overall `affordable = false`, and only gold is flagged short.
- [ ] **TC-006.3 — No wallet → unknown, not short.** Setup: wallet absent. *Pass criteria:* gold/cores reported with status `unknown`; overall verdict is "wallet needed"; the function does NOT return `affordable:false` purely due to missing wallet, and mats/XP (from API) are still evaluated.
- [ ] **TC-006.4 — Exact-match boundary.** Setup: `have == required` for all. *Pass criteria:* `short = 0`, `affordable = true` (≥ is inclusive).
- [ ] **TC-006.5 — Zero-cost bundle.** Setup: empty `CostBundle`. *Pass criteria:* `affordable = true` regardless of wallet presence.
- [ ] **TC-006.6 — Purity.** *Pass criteria:* no side effects; deterministic for identical inputs.

#### US-007: Per-event affordability badge
**Description:** As a commander, I want each planner event to tell me if I can afford to finish it so I can triage at a glance.

**Acceptance Criteria:**
- [ ] Planner event cards show a badge: "affordable now" (green) or "short by X gold/cores" (amber/red), derived from US-005/US-006 across the event's blocking characters.
- [ ] When no wallet is set, the badge invites "Add wallet to see affordability" instead of a misleading value.
- [ ] Badge computation does not block initial card render (loads progressively or server-computed with existing gaps data).
- [ ] Existing `readinessPercent` and `characters[]` behavior unchanged.
- [ ] Typecheck/lint passes; planner gaps API tests still pass.

**Test Cases:**
- [ ] **TC-007.1 — Affordable badge.** Setup: wallet covers the event's total cost. *Pass criteria:* the event card shows a green "affordable now" badge.
- [ ] **TC-007.2 — Short badge with amount.** Setup: wallet short 9M gold for the event. *Pass criteria:* the card shows "short by 9M gold" (correct currency + amount matching US-006 output).
- [ ] **TC-007.3 — No wallet → invite.** Setup: no wallet. *Pass criteria:* the card shows "Add wallet to see affordability" and no false "short"/"affordable" verdict.
- [ ] **TC-007.4 — Non-blocking render.** *Pass criteria:* event cards and readiness bars appear before badge computation completes (badge fills in progressively or is precomputed without added blocking latency).
- [ ] **TC-007.5 — No regression to gaps API.** *Pass criteria:* `readinessPercent` and `characters[]` values are unchanged; existing planner gaps tests pass.

### Phase 3 — Full-bill outcome screen

#### US-008: "Unlock X" required-teams view
**Description:** As a commander, I want to see the teams that block an outcome and which characters are under the gate so I know what to fix.

**Acceptance Criteria:**
- [ ] A detail view (off a planner event) lists the blocking teams from `NormalizedEncounter[]` (non-mission encounters), showing each required character with current vs required gear and an ok/under indicator.
- [ ] Prerequisite campaigns (from `prerequisites`) are displayed when present.
- [ ] Mission-only encounters are excluded from the roster-gap list (game supplies the team).
- [ ] Typecheck/lint passes.

**Test Cases:**
- [ ] **TC-008.1 — Blocking teams listed.** Setup: event with 3 non-mission encounters. *Pass criteria:* the view lists all 3 teams, each with its required characters and their gear gates from `NormalizedEncounter[]`.
- [ ] **TC-008.2 — Under-gate indicator.** Setup: a required character is G11 vs required G13. *Pass criteria:* that character shows "current G11 / required G13" with an "under" indicator; a character at/above target shows "ok".
- [ ] **TC-008.3 — Mission tiers excluded.** Setup: event includes `missionCharacters:true` tiers. *Pass criteria:* those tiers do NOT appear in the roster-gap list.
- [ ] **TC-008.4 — Prerequisites shown.** Setup: event with `prerequisites` (e.g. ECM_MORGAN_C). *Pass criteria:* the prerequisite campaign(s) are displayed; when none exist, no prerequisite section renders.
- [ ] **TC-008.5 — Shared-character dedupe (display).** Setup: same character required by two teams. *Pass criteria:* the character's gear status is presented consistently (not contradictory) across teams.

#### US-009: Cost-vs-wallet bill + verdict
**Description:** As a commander, I want the total cost to complete an outcome compared against my wallet so I get one clear "can I afford this" answer.

**Acceptance Criteria:**
- [ ] The "Unlock X" view shows a cost table with rows Gold, Cores, Ability Mats, Training XP — each with required, have, and a have/short indicator (bars per mockup).
- [ ] A single top-line verdict: "✅ affordable now" or "⛔ short by X".
- [ ] Aggregates cost across all under-gate characters for all blocking teams (dedupes shared characters).
- [ ] Falls back cleanly to "Add wallet" when no wallet is set.
- [ ] Typecheck/lint passes.

**Test Cases:**
- [ ] **TC-009.1 — Four-row cost table.** *Pass criteria:* the table renders exactly the rows Gold, Cores, Ability Mats, Training XP, each showing required, have, and a have/short bar.
- [ ] **TC-009.2 — Affordable verdict.** Setup: wallet + API balances cover all costs. *Pass criteria:* top-line shows "✅ affordable now" and every row shows a "have" state.
- [ ] **TC-009.3 — Short verdict.** Setup: 9M gold short. *Pass criteria:* top-line shows "⛔ short by 9M gold" and the Gold row shows the shortfall; other covered rows show "have".
- [ ] **TC-009.4 — Cross-team aggregation + dedupe.** Setup: a character appears in two blocking teams. *Pass criteria:* that character's cost is counted exactly once in the totals (no double-count).
- [ ] **TC-009.5 — No wallet fallback.** Setup: no wallet. *Pass criteria:* Gold/Cores rows show "unknown"/"Add wallet"; mats + XP still show real required/have; no false "short" verdict for gold/cores.
- [ ] **TC-009.6 — Totals match sum of parts.** *Pass criteria:* each table total equals the summed per-character `CostBundle` values from US-005 for the under-gate characters.

### Phase 4 — Offers cost side + freshness

#### US-010: Offer cost-in-cores view
**Description:** As a commander, I want offers to show what fraction of my cores they cost so I can judge opportunity cost.

**Acceptance Criteria:**
- [ ] Offers whose cost is in cores show "costs N cores (~X% of your balance)" when a wallet exists.
- [ ] Existing offer value scoring (High/Medium/Low) is unchanged; this is additive.
- [ ] No cores cost shown when wallet absent or offer cost isn't cores.
- [ ] Typecheck/lint passes; offers tests still pass.

**Test Cases:**
- [ ] **TC-010.1 — Percent-of-cores shown.** Setup: wallet cores `6120`; offer costs `340` cores. *Pass criteria:* offer shows "costs 340 cores (~6% of your balance)" (percentage = round(340/6120·100)).
- [ ] **TC-010.2 — Non-cores offer.** Setup: offer cost is not in cores. *Pass criteria:* no cores percentage is shown for that offer.
- [ ] **TC-010.3 — No wallet.** Setup: no wallet. *Pass criteria:* no cores percentage anywhere; offers still render normally.
- [ ] **TC-010.4 — Scoring unchanged.** *Pass criteria:* the High/Medium/Low value label for each offer is identical to pre-feature output; existing offers tests pass.

#### US-011: Staleness nudge
**Description:** As a commander, I want a gentle reminder to reconfirm my balances so the numbers stay trustworthy.

**Acceptance Criteria:**
- [ ] When `confirmedAt` is older than a threshold (e.g. 7 days), the wallet strip shows a subtle "confirm your gold?" nudge with a one-tap edit.
- [ ] Nudge is non-blocking and dismissible; never overwrites values automatically.
- [ ] Typecheck/lint passes.

**Test Cases:**
- [ ] **TC-011.1 — Nudge after threshold.** Setup: `confirmedAt` = 8 days ago (threshold 7). *Pass criteria:* the wallet strip shows the "confirm your gold?" nudge.
- [ ] **TC-011.2 — No nudge before threshold.** Setup: `confirmedAt` = 2 days ago. *Pass criteria:* no nudge shown.
- [ ] **TC-011.3 — One-tap confirm.** Action: tap the nudge. *Pass criteria:* opens the pre-filled input sheet; saving updates `confirmedAt` to now and clears the nudge.
- [ ] **TC-011.4 — Dismissible + non-destructive.** Action: dismiss the nudge without saving. *Pass criteria:* nudge hides for the session and wallet values are unchanged (no auto-overwrite).

---

## Functional Requirements

- **FR-1:** The system must let an authenticated commander store exactly two self-reported currency values: Gold and Power Cores.
- **FR-2:** The system must persist the wallet per account with a last-confirmed timestamp.
- **FR-3:** The wallet must be optional; all planner, cost, and offer views must function without it.
- **FR-4:** Wallet values must always be visibly labeled as self-reported with their confirmation age.
- **FR-5:** The system must compute a full cost bundle (gold, cores, ability mats, training XP) for a character delta and for an aggregated outcome.
- **FR-6:** The system must compare cost bundles against wallet + API-readable balances and report per-resource have/short and an overall verdict.
- **FR-7:** When no wallet exists, gold/cores must be reported as "unknown," never as a false shortfall.
- **FR-8:** Planner event cards must surface an affordability badge when a wallet exists.
- **FR-9:** The "Unlock X" screen must present a cost-vs-wallet table and a single verdict, aggregating and de-duplicating character costs across blocking teams.
- **FR-10:** Offer views must optionally show cost as a percentage of the commander's cores when applicable.

## Non-Goals (Out of Scope)

- **Days-to-afford / income-rate estimation** (deferred — needs an income source; v1 shows only "short by X").
- **Auto-decrement** of the wallet from detected gear/ability changes (deferred — v1 uses manual re-entry + the staleness nudge).
- **Currencies beyond Gold and Power Cores** (no premium/orb currencies in v1).
- Reading Gold/Cores from the API (proven impossible) or scraping them.
- Any purchase/transaction integration with the game.
- Replacing existing readiness, priority, or offer-scoring logic (all additive).

## Design Considerations

- Mobile-first; reuse the app's theme tokens and existing components (readiness bars, character tiles, priority list). Reference mockup: `wallet-integration-mockup.html`.
- The wallet strip is the anchor; the affordability badge is one added line on existing cards; the full-bill screen is a new detail view.
- Purple accent denotes NEW wallet-derived elements in the mockup; final styling should stay consistent with the app, not necessarily keep the purple.

## Technical Considerations

- **Gold cost & training-XP level cost are not yet computed** by `upgrade-calculator.ts`. US-005 must establish the source: verify whether the MSF upgrade/cost book exposes gold per gear promotion and XP per level (probe scripts exist), and encode the training-XP-per-level curve if the API doesn't provide it. This is the main technical unknown — resolve it early in Phase 2.
- Persistence via Prisma/PostgreSQL, consistent with existing models; scope strictly to the authenticated account.
- The gaps route already computes per-encounter readiness; Phase 3 should reuse `NormalizedEncounter[]`/`prerequisites` rather than re-deriving.
- Keep affordability math in pure, unit-tested functions (mirroring `tower-solver`/`investment-priority` patterns) so the API/UI stay thin.
- Backward compatibility: no change to existing planner/offers response shapes; add fields, don't replace.

## Success Metrics

- % of active planner users who set a wallet (adoption).
- Reduction in "how do I afford X" confusion (qualitative user feedback like the messages that seeded this feature).
- Every planner event with a computable cost shows an affordability verdict for wallet users (coverage = 100% of costable events).
- No increase in planner/offers error rates or test failures after rollout.

## Open Questions

1. **Gold-cost sourcing:** Does the MSF cost book expose gold per gear promotion, or must we model it? (Blocks US-005.)
2. **Training-XP curve:** Is per-level XP available from the API, or do we hardcode the known level curve?
3. **Gold precision:** Is `Int` sufficient, or do late-game balances exceed 2^31 and need `BigInt`? (Wallet input likely fine with Int; confirm.)
4. **Badge computation location:** server-side in the gaps route (adds latency) vs client-side after balances load (simpler). Lean client-side for v1.
5. Should the wallet also appear on `/inventory` in v1, or Planner-only first? (Mockup suggests a compact inventory version — likely a fast-follow.)
