# PRD: Dashboard Command Center

## 1. Introduction / Overview

MSF Companion's dashboard currently shows static stats (TCP, roster count, star distribution) and navigation cards. Players visit once and leave — there's nothing actionable pulling them back daily.

This feature transforms the dashboard into a **daily command center** by adding two new widgets:

1. **Daily Farming Targets** — Cross-references campaign node rewards against the player's roster star levels. Two farming types: **yellow star shards** (`SHARD_*` items from regular campaigns like Heroes, Villains, Nexus, Doom, etc.) and **red star promotions** (`RS_*` items from Incursion campaign nodes). Surfaces characters the player should be farming daily because they're not yet at 7 yellow or 7 red stars, prioritized by event urgency, star proximity, and war meta relevance.

2. **War Meta Snapshot** — Shows the top-performing offense and defense team compositions from real game-wide battle data, with a deep comparison showing how the player's roster stacks up against each team's recommended build.

Both widgets click through to full detail pages at `/dashboard/farming` and `/dashboard/war-meta` respectively, keeping these under the existing Dashboard route (the bottom nav bar's 6 tabs are full).

## 2. Goals

- Drive daily return visits by giving players actionable, personalized tasks on every dashboard load
- Eliminate the manual, tedious process of searching through campaign nodes to find farmable characters that aren't maxed
- Surface war/crucible meta data that no other MSF tool provides, with personal roster comparison
- Auto-refresh data on every dashboard visit so information is always current
- Follow existing widget/component patterns (PlannerSummary.tsx) for consistency

## 3. User Stories

### US-001: Daily Farming Targets Widget on Dashboard
**Description:** As a commander, I want to see a widget on my dashboard showing the top 5 characters I should be farming from campaign nodes so that I never miss opportunities to max out characters.

**Acceptance Criteria:**
- [ ] A "Daily Farming Targets" widget appears on the dashboard below the existing PlannerSummary widget
- [ ] Widget displays up to 5 characters with: portrait image, character name, current yellow stars, current red stars, the campaign node where they're farmable (e.g., "Villains 1-3"), and a reason tag ("⚡ Event", "⭐ Close to Max", "⚔️ War Meta")
- [ ] Characters are prioritized in 3 tiers: (1) event-linked characters from `calculatePriorities()`, (2) characters closest to 7★ yellow or red, (3) characters appearing on top war meta teams
- [ ] Widget shows a count of total farming targets (e.g., "14 characters to farm")
- [ ] Widget includes a "View All Farming Targets →" link that navigates to `/dashboard/farming`
- [ ] If no farmable characters are below 7★, widget shows "All campaign characters maxed! 🎉"
- [ ] Widget loads fresh data on every dashboard visit (no stale cache)
- [ ] Widget shows a skeleton loader while data is loading
- [ ] Typecheck/lint passes

### US-002: Daily Farming Targets Full Page
**Description:** As a commander, I want a full page showing all my farmable characters that aren't at 7 yellow or 7 red stars, grouped by priority, so I can plan my daily energy spending.

**Acceptance Criteria:**
- [ ] Page is accessible at `/dashboard/farming`
- [ ] Page has a back link/button that returns to `/dashboard`
- [ ] All characters farmable in campaign nodes that are not at 7 yellow stars OR not at 7 red stars are listed
- [ ] Characters are grouped into 3 priority sections with headers: "Event Priority", "Close to Max", "All Farmable"
- Each character card shows: portrait, name, current yellow stars (e.g., ★★★★☆☆☆), current red stars, campaign node(s) where farmable with reward type indicator (🟡 yellow star shard or 🔴 red star promotion), energy cost per node, reason badge
- [ ] Characters appearing in multiple campaign nodes show all nodes (a character may appear in both regular and Incursion campaigns)
- [ ] Filter bar with options: "All", "Need Yellow Stars", "Need Red Stars", "Event Priority"
- [ ] Page shows total count (e.g., "38 characters across 45 campaign nodes")
- [ ] Page is mobile-responsive (cards stack vertically on narrow viewports)
- [ ] Typecheck/lint passes

### US-003: War Meta Snapshot Widget on Dashboard
**Description:** As a commander, I want to see a quick snapshot of the current war meta on my dashboard so I know which teams are performing best globally.

**Acceptance Criteria:**
- [ ] A "War Meta" widget appears on the dashboard below the Daily Farming Targets widget
- [ ] Widget displays top 3 offense teams with win rate percentage (e.g., "Daredevil Modern — 90.1%")
- [ ] Widget displays top 3 defense teams with hold rate percentage
- [ ] Each team shows a roster match indicator: green (all 5 characters built at competitive level), yellow (3-4 built), red (0-2 built)
- [ ] Team names are derived from the squad's character names (use a readable team label if the characters match a known team, otherwise list first 2-3 character names)
- [ ] Widget includes "View Full Meta →" link that navigates to `/dashboard/war-meta`
- [ ] Widget loads fresh data on every dashboard visit
- [ ] Widget shows a skeleton loader while data is loading
- [ ] Typecheck/lint passes

### US-004: War Meta Full Page — Offense Tab
**Description:** As a commander, I want to see all war offense teams ranked by win rate with my roster comparison so I can decide which teams to build and attack with.

**Acceptance Criteria:**
- [ ] Page is accessible at `/dashboard/war-meta`
- [ ] Page has a back link/button that returns to `/dashboard`
- [ ] Page has 3 tabs: "Offense", "Defense", "Crucible"
- [ ] Offense tab is the default active tab
- [ ] Teams are listed in a ranked table sorted by win rate (highest first)
- [ ] Each row shows: rank number, team composition (5 character names), total battles, wins, win rate percentage
- [ ] Each row is expandable/collapsible — when expanded, shows a detailed roster comparison for each of the 5 characters: character portrait, name, player's current build (gear tier, yellow stars, red stars, ISO-8 class), and a status indicator (green = "built", yellow = "needs work", red = "not owned")
- [ ] "Built" threshold: character is at gear tier 16+, 7 yellow stars, and 5+ red stars
- [ ] "Needs work" threshold: character is owned but below the "built" threshold
- [ ] Sample size shown per team (e.g., "175,302 battles")
- [ ] Page is mobile-responsive
- [ ] Typecheck/lint passes

### US-005: War Meta Full Page — Defense Tab
**Description:** As a commander, I want to see war defense teams ranked by hold rate so I can set better defenses.

**Acceptance Criteria:**
- [ ] Defense tab shows teams from `/game/v1/analysis/war/defense` ranked by hold rate (wins / total)
- [ ] Each row shows: rank, team composition, total placements, successful defenses (wins), hold rate percentage
- [ ] Expandable roster comparison identical to offense tab behavior (US-004)
- [ ] Sample size shown per team
- [ ] Typecheck/lint passes

### US-006: War Meta Full Page — Crucible Tab
**Description:** As a commander, I want to see crucible defense team performance so I can optimize my crucible defense rooms.

**Acceptance Criteria:**
- [ ] Crucible tab shows teams from `/game/v1/analysis/crucible/defense` ranked by hold rate (1 - defeats/defends)
- [ ] Each row shows: rank, team composition, total defenses, defeats, hold rate percentage
- [ ] Expandable roster comparison identical to offense tab behavior (US-004)
- [ ] Typecheck/lint passes

### US-007: Farming Targets API Endpoint
**Description:** As the frontend, I need a backend API that returns the prioritized list of farmable characters cross-referenced with the player's roster.

**Acceptance Criteria:**
- [ ] `GET /api/msf/farming/targets` endpoint exists
- [ ] Response shape: `{ targets: FarmingTarget[], totalCount: number }`
- [ ] Each `FarmingTarget` includes: `characterId`, `characterName`, `portrait`, `currentYellowStars`, `currentRedStars`, `nodes: [{ campaignName, campaignId, chapter, tier, nodeLabel, energyCost, rewardType }]`, `priorityTier` ("event" | "close-to-max" | "farmable"), `priorityReason` (human-readable reason string), `priorityScore` (numeric for sorting)
- [ ] `rewardType` is `"yellowStar"` for `SHARD_*` items (character shards from regular campaigns) or `"redStar"` for `RS_*` items (red star promotions from Incursion campaign nodes)
- [ ] "event" tier: characters returned by `calculatePriorities()` that are also farmable in campaigns
- [ ] "close-to-max" tier: characters with 5 or 6 yellow stars OR 5 or 6 red stars (closest to 7)
- [ ] "farmable" tier: all other campaign-farmable characters below 7 yellow or 7 red stars
- [ ] Within each tier, characters are sorted by score (event tier by priority score, close-to-max by stars descending, farmable alphabetically)
- [ ] Returns 401 if not authenticated
- [ ] Handles MSF API errors gracefully (returns partial data or appropriate error)
- [ ] Typecheck/lint passes

### US-008: War Meta API Endpoint
**Description:** As the frontend, I need a backend API that returns war/crucible meta data with roster comparison.

**Acceptance Criteria:**
- [ ] `GET /api/msf/war-meta` endpoint exists
- [ ] Accepts `?mode=offense|defense|crucible` query parameter (defaults to `offense`)
- [ ] Response shape: `{ teams: MetaTeam[] }`
- [ ] Each `MetaTeam` includes: `rank`, `squad` (array of character IDs), `squadNames` (array of display names), `totalBattles`, `wins`, `winRate` (decimal 0-1), `rosterComparison: [{ characterId, characterName, portrait, owned, gearTier, yellowStars, redStars, iso8Class, status ("built" | "needs-work" | "missing") }]`
- [ ] Teams are pre-sorted by win rate descending
- [ ] Roster comparison maps MSF API character IDs to the player's roster data
- [ ] Returns 401 if not authenticated
- [ ] Handles MSF API errors gracefully
- [ ] Typecheck/lint passes

### US-009: Remove Temporary Raw Explore Endpoint
**Description:** As a developer, I want the temporary `raw` case removed from the explore route so it doesn't stay in production code.

**Acceptance Criteria:**
- [ ] The `raw` case in `src/app/api/msf/explore/route.ts` is removed
- [ ] All other explore endpoint cases continue to work
- [ ] Typecheck/lint passes

## 4. Functional Requirements

- **FR-1:** The farming targets API must scan all 12 campaigns using the existing `farming-service.ts` infrastructure to find both **yellow star shard nodes** (`SHARD_*` reward items from regular campaigns) and **red star promotion nodes** (`RS_*` reward items from Incursion campaign). Each node's reward type must be indicated in the response.
- **FR-2:** The farming targets API must fetch the player's full roster via `/player/v1/roster?charInfo=full` to get `activeYellow` and `activeRed` star counts.
- **FR-3:** The farming targets API must call `calculatePriorities()` from `investment-priority.ts` to identify event-linked characters.
- **FR-4:** Characters at 7 yellow stars AND 7 red stars must be excluded from farming targets.
- **FR-5:** Characters at 5 or 6 yellow stars OR 5 or 6 red stars must be classified as "close-to-max" tier.
- **FR-6:** The war meta API must fetch data from `/game/v1/analysis/war/offense`, `/game/v1/analysis/war/defense`, or `/game/v1/analysis/crucible/defense` based on the `mode` parameter.
- **FR-7:** The war meta API must resolve character IDs from the analysis endpoints to display names using `/game/v1/characters`.
- **FR-8:** The war meta API must cross-reference each team's characters against the player's roster to build the `rosterComparison` field.
- **FR-9:** Both dashboard widgets must refresh data on every dashboard visit (no client-side caching).
- **FR-10:** Both widgets must follow the visual pattern of `PlannerSummary.tsx` — rounded card, header with title + link, skeleton loader.
- **FR-11:** Both detail pages must be under the `/dashboard/` route hierarchy, not as new top-level routes.
- **FR-12:** The war meta detail page tabs must preserve selected tab state when navigating back and forth.
- **FR-13:** Roster match indicator on the war meta widget uses green/yellow/red based on how many of the 5 team members the player has at a competitive build (gear 16+, 7★ yellow, 5+★ red).

## 5. Non-Goals (Out of Scope)

- **No energy budget calculator** — just show the list, keep v1 simple
- **No war offense analysis endpoint** — only defense exists for crucible; offense only for war
- **No push notifications** for farming targets — this is a pull-based widget
- **No alliance-level meta data** — this is personal roster comparison only
- **No historical trend tracking** — no caching war meta data over time (that's a future "Meta Pulse" feature)
- **No store/offers integration** — the `/player/v1/offers` endpoint is gated behind a scope we don't have
- **No new bottom nav tabs** — these are dashboard sub-pages only
- **No modifications to the existing Farming Guide** at `/analyze/farming` — this is a separate, complementary feature
- **No red star level parsing** — `RS_*` items have a level suffix (e.g., `RS_DAREDEVIL_5` = 5 red stars). The API should extract the red star level from the item ID and include it in the node data, but the v1 UI only needs to show "farmable for red stars" without complex level-matching logic

## 6. Design Considerations

- **Widget pattern:** Follow `PlannerSummary.tsx` exactly — `rounded-xl border border-[var(--color-surface-light)] bg-[var(--color-surface)] p-4`, header row with title + "View X →" link, skeleton loader while loading, `data-testid` attributes on all interactive elements.
- **Star display:** Use filled/empty star characters to show current vs. max (e.g., ★★★★★☆☆ for 5/7 yellow). Use different colors for yellow stars (gold) and red stars (red).
- **Priority badges:** Use small colored pill badges: "⚡ Event" (purple), "⭐ Close to Max" (gold), "⚔️ War Meta" (blue).
- **Team names in war meta:** If all 5 characters map to a known team tag (same trait prefix), use that team name. Otherwise, show the first 3 character names + "..." (e.g., "Daredevil, Elektra, Hit-Monkey...").
- **Expandable rows:** Use a chevron icon (▸/▾) to indicate expandability. Smooth expand/collapse animation.
- **Mobile-first:** All cards and tables must work on 375px wide viewports. War meta uses stacked cards on mobile, not horizontal tables.
- **Dashboard layout order:** Welcome header → DailyTipWidget → Stats grid → Star Distribution → Origin Breakdown → **FarmingTargetsWidget** → **WarMetaWidget** → PlannerSummary → Navigation cards.

## 7. Technical Considerations

- **Existing infrastructure to reuse:**
  - `farming-service.ts` — scans all 12 campaigns, extracts character shard rewards, 1-hour server-side cache
  - `investment-priority.ts` — `calculatePriorities()` for event-based character scoring
  - `planner-events.ts` — event fetching and normalization
  - `PlannerSummary.tsx` — widget UI pattern
  - `msfApiFetch()` — authenticated MSF API calls
  - `getValidAccessTokenWithRefresh()` — token management
- **MSF API endpoints:**
  - `/game/v1/episodics/campaign/{id}/{chapter}/{tier}` — node rewards with `characterId`. Regular campaigns have `SHARD_*` items (yellow star shards). Incursion campaign (`INCURSION_CAMPAIGN`) has `RS_*` items (red star promotions with level suffix, e.g., `RS_DAREDEVIL_5` = 5-red-star promotion). Incursion chapters 1&4 drop 5★, chapters 2&5&7 drop 5★+6★, chapters 3&6&8 drop 6★+7★.
  - `/player/v1/roster?charInfo=full` — `activeYellow`, `activeRed`, `gearTier`, `iso8`
  - `/game/v1/analysis/war/offense` — `{ squad[], total, wins }`
  - `/game/v1/analysis/war/defense` — `{ squad[], total, wins }`
  - `/game/v1/analysis/crucible/defense` — `{ squad[], defends, defeats }`
  - `/game/v1/characters` — character ID → display name mapping
- **Character ID mapping:** War meta endpoints return character IDs like `"DaredevilModern"`, `"Elektra"`. The `/game/v1/characters` endpoint provides display names. Roster uses the same IDs.
- **Performance:** The farming targets API will make many MSF API calls to scan campaign nodes. The existing `farming-service.ts` already handles this with caching. War meta endpoints are single calls each. Both APIs should respond within 5 seconds.
- **No deploy:** Build and test locally only. Do not run `azd deploy`. The user will decide when to deploy.

## 8. Success Metrics

- Players who see farming targets on their dashboard have at least one actionable character to farm (>0 targets for accounts with <7★ roster characters)
- Dashboard becomes a daily visit — this is measured by return visits to `/dashboard` relative to other pages
- War meta data loads successfully and shows roster comparison for the authenticated player
- Zero runtime errors from the new API endpoints when MSF API data is available

## 9. Open Questions

- What gear tier / star threshold should define "competitive build" for war meta comparison? (Current proposal: gear 16+, 7 yellow, 5+ red — may need tuning based on community norms)
- Should the farming targets widget account for characters farmable in stores (blitz store, arena store, etc.) in a future version?
- Should war meta data be cached server-side to reduce MSF API load, or always fetched fresh?

## 10. End-to-End Test Cases

### TC-001: Farming Targets Widget Renders on Dashboard
**Story:** US-001
**Preconditions:** User is authenticated with a roster containing characters below 7★ that are farmable in campaigns.
**Steps:**
1. Navigate to `/dashboard`
2. Wait for page to fully load
**Expected:**
- [ ] A widget with heading "Daily Farming Targets" is visible
- [ ] Widget shows up to 5 character entries
- [ ] Each entry shows a character portrait image, name, star rating, and campaign node label
- [ ] Each entry shows a priority reason badge (one of: "⚡ Event", "⭐ Close to Max", "⚔️ War Meta", or "🎯 Farmable")
- [ ] A total count is shown (e.g., "14 characters to farm")
- [ ] A "View All Farming Targets →" link is visible and clickable

### TC-002: Farming Targets Widget — Empty State
**Story:** US-001
**Preconditions:** User has all campaign-farmable characters at 7 yellow stars AND 7 red stars (or mock this scenario).
**Steps:**
1. Navigate to `/dashboard`
**Expected:**
- [ ] Widget shows "All campaign characters maxed! 🎉" message
- [ ] No character cards are rendered
- [ ] "View All Farming Targets →" link is still visible

### TC-003: Farming Targets Widget Click-Through
**Story:** US-001, US-002
**Preconditions:** Widget is rendered with farming targets.
**Steps:**
1. Navigate to `/dashboard`
2. Click "View All Farming Targets →"
**Expected:**
- [ ] Page navigates to `/dashboard/farming`
- [ ] Full farming targets page is displayed
- [ ] A back link/button to `/dashboard` is visible

### TC-004: Farming Targets Full Page Content
**Story:** US-002
**Preconditions:** User is authenticated with farmable characters across multiple priority tiers.
**Steps:**
1. Navigate to `/dashboard/farming`
2. Wait for page to load
**Expected:**
- [ ] Page title "Daily Farming Targets" is visible
- [ ] Characters are grouped under section headers: "Event Priority", "Close to Max", "All Farmable"
- [ ] Each character card shows: portrait, name, yellow stars visualization, red stars visualization, campaign node(s), energy cost
- [ ] Total count is shown at the top
- [ ] Filter bar is visible with options: "All", "Need Yellow Stars", "Need Red Stars", "Event Priority"

### TC-005: Farming Targets Full Page Filters
**Story:** US-002
**Preconditions:** Page is loaded with farming targets.
**Steps:**
1. Navigate to `/dashboard/farming`
2. Click "Need Yellow Stars" filter
3. Verify filtered results
4. Click "Need Red Stars" filter
5. Verify filtered results
6. Click "All" to reset
**Expected:**
- [ ] "Need Yellow Stars" shows only characters below 7 yellow stars
- [ ] "Need Red Stars" shows only characters below 7 red stars
- [ ] "All" shows all farmable characters
- [ ] Character count updates to reflect the active filter

### TC-006: War Meta Widget Renders on Dashboard
**Story:** US-003
**Preconditions:** User is authenticated. War meta API endpoints return data.
**Steps:**
1. Navigate to `/dashboard`
2. Scroll to War Meta widget
**Expected:**
- [ ] A widget with heading "War Meta" is visible
- [ ] Widget shows 3 offense teams with win rate percentages
- [ ] Widget shows 3 defense teams with hold rate percentages
- [ ] Each team has a roster match indicator (green, yellow, or red dot/icon)
- [ ] "View Full Meta →" link is visible and clickable

### TC-007: War Meta Widget Click-Through
**Story:** US-003, US-004
**Preconditions:** War Meta widget is rendered.
**Steps:**
1. Click "View Full Meta →"
**Expected:**
- [ ] Page navigates to `/dashboard/war-meta`
- [ ] Offense tab is active by default
- [ ] Teams are listed with win rates
- [ ] A back link/button to `/dashboard` is visible

### TC-008: War Meta Full Page — Offense Tab
**Story:** US-004
**Preconditions:** User is authenticated.
**Steps:**
1. Navigate to `/dashboard/war-meta`
2. Verify offense tab is active
3. Click to expand the first team row
**Expected:**
- [ ] Teams are listed ranked by win rate (highest first)
- [ ] Each row shows rank, team characters, total battles, wins, win rate percentage
- [ ] Expanded row shows 5 character cards with: portrait, name, player's gear tier, yellow stars, red stars, ISO-8 class
- [ ] Each character card shows a status indicator: green ("built"), yellow ("needs work"), or red ("missing")
- [ ] Sample size is visible (e.g., "175,302 battles")

### TC-009: War Meta Full Page — Tab Switching
**Story:** US-004, US-005, US-006
**Preconditions:** User is on `/dashboard/war-meta`.
**Steps:**
1. Click "Defense" tab
2. Verify defense data loads
3. Click "Crucible" tab
4. Verify crucible data loads
5. Click "Offense" tab
6. Verify offense data reloads
**Expected:**
- [ ] Defense tab shows hold rate instead of win rate
- [ ] Crucible tab shows crucible defense hold rates
- [ ] Tab switching is smooth with no full page reload
- [ ] Active tab is visually distinguished

### TC-010: War Meta Full Page — Roster Comparison Detail
**Story:** US-004
**Preconditions:** User has some characters from a top meta team but not all.
**Steps:**
1. Navigate to `/dashboard/war-meta`
2. Find a team where the user has some but not all characters
3. Expand that team row
**Expected:**
- [ ] Owned characters show their actual gear tier, star levels, and ISO-8 class
- [ ] Missing characters show "Missing" status with red indicator
- [ ] Characters below competitive threshold show "Needs Work" with yellow indicator
- [ ] Characters at competitive threshold show "Built" with green indicator

### TC-011: Farming Targets API — Response Shape
**Story:** US-007
**Preconditions:** User is authenticated.
**Steps:**
1. Call `GET /api/msf/farming/targets`
**Expected:**
- [ ] Response status is 200
- [ ] Response body has `targets` array and `totalCount` number
- [ ] Each target has `characterId`, `characterName`, `portrait`, `currentYellowStars`, `currentRedStars`, `nodes` array, `priorityTier`, `priorityReason`, `priorityScore`
- [ ] `priorityTier` is one of "event", "close-to-max", "farmable"
- [ ] Targets are sorted by tier (event first, then close-to-max, then farmable) and within each tier by score

### TC-012: War Meta API — Response Shape
**Story:** US-008
**Preconditions:** User is authenticated.
**Steps:**
1. Call `GET /api/msf/war-meta?mode=offense`
2. Call `GET /api/msf/war-meta?mode=defense`
3. Call `GET /api/msf/war-meta?mode=crucible`
**Expected:**
- [ ] All responses return status 200
- [ ] Each response has `teams` array
- [ ] Each team has `rank`, `squad`, `squadNames`, `totalBattles`, `wins`, `winRate`, `rosterComparison`
- [ ] `rosterComparison` has 5 entries per team, each with `characterId`, `characterName`, `portrait`, `owned`, `status`
- [ ] Teams are sorted by `winRate` descending

### TC-013: Farming Targets API — Unauthenticated
**Story:** US-007
**Preconditions:** No active session.
**Steps:**
1. Call `GET /api/msf/farming/targets` without authentication
**Expected:**
- [ ] Response status is 401

### TC-014: War Meta API — Unauthenticated
**Story:** US-008
**Preconditions:** No active session.
**Steps:**
1. Call `GET /api/msf/war-meta` without authentication
**Expected:**
- [ ] Response status is 401

### TC-015: Skeleton Loaders on Dashboard
**Story:** US-001, US-003
**Preconditions:** User is authenticated, data has not yet loaded.
**Steps:**
1. Navigate to `/dashboard`
2. Observe the widget area before data arrives
**Expected:**
- [ ] Both farming targets and war meta widgets show animated skeleton loaders
- [ ] Skeletons are replaced by actual content once data arrives
- [ ] No layout shift when content replaces skeletons

### TC-016: Mobile Viewport — Farming Targets Full Page
**Story:** US-002
**Preconditions:** Viewport is 375px wide.
**Steps:**
1. Navigate to `/dashboard/farming` on a 375px viewport
**Expected:**
- [ ] Character cards stack vertically
- [ ] No horizontal overflow or scrollbar
- [ ] Filter bar wraps if needed, all options accessible
- [ ] Text is readable, portraits are not clipped

### TC-017: Mobile Viewport — War Meta Full Page
**Story:** US-004
**Preconditions:** Viewport is 375px wide.
**Steps:**
1. Navigate to `/dashboard/war-meta` on a 375px viewport
2. Expand a team row
**Expected:**
- [ ] Team rows stack vertically as cards (not a wide table)
- [ ] Expanded roster comparison cards are readable
- [ ] Tabs are all visible and tappable
- [ ] No horizontal overflow

### TC-018: Remove Raw Explore Endpoint
**Story:** US-009
**Preconditions:** The `raw` case exists in `src/app/api/msf/explore/route.ts`.
**Steps:**
1. Verify the `raw` case has been removed from the explore route
2. Call `GET /api/msf/explore?endpoint=roster` (or another valid endpoint)
**Expected:**
- [ ] Valid explore endpoints still work
- [ ] `GET /api/msf/explore?endpoint=raw&path=/game/v1/events` returns 400 or ignores the `raw` parameter
- [ ] Typecheck passes
