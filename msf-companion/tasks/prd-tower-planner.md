# PRD: Tower Event Planner

## 1. Introduction/Overview

Tower Events are a permanent recurring game mode in Marvel Strike Force where players battle through 12 nodes (organized as 3 paths × multiple rooms), each with specific character trait requirements. Players must allocate teams strategically because characters go on cooldown after use — meaning you can't reuse them until the next week's unlock.

Currently, players open the tower in-game, look at one room at a time, try to remember their roster, and guess at team allocation. They frequently waste strong teams on easy early rooms, then get stuck on later rooms. There is no companion tool on the market that solves this.

**Tower Planner** gives players a complete overview of every battle's requirements, shows which ones their roster can handle, recommends optimal team assignments, and helps them plan across both weeks.

**Location in app:** `/analyze/tower-planner` (under the Analyze tab, alongside DD Planner, Farming Guide, etc.). When a tower event is active, a promotional card also appears on the Dashboard.

**Mockup:** `mockups/tower-planner-v2.html`

---

## 2. Goals

- Let players see at a glance how many tower battles they can clear with their current roster
- **Automatically optimize** team allocation across all rooms — a constraint solver that distributes the player's best teams so they clear the maximum number of rooms
- Prevent the common mistake of wasting top teams on easy early battles
- Show exactly what upgrades would unlock additional battles (actionable farming targets)
- Provide a clear week 1 / week 2 planning view so players save resources appropriately
- Auto-detect cleared rooms from the API so progress tracking is hands-free
- Track historical tower performance so players can see improvement over time
- Notify players when tower events start and when Week 2 unlocks

---

## 3. User Stories

### US-001: Tower Planner Entry Point
**Description:** As a player, I want to find the Tower Planner easily so that I can plan my tower event.

**Acceptance Criteria:**
- [ ] A "Tower Planner" card appears on the `/analyze` page alongside existing tools (DD Planner, Farming, etc.)
- [ ] Card shows the active tower event name if one is running, or "No active tower" if none
- [ ] Clicking the card navigates to `/analyze/tower-planner`
- [ ] When a tower event is active, a banner/card on `/dashboard` links to the tower planner
- [ ] Route renders correctly on mobile (bottom tab bar visible, content scrollable)
- [ ] Typecheck/lint passes

**Test Requirements:**
- [ ] **E2E (Playwright):** Card renders on `/analyze` page with correct text
- [ ] **E2E (Playwright):** Clicking card navigates to `/analyze/tower-planner` (URL changes, page loads)
- [ ] **E2E (Playwright):** Card shows "No active tower" when no event is active (mocked empty response)
- [ ] **E2E (Playwright):** Card shows tower event name when one is active (mocked response)
- [ ] **E2E (Playwright):** Page layout correct at mobile viewport (390×844) — no horizontal overflow, tab bar visible
- [ ] **Unit (Vitest):** API route for tower events returns correct shape

### US-002: Active Tower Detection
**Description:** As a player, I want the app to automatically detect which tower is currently active so that I don't have to configure anything.

**Acceptance Criteria:**
- [ ] On page load, fetch `/game/v1/events?eventInfo=full&perPage=100` and identify tower events (type `pickYourPoison` with name containing "tower" or matching known tower event IDs)
- [ ] Cross-reference event with `/game/v1/survivalTowers` to get tower layout (rays, rooms, combatNodesPerTeam)
- [ ] Display tower name, end date, and which week is currently active (based on event startTime vs now)
- [ ] If no tower event is active, show an empty state: "No tower event running right now. Check back when one starts."
- [ ] Cache tower data for the session (don't refetch on every navigation)
- [ ] Typecheck/lint passes

**Test Requirements:**
- [ ] **Unit (Vitest):** Tower detection logic correctly identifies `pickYourPoison` type events as tower events
- [ ] **Unit (Vitest):** Tower detection ignores non-tower `pickYourPoison` events
- [ ] **Unit (Vitest):** Week calculation returns 1 or 2 based on event startTime vs current date
- [ ] **Unit (Vitest):** API route returns tower data in expected shape (name, endDate, currentWeek, layout)
- [ ] **E2E (Playwright):** Empty state renders when no tower is active (mocked empty events response)
- [ ] **E2E (Playwright):** Tower name and "Week 1" / "Week 2" label display correctly
- [ ] **E2E (Playwright):** End date displays in human-readable format

### US-003: Per-Room Requirements Fetch
**Description:** As a logged-in player, I want to see what characters each battle requires so that I know what I need.

**Acceptance Criteria:**
- [ ] Fetch player-specific tower data from `/player/v1/survivalTowers/{towerId}` (with user's auth token) to get per-room trait requirements
- [ ] Each room displays: required traits (e.g., "Mutant"), minimum gear tier, minimum star level, minimum character level
- [ ] Rooms are listed in a linear vertical list (not a 3-column grid), ordered by path (A1→A5, B1→B5, C1→C2)
- [ ] Week 2 rooms shown below a divider with unlock date
- [ ] If the player endpoint returns 403/error, show a message explaining they need to be logged in
- [ ] Typecheck/lint passes

**Test Requirements:**
- [ ] **Unit (Vitest):** API route correctly passes user auth token to MSF player endpoint
- [ ] **Unit (Vitest):** API route returns 401 when user is not authenticated
- [ ] **Unit (Vitest):** Room data is parsed and returned in correct order (A1→A5, B1→B5, C1→C2)
- [ ] **E2E (Playwright):** Room cards render in vertical list with trait, gear, star, level info visible
- [ ] **E2E (Playwright):** Week 2 divider is visible with unlock date text
- [ ] **E2E (Playwright):** Error state renders when API returns 403 (mocked 403 response)
- [ ] **E2E (Playwright):** No horizontal scrolling — rooms fit within mobile viewport width

### US-004: Roster Readiness Assessment
**Description:** As a player, I want to see which battles my roster can handle so that I know where I stand.

**Acceptance Criteria:**
- [ ] For each room, filter the player's roster (from latest RosterSnapshot) by that room's trait requirements, gear tier, star level, and character level
- [ ] Each room shows how many eligible characters the player has (e.g., "You have 14 eligible characters")
- [ ] Each room gets a status: "Ready to go" (5+ eligible chars meeting all reqs), "Almost there" (3-4 eligible, or 5 but some below gear/star threshold), "Not possible yet" (fewer than 3 eligible)
- [ ] Summary bar at top shows overall readiness: X battles ready / Y almost there / Z not possible
- [ ] Summary includes a plain-English sentence (e.g., "You can likely clear 10 of 12 battles this tower")
- [ ] Typecheck/lint passes

**Test Requirements:**
- [ ] **Unit (Vitest):** Readiness logic returns "Ready to go" when 5+ characters meet all thresholds
- [ ] **Unit (Vitest):** Readiness logic returns "Almost there" when 3-4 eligible or some below threshold
- [ ] **Unit (Vitest):** Readiness logic returns "Not possible yet" when fewer than 3 eligible
- [ ] **Unit (Vitest):** Summary calculation correctly counts rooms per status category
- [ ] **Unit (Vitest):** Roster filtering correctly matches traits AND gear/star/level minimums (not just traits)
- [ ] **E2E (Playwright):** Summary bar renders at top of page with correct counts
- [ ] **E2E (Playwright):** Each room card shows status badge with correct color (green/yellow/red)
- [ ] **E2E (Playwright):** Status text matches expected labels ("Ready to go", "Almost there", "Not possible yet")
- [ ] **E2E (Playwright):** Eligible character count displays on each room card

### US-005: Auto-Optimize Team Allocation
**Description:** As a player, I want the app to automatically assign the best team to every room so that I clear the maximum number of battles without manual planning.

**Acceptance Criteria:**
- [ ] A constraint solver allocates teams across ALL rooms simultaneously (not room-by-room greedy)
- [ ] Solver maximizes total rooms clearable — avoids wasting strong characters on rooms that weaker characters could handle
- [ ] Solver respects: trait requirements, gear/star/level minimums, and one-use-per-week cooldown constraint
- [ ] Cross-references `teamOrder/tower` meta data to prefer proven team compositions when power levels are similar
- [ ] Hitting "Pick My Teams" runs the solver and populates all room assignments at once
- [ ] Each assigned team shows: character names, total team power, and confidence level ("Strong pick" / "Should work" / "Risky")
- [ ] A "Why this team?" tooltip/expand for each assignment (1-2 sentences explaining the choice)
- [ ] User can override any individual assignment and re-run the solver for remaining rooms
- [ ] Typecheck/lint passes

**Test Requirements:**
- [ ] **Unit (Vitest):** Solver does NOT assign the same character to two rooms in the same week
- [ ] **Unit (Vitest):** Solver assigns weaker teams to easy rooms and saves strong teams for hard rooms (given test fixture with clear power gaps)
- [ ] **Unit (Vitest):** Solver respects trait requirements — never assigns a character that doesn't meet room traits
- [ ] **Unit (Vitest):** Solver respects gear/star/level minimums
- [ ] **Unit (Vitest):** Solver prefers meta teams when power levels are within 10% of each other
- [ ] **Unit (Vitest):** After manual override of one room, re-run correctly excludes those characters
- [ ] **Unit (Vitest):** Solver returns empty assignment for rooms where no valid team exists (instead of crashing)
- [ ] **E2E (Playwright):** "Pick My Teams" button is visible and clickable
- [ ] **E2E (Playwright):** After clicking "Pick My Teams", all room cards populate with team assignments
- [ ] **E2E (Playwright):** Each assigned team shows character names and power level
- [ ] **E2E (Playwright):** Confidence badge ("Strong pick" / "Should work" / "Risky") renders with correct styling
- [ ] **E2E (Playwright):** "Why this team?" expander/tooltip shows explanation text on tap
- [ ] **E2E (Playwright):** Manual override: tapping a room's edit button allows changing assignment

### US-006: Auto-Detect Progress & Manual Fallback
**Description:** As a player, I want my cleared rooms to update automatically so I don't have to manually track progress.

**Acceptance Criteria:**
- [ ] On page load and on manual refresh, poll `/player/v1/survivalTowers/{id}` to detect which rooms have been cleared
- [ ] Cleared rooms are dimmed and show "✓ Cleared" with no further action needed from the user
- [ ] If the API doesn't return clear status (or returns an error), fall back to manual tracking: show a "Mark as Cleared" button per room
- [ ] Manual overrides persist in localStorage keyed by tower event ID
- [ ] Assigned characters from cleared rooms are locked out of other suggestions (same week only)
- [ ] A "Reset All" action clears all manual overrides (with confirmation dialog)
- [ ] Week 2 progress is tracked independently (cooldowns reset between weeks)
- [ ] A "Refresh Progress" button re-polls the API for latest clear status
- [ ] Typecheck/lint passes

**Test Requirements:**
- [ ] **Unit (Vitest):** Progress detection correctly marks rooms as cleared from API response
- [ ] **Unit (Vitest):** Fallback to manual mode when API returns error/403
- [ ] **Unit (Vitest):** Characters from cleared rooms are excluded from solver pool
- [ ] **Unit (Vitest):** Week 2 progress state is independent of Week 1
- [ ] **E2E (Playwright):** Cleared rooms show dimmed styling and "✓ Cleared" text
- [ ] **E2E (Playwright):** "Mark as Cleared" button appears when API data unavailable (mocked error)
- [ ] **E2E (Playwright):** Tapping "Mark as Cleared" dims the room and persists across page reload
- [ ] **E2E (Playwright):** "Reset All" shows confirmation dialog before clearing
- [ ] **E2E (Playwright):** "Reset All" confirmation restores rooms to uncleared state
- [ ] **E2E (Playwright):** "Refresh Progress" button triggers re-fetch (verify loading indicator appears)

### US-007: Upgrade Recommendations
**Description:** As a player, I want to know what upgrades would help me clear more battles so that I can prioritize my farming.

**Acceptance Criteria:**
- [ ] For rooms with status "Almost there," show what specific upgrade is needed (e.g., "Jean Grey needs Gear 17 — she's at G16")
- [ ] Group upgrade recommendations in a "Things That Would Help You" section near the top of the page
- [ ] Each recommendation shows: character name, what's needed, and how close they are
- [ ] For "Not possible yet" rooms, explain why clearly (e.g., "Requires Storm (Mighty) — that's the character you unlock from this tower")
- [ ] Maximum of 5 upgrade recommendations shown (most impactful first)
- [ ] Typecheck/lint passes

**Test Requirements:**
- [ ] **Unit (Vitest):** Upgrade logic identifies correct gap (gear vs star vs level) for "Almost there" characters
- [ ] **Unit (Vitest):** Recommendations sorted by impact — upgrades that unlock the most rooms rank first
- [ ] **Unit (Vitest):** Maximum 5 recommendations returned even when more exist
- [ ] **Unit (Vitest):** "Not possible" rooms generate correct explanation text (missing character vs missing traits)
- [ ] **E2E (Playwright):** "Things That Would Help You" section renders near top of page
- [ ] **E2E (Playwright):** Each recommendation shows character name, current level, and target level
- [ ] **E2E (Playwright):** Section does not render when all rooms are "Ready to go" (no upgrades needed)

### US-008: How It Works / First-Time Experience
**Description:** As a first-time user, I want to understand what tower events are and how this tool helps so that I'm not confused.

**Acceptance Criteria:**
- [ ] On first visit (no localStorage flag set), show a collapsible "How Tower Events Work" section with 3 steps explaining the mode
- [ ] Steps explain: (1) each battle has trait rules, (2) used teams get locked, (3) we plan it for you
- [ ] After first visit, section is collapsed by default but can be expanded
- [ ] All status labels use plain English ("Ready to go", "Almost there", "Not possible yet") — no gaming jargon without context
- [ ] Typecheck/lint passes

**Test Requirements:**
- [ ] **E2E (Playwright):** "How Tower Events Work" section is expanded on first visit (clean localStorage)
- [ ] **E2E (Playwright):** Section is collapsed on subsequent visits (localStorage flag set)
- [ ] **E2E (Playwright):** Tapping collapsed section header expands it, showing 3 steps
- [ ] **E2E (Playwright):** All 3 step texts are visible and readable (no truncation)
- [ ] **E2E (Playwright):** No jargon terms appear without explanation — verify status labels match exact strings

### US-009: Dashboard Active Tower Card
**Description:** As a player visiting my dashboard, I want to see if a tower event is active so that I don't miss it.

**Acceptance Criteria:**
- [ ] When a tower event is active, a card appears in the Dashboard (alongside existing daily-briefing, crucible-meta, etc.)
- [ ] Card shows: tower name, time remaining, and readiness summary (e.g., "You can clear 10/12 battles")
- [ ] Clicking the card navigates to `/analyze/tower-planner`
- [ ] Card does not appear when no tower event is active
- [ ] Typecheck/lint passes

**Test Requirements:**
- [ ] **E2E (Playwright):** Card renders on `/dashboard` when tower event is active (mocked)
- [ ] **E2E (Playwright):** Card shows tower name, countdown, and readiness text
- [ ] **E2E (Playwright):** Clicking card navigates to `/analyze/tower-planner`
- [ ] **E2E (Playwright):** Card is NOT present on dashboard when no tower is active (mocked empty)
- [ ] **Unit (Vitest):** Dashboard API/component correctly conditionally renders tower card based on active event

### US-010: Push Notifications for Tower Events
**Description:** As a player, I want to be notified when a tower event starts and when Week 2 unlocks so that I don't miss the window.

**Acceptance Criteria:**
- [ ] When a new tower event becomes active, send a push notification: "[Tower Name] is live — see your plan"
- [ ] When Week 2 rooms unlock (based on event timing), send notification: "Week 2 unlocked — your teams are refreshed"
- [ ] Notifications link directly to `/analyze/tower-planner`
- [ ] Notifications respect the user's existing notification preferences (can be disabled)
- [ ] Use existing notification infrastructure (same as daily briefing notifications)
- [ ] Typecheck/lint passes

**Test Requirements:**
- [ ] **Unit (Vitest):** Notification trigger fires when new tower event detected (comparing previous state)
- [ ] **Unit (Vitest):** Week 2 notification fires at correct time based on event timing
- [ ] **Unit (Vitest):** Notifications NOT sent when user has disabled tower notifications in preferences
- [ ] **Unit (Vitest):** Notification payload contains correct title, body, and deep link URL
- [ ] **E2E (Playwright):** Notification preferences toggle for tower events is visible and functional in settings

### US-011: Premium Gate
**Description:** As a product, Tower Planner is a premium-only feature to drive subscription revenue.

**Acceptance Criteria:**
- [ ] Non-subscribed users see the Tower Planner card on Analyze page but hitting it shows a paywall screen
- [ ] Paywall screen shows: feature description, 2-3 key benefits, and a CTA to subscribe
- [ ] Subscribed users (checked via existing subscription status in user profile) access the full feature
- [ ] The Dashboard tower card is visible to all users but links to the paywall for free users
- [ ] Uses existing Stripe subscription check patterns (same as other premium features)
- [ ] Typecheck/lint passes

**Test Requirements:**
- [ ] **Unit (Vitest):** API route returns 403 for non-subscribed users
- [ ] **Unit (Vitest):** API route returns full data for subscribed users
- [ ] **Unit (Vitest):** Subscription check uses existing auth pattern (not a custom check)
- [ ] **E2E (Playwright):** Free user sees paywall screen with feature description and subscribe CTA
- [ ] **E2E (Playwright):** Free user cannot access tower planner content behind paywall
- [ ] **E2E (Playwright):** Subscribed user sees full tower planner (no paywall)
- [ ] **E2E (Playwright):** Dashboard card links to paywall (not planner) for free users
- [ ] **E2E (Playwright):** Subscribe CTA button is tappable and navigates to subscription flow

### US-012: Tower History & Performance Tracking
**Description:** As a player, I want to see how I performed in past tower events so that I can track my improvement.

**Acceptance Criteria:**
- [ ] When a tower event ends, save a TowerResult record to the database: tower event ID, total rooms cleared, rooms per week, date
- [ ] A "History" tab or section on the tower planner page shows past results in reverse chronological order
- [ ] Each history entry shows: tower name, date, rooms cleared (e.g., "10/12"), and comparison to previous ("↑2 from last time")
- [ ] Simple trend visualization (text-based or small bar) showing improvement over time
- [ ] History is viewable even when no tower is currently active
- [ ] Requires a new DB model/table for TowerResult
- [ ] Typecheck/lint passes

**Test Requirements:**
- [ ] **Unit (Vitest):** TowerResult record saved with correct fields when tower event ends
- [ ] **Unit (Vitest):** History API returns results in reverse chronological order
- [ ] **Unit (Vitest):** Comparison calculation correct ("↑2 from last time" when current - previous = 2)
- [ ] **Unit (Vitest):** History API returns empty array (not error) for user with no past results
- [ ] **E2E (Playwright):** History section renders past results with tower name, date, and rooms cleared
- [ ] **E2E (Playwright):** Comparison arrow (↑/↓) displays correctly relative to previous event
- [ ] **E2E (Playwright):** History is viewable when no tower is active (page still loads)
- [ ] **E2E (Playwright):** Empty state shows friendly message for new users with no history

---

## 4. Functional Requirements

- **FR-1:** The system must fetch active tower events using the MSF API events endpoint and identify them by type `pickYourPoison` with tower-related naming.
- **FR-2:** The system must fetch tower layout from `/game/v1/survivalTowers/{id}` to determine room structure (rays, room IDs).
- **FR-3:** The system must fetch per-room requirements from `/player/v1/survivalTowers/{id}` using the player's authenticated session token.
- **FR-4:** The system must match room requirements against the player's roster data (from the most recent RosterSnapshot in the database).
- **FR-5:** The system must calculate readiness status per room: Ready (5+ eligible meeting all thresholds), Almost (3-4 eligible or some below threshold), Blocked (<3 eligible).
- **FR-6:** The system must fetch tower meta teams from `/game/v1/analysis/teamOrder/tower` and use them to inform recommendations.
- **FR-7:** The system must implement a constraint solver that allocates teams across all rooms simultaneously, maximizing rooms clearable while respecting cooldown constraints (characters used in one room cannot be used in another within the same week).
- **FR-8:** The system must auto-detect cleared rooms by polling the player tower API, falling back to manual tracking when API data is unavailable.
- **FR-9:** Assignment and progress state must persist — auto-detected in API, manual overrides in localStorage keyed by tower event ID, historical results in database.
- **FR-10:** The page must be fully functional on mobile viewports (375px+) with the existing bottom tab bar navigation.
- **FR-11:** The system must use the existing `msfApiFetch` utility for all MSF API calls (handles auth headers automatically).
- **FR-12:** The system must gate access behind the existing premium subscription (Stripe), showing a paywall to free users.
- **FR-13:** The system must send push notifications when tower events start and when Week 2 unlocks, using existing notification infrastructure.
- **FR-14:** The system must persist tower results (rooms cleared per event) in a new database table and display historical performance.

---

## 5. Non-Goals (Out of Scope)

- **No AI-generated team advice** — uses statistical meta data and constraint solving, not LLM calls
- **No tower-specific power level estimates** — don't try to predict if the user will win based on enemy power
- **No sharing/export** — no "share my plan" or screenshot feature
- **No alliance-wide coordination** — this is individual planning only
- **No real-time multiplayer** — no live syncing between alliance members
- **No difficulty toggle** — v1 targets Normal tower only (Omega tower support is a future consideration)

---

## 6. Design Considerations

- **Mockup:** `mockups/tower-planner-v2.html` (approved design direction)
- **Design principles:**
  - Self-explanatory — new users understand it without a tutorial
  - Linear vertical layout — not a grid/map. Each battle is a card in order.
  - Plain English statuses: "Ready to go" / "Almost there" / "Not possible yet"
  - Progressive disclosure — summary at top, detail per-room below
  - Week 2 rooms visible but separated with clear "unlocks on [date]" divider
- **Existing components to reuse:**
  - Page layout from `/analyze/dd-planner` (same parent route pattern)
  - Card components from dashboard
  - Character name display from roster page
  - Loading/error states from existing analyze pages

---

## 7. Technical Considerations

- **API endpoints required:**
  - `GET /game/v1/events?eventInfo=full&perPage=100` — find active tower events (client credentials OK)
  - `GET /game/v1/survivalTowers` — list towers with layout (client credentials OK)
  - `GET /game/v1/survivalTowers/{id}` — tower detail with rays/rooms (client credentials OK)
  - `GET /player/v1/survivalTowers/{id}` — per-room requirements (**requires user auth**)
  - `GET /game/v1/analysis/teamOrder/tower?perPage=200` — meta team data (client credentials OK)
  - Player roster from existing RosterSnapshot in database

- **Known API behavior:**
  - Tower events show as type `pickYourPoison` in events API (NOT type `tower`)
  - `player/v1/survivalTowers` returns 403 with client credentials — must use user's session token
  - Tower layout uses "rays" (paths A/B/C) with room IDs (A1, A2, etc.)
  - `teamOrder/tower` returns ~200 teams with squad (character IDs) and usage total

- **Data flow:**
  - Roster data: already in DB as RosterSnapshot (synced on login)
  - Tower structure: fetch from game API on page load, cache in React state
  - Room requirements: fetch from player API on page load
  - Meta teams: fetch once, cache for session
  - Progress: auto-detected from player API, manual overrides in localStorage
  - History: TowerResult records in database (new table/model needed)
  - Subscription check: existing user profile subscription status

- **New DB model:**
  - `TowerResult`: userId, towerEventId, towerName, roomsCleared, totalRooms, week1Cleared, week2Cleared, completedAt

- **Existing code to leverage:**
  - `src/lib/msf-api.ts` — `msfApiFetch()` for authenticated API calls
  - `src/lib/planner-events.ts` — event fetching patterns (but note: tower events are `pickYourPoison`, not `tower`)
  - `src/lib/snapshots.ts` — roster fetching with character traits
  - `src/app/(app)/analyze/` — existing analyze sub-page patterns

---

## 8. Testing Strategy & Exit Criteria

All user stories must pass the following before being marked complete:

### Test Layers

| Layer | Tool | Location | What it covers |
|-------|------|----------|----------------|
| **Unit / Backend** | Vitest | Co-located `*.test.ts` files | API routes, solver logic, readiness calculations, data transforms |
| **E2E / Frontend + UX** | Playwright | `e2e/tower-planner-*.spec.ts` | Page rendering, navigation, button interactions, UI states, mobile layout |
| **Type Safety** | TypeScript (`tsc --noEmit`) | Whole project | No type errors introduced |
| **Lint** | ESLint | Whole project | No lint violations |

### Exit Criteria (Definition of Done)

A user story is **not complete** until ALL of the following pass:

1. **All unit tests pass** (`npm run test` — Vitest) — zero failures
2. **All E2E tests pass** (`npx playwright test` — Playwright) — zero failures
3. **TypeScript compiles** (`tsc --noEmit`) — zero errors
4. **ESLint passes** (`npm run lint`) — zero errors
5. **Mobile rendering verified** — E2E tests run at 390×844 viewport (iPhone 14 Pro equivalent)
6. **No regressions** — existing test suite still passes (tower planner doesn't break other features)

### Testing Conventions

- **Backend unit tests** go in a `*.test.ts` file co-located with the route/lib file (e.g., `src/app/api/tower/route.test.ts`)
- **E2E tests** go in `e2e/` directory, named `tower-planner-*.spec.ts` (split by concern: `tower-planner-page.spec.ts`, `tower-planner-api.spec.ts`, `tower-planner-solver.spec.ts`)
- **E2E tests mock API routes** using `page.route()` — no live API calls in tests
- **Test data fixtures** use realistic but deterministic data (fixed roster, fixed tower layout)
- **Button/interaction tests** must verify: (1) element is visible, (2) element is clickable/tappable, (3) correct outcome after interaction
- **Error states** must be tested: 403, 500, network timeout, empty responses
- **Loading states** must be tested: skeleton/spinner appears while data loads

### Required E2E Test Files

| File | Covers |
|------|--------|
| `e2e/tower-planner-page.spec.ts` | Page rendering, layout, navigation, mobile viewport, empty states, loading states |
| `e2e/tower-planner-api.spec.ts` | API integration, error handling, auth flows, data fetching |
| `e2e/tower-planner-solver.spec.ts` | "Pick My Teams" interaction, assignment UI, override flow, confidence badges |
| `e2e/tower-planner-progress.spec.ts` | Cleared rooms, manual marking, reset, week transitions |
| `e2e/tower-planner-premium.spec.ts` | Paywall for free users, access for premium users |

### Required Unit Test Files

| File | Covers |
|------|--------|
| `src/lib/tower-solver.test.ts` | Constraint solver logic: allocation, cooldowns, trait matching, edge cases |
| `src/lib/tower-readiness.test.ts` | Readiness calculation: status thresholds, roster filtering, summary counts |
| `src/app/api/tower/route.test.ts` (or similar) | API route: auth, response shape, error handling |
| `src/lib/tower-upgrades.test.ts` | Upgrade recommendation logic: gap detection, sorting, max limit |

---

## 9. Success Metrics

- **Engagement:** 50%+ of active users visit tower planner during an active tower event
- **Utility:** Average user assigns teams to 6+ rooms (indicates they find suggestions useful)
- **Retention:** Users who use tower planner return more frequently during tower event weeks
- **Readiness accuracy:** Users report the readiness assessment matches their in-game experience (qualitative feedback)

---

## 10. Open Questions

1. **Player tower endpoint response shape:** We confirmed `/player/v1/survivalTowers/{id}` exists but returns 403 with client credentials. We need to test the actual response shape with a user token to confirm per-room requirements are included. This may need investigation in the first story.
2. **Tower event identification:** Is checking for `pickYourPoison` type + name containing "tower" sufficient, or do we need a maintained list of tower event IDs?
3. **Roster freshness:** If a player upgrades a character mid-tower, should we prompt them to re-sync their roster? Or just note that data may be stale?
4. **Future: Omega towers** — Both Normal and Omega towers run simultaneously. Should v1 support toggling between them, or just show the Normal difficulty?
