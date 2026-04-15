# PRD: MSF Companion Expansion — Diamond Stars, Caching, Offers, Upgrade Tokens, Time Heists

## 1. Introduction/Overview

This PRD covers five new features for MSF Companion that leverage newly discovered/verified MSF API endpoints and fix existing display bugs:

1. **Diamond Star Display** — Fix a bug where characters with `activeRed` 8-10 (diamond-tier stars) render incorrectly as 7 red stars in 4 components.
2. **Meta Hash Caching** — Infrastructure-level response caching using the `meta.hashes` object returned with every MSF API response. Ships disabled with an admin portal toggle.
3. **Offers Advisor** — Dashboard widget + full page showing the player's current in-game offers with cost-efficiency scoring and "is it worth it" recommendations cross-referenced against roster gaps, farming targets, dark dimension needs, and event requirements.
4. **Upgrade Token Build Guide** — New Analyze page showing upgrade token benchmarks from `/game/v1/upgradeTokens` cross-referenced against the player's roster, with a dropdown to select a token level and see which characters fall short.
5. **Time Heist Guide** — New Analyze page showing all time heist levels with character targets, squads upgraded, feature unlocks, and the player's current TCP at each level.

**Tech Stack:** Next.js 16 App Router, TypeScript, Tailwind CSS, Prisma, PostgreSQL  
**API Reference:** `msf-api/msf-api-undocumented.md` for endpoint response shapes

---

## 2. Goals

- Fix diamond star display bug so characters with `activeRed` 8-10 render correctly across all components
- Reduce redundant MSF API calls by implementing hash-based cache invalidation (disabled by default, admin-toggleable)
- Give players actionable intelligence on which in-game offers are worth buying based on their specific roster needs
- Help players understand upgrade token benchmarks and identify which characters need investment
- Provide a reference guide for all time heist levels with personalized TCP progress

---

## 3. User Stories

### US-132: Fix Diamond Star Rendering in War Meta
**Description:** As a player, I want characters with diamond stars (activeRed 8-10) to display correctly on the War Meta page so that I can see their true star tier.

**Acceptance Criteria:**
- [ ] `WarMetaFullPageClient.tsx` uses the shared `StarDisplay` component from `StarDisplay.tsx` instead of its local copy
- [ ] Characters with `activeRed: 8` show 7 red stars + 1 diamond (◆)
- [ ] Characters with `activeRed: 10` show 7 red stars + 3 diamonds (◆◆◆)
- [ ] Typecheck/lint passes

### US-133: Fix Diamond Star Rendering in Crucible Meta
**Description:** As a player, I want characters with diamond stars to display correctly on the Crucible Meta page.

**Acceptance Criteria:**
- [ ] `CrucibleMetaFullPageClient.tsx` uses the shared `StarDisplay` component instead of its local copy
- [ ] Diamond stars (8-10) render as stars + diamond icons
- [ ] Typecheck/lint passes

### US-134: Fix Diamond Star Rendering in Farming Pages
**Description:** As a player, I want characters with diamond stars to display correctly on the Farming Targets widget and Farming full page.

**Acceptance Criteria:**
- [ ] `FarmingTargetsWidget.tsx` uses the shared `StarDisplay` component instead of its local copy
- [ ] `FarmingFullPageClient.tsx` uses the shared `StarDisplay` component instead of its local copy
- [ ] Diamond stars render correctly in both the dashboard widget and full page
- [ ] Typecheck/lint passes

### US-135: Meta Hash Caching Infrastructure
**Description:** As a system, I want to cache MSF API responses using the `meta.hashes` object so that unchanged data is not re-fetched, reducing API load and improving performance.

**Acceptance Criteria:**
- [ ] A `FeatureFlags` model exists in Prisma schema with `key` (string, unique) and `enabled` (boolean) fields
- [ ] A helper function `isFeatureEnabled(key: string): Promise<boolean>` checks the database for flag status
- [ ] A cache layer stores response data keyed by endpoint + hash
- [ ] When caching is enabled, API calls compare the current `meta.hashes.all` value against the cached hash before making a request
- [ ] If hashes match, the cached response is returned without making an API call
- [ ] If hashes differ or no cache exists, a fresh API call is made and the cache is updated
- [ ] The feature ships DISABLED by default (`meta_hash_caching` flag = false)
- [ ] Typecheck/lint passes

### US-136: Admin Toggle for Meta Hash Caching
**Description:** As an admin, I want a toggle switch in the admin portal to enable/disable meta hash caching without code changes.

**Acceptance Criteria:**
- [ ] Admin dashboard shows a "Feature Flags" section with a pill/toggle switch for "Meta Hash Caching"
- [ ] Toggling the switch immediately updates the `FeatureFlags` database record
- [ ] The toggle reflects the current state on page load (on = enabled, off = disabled)
- [ ] No server restart is required for the change to take effect
- [ ] Typecheck/lint passes

### US-137: Offers API Route
**Description:** As a system, I want an API route that fetches the player's current offers from the MSF API so that the frontend can display them.

**Acceptance Criteria:**
- [ ] `GET /api/msf/offers` returns the player's offers from `/player/v1/offers`
- [ ] Response includes offer `id`, `name`, `description`, `expiration`, `remainingPurchases`, `choices` with rewards/cost
- [ ] If the user hasn't granted the `m3p.f.pr.buy` scope, returns a clear error message indicating re-authentication is needed
- [ ] Handles API errors gracefully (returns appropriate error status)
- [ ] Typecheck/lint passes

### US-138: Offers Value Scoring Engine
**Description:** As a system, I want to score each offer's value based on the player's roster gaps, farming targets, dark dimension needs, and event requirements so that players get personalized "is it worth it" recommendations.

**Acceptance Criteria:**
- [ ] Each offer receives a value score: "High Value", "Medium Value", or "Low Value"
- [ ] Scoring considers: (a) whether offer items match unfilled roster gaps, (b) whether items match active farming targets, (c) whether items help with dark dimension progress, (d) cost-efficiency (items-per-core or items-per-dollar ratio)
- [ ] Each offer includes a text explanation of why it received its score (e.g., "Contains 50 Speedball shards — you need Speedball for New Warriors which has a farming gap")
- [ ] Offers with no relevant items to the player score "Low Value"
- [ ] Typecheck/lint passes

### US-139: Offers Dashboard Widget
**Description:** As a player, I want to see a preview of my top offers on the dashboard so I can quickly see if anything is worth checking.

**Acceptance Criteria:**
- [ ] An `OffersWidget` component appears on the dashboard after the CrucibleMetaWidget
- [ ] Shows up to 3 highest-scored offers with name, value badge (High/Medium/Low), expiration countdown, and cost
- [ ] Each offer row is tappable but links to the full Offers page at `/dashboard/offers`
- [ ] A "View All Offers →" link appears at the bottom
- [ ] Shows a loading skeleton while data loads
- [ ] Shows "No active offers" if the offers array is empty
- [ ] Shows a "Grant access" prompt if the `m3p.f.pr.buy` scope hasn't been authorized
- [ ] Typecheck/lint passes

### US-140: Offers Full Page
**Description:** As a player, I want a full page listing all my current offers with value scores, reward details, cost breakdowns, and expiration timers so I can make informed purchase decisions.

**Acceptance Criteria:**
- [ ] Page accessible at `/dashboard/offers`
- [ ] Shows all active offers sorted by value score (High first)
- [ ] Each offer card shows: name, description, art image, value badge, expiration countdown, remaining purchases, cost (in cores/strike points), and reward items with quantities
- [ ] Each offer has an expandable section showing the scoring explanation
- [ ] "← Back to Dashboard" link at top
- [ ] Loading skeleton while data loads
- [ ] Error state if API fails
- [ ] Typecheck/lint passes

### US-141: Upgrade Token API Route
**Description:** As a system, I want an API route that fetches upgrade token benchmarks and cross-references them with the player's roster.

**Acceptance Criteria:**
- [ ] `GET /api/msf/upgrade-tokens` returns all token levels from `/game/v1/upgradeTokens`
- [ ] Each token level includes `id`, `characterTarget` (level, gearTier, abilities, etc.)
- [ ] Response includes a `rosterComparison` array showing for each token level how many roster characters meet vs don't meet the benchmark
- [ ] Typecheck/lint passes

### US-142: Upgrade Token Build Guide Page
**Description:** As a player, I want to select a token level from a dropdown and see which of my characters don't meet that benchmark so I know who to invest in.

**Acceptance Criteria:**
- [ ] Page accessible at `/analyze/upgrade-tokens`
- [ ] A mode card for "Upgrade Tokens" appears on the Analyze page (alongside Dark Dimension and Farming Guide)
- [ ] Page shows a dropdown to select a token level (UT20, UT25, UT30, etc.)
- [ ] Below the dropdown, shows a summary: "X of Y characters meet this benchmark"
- [ ] Below the summary, lists characters that DON'T meet the benchmark with their current stats vs the benchmark target
- [ ] Each character row shows: portrait, name, current level/gear/abilities vs target, and which stats are deficient (highlighted in red)
- [ ] "← Back to Analyze" link at top
- [ ] Loading skeleton while data loads
- [ ] Typecheck/lint passes

### US-143: Time Heist API Route
**Description:** As a system, I want an API route that fetches all time heist data and the player's TCP at each level.

**Acceptance Criteria:**
- [ ] `GET /api/msf/time-heists` returns all time heist levels from `/game/v1/timeHeists`
- [ ] Each level includes `id`, `characterTarget`, `squadsUpgraded`, `featureUnlocks`, `completionsGranted`, `minLevel`, `playerTargetLevel`
- [ ] Response includes a `playerTcp` map of time heist ID → player's TCP from `/player/v1/timeHeists/{id}/tcp`
- [ ] Typecheck/lint passes

### US-144: Time Heist Guide Page
**Description:** As a player, I want a reference page showing all time heist levels with what they include, the squads they upgrade, features they unlock, and my TCP progress at each level.

**Acceptance Criteria:**
- [ ] Page accessible at `/analyze/time-heists`
- [ ] A mode card for "Time Heists" appears on the Analyze page (alongside Dark Dimension, Farming Guide, and Upgrade Tokens)
- [ ] Shows all time heist levels in order (lowest to highest)
- [ ] Each level card shows: level name, character target stats (level, gear, abilities), min player level required
- [ ] Each level card shows the squads that get upgraded with team names and character lists
- [ ] Each level card shows features that get unlocked
- [ ] Each level card shows the player's current TCP at that level (from the playerTcp data)
- [ ] Expandable sections for completions granted (campaigns/challenges)
- [ ] "← Back to Analyze" link at top
- [ ] Loading skeleton while data loads
- [ ] Typecheck/lint passes

---

## 4. Functional Requirements

**Diamond Stars:**
- FR-1: All star display components must use the shared `StarDisplay` component from `src/app/components/StarDisplay.tsx`
- FR-2: The shared `StarDisplay` must render `activeRed` values 1-7 as red star icons (★) and values 8-10 as red stars plus diamond-shaped icons (◆) using actual diamond shapes, not just the text symbol
- FR-3: Remove all local `StarDisplay` function copies from `WarMetaFullPageClient.tsx`, `CrucibleMetaFullPageClient.tsx`, `FarmingFullPageClient.tsx`, and `FarmingTargetsWidget.tsx`

**Meta Hash Caching:**
- FR-4: Store cached API responses in the PostgreSQL database via Prisma (table: `ApiCache` with fields: `endpoint`, `hashValue`, `responseData`, `cachedAt`)
- FR-5: Before any MSF API call, check if caching is enabled via the `FeatureFlags` table
- FR-6: If enabled, compare the stored hash against the current response's `meta.hashes.all` — if matched, return cached data
- FR-7: The admin portal toggle must use a PATCH API endpoint (`/api/admin/feature-flags`) to update the flag
- FR-8: The caching layer should be applicable to any MSF API call, not just specific endpoints — war meta, crucible, dark dimensions, raids, events, roster, etc.

**Offers Advisor:**
- FR-9: The offers API route must use `msfApiFetch` from `src/lib/msf-api.ts` with proper auth
- FR-10: Value scoring must cross-reference offer item IDs against: roster character IDs (for shard offers), farming target character IDs, dark dimension node requirements, and active event requirements
- FR-11: The dashboard widget follows the same pattern as `WarMetaWidget` and `CrucibleMetaWidget`
- FR-12: Expiration times must show as human-readable countdowns ("2d 5h remaining")
- FR-13: Cost display must show the currency type (Ultra Cores, Strike Points, etc.) and amount

**Upgrade Tokens:**
- FR-14: The comparison engine must check each roster character's `level`, `gearTier`, `basic`, `special`, `ultimate`, `passive`, and `activeYellow` against the token's `characterTarget`
- FR-15: A character "meets" a benchmark only if ALL stats meet or exceed the target
- FR-16: The Analyze page mode card must have a color, letter, and description matching the existing card pattern

**Time Heists:**
- FR-17: TCP values from `/player/v1/timeHeists/{id}/tcp` are single integers (e.g., `165596135`) representing total character power at that level
- FR-18: TCP display must use abbreviated format (e.g., "165.6M")
- FR-19: The Analyze page mode card must be added after the Upgrade Tokens card

---

## 5. Non-Goals (Out of Scope)

- No purchase functionality — we never buy offers, only display them
- No push notifications for expiring offers
- No alliance-wide upgrade token comparison
- No caching of player-specific data (only game data endpoints should be cached)
- No automatic cache invalidation schedule — cache is checked on each request
- No Crucible offense analysis (only defense is available from the API)
- No calendar rewards integration (blocked — valid itemId format unknown)

---

## 6. Design Considerations

**Diamond Stars:**
- Use diamond-shaped SVG icons (◆) in a distinct color (cyan `#06b6d4` or blue `#3b82f6`) to differentiate from red stars
- Diamond icons should be the same size as star icons but clearly diamond-shaped

**Offers Advisor:**
- Value badges use color coding: High = green (#22c55e), Medium = yellow (#f59e0b), Low = gray (#6b7280)
- Offer art images should be displayed as card headers (similar to in-game offer popups)
- Widget on dashboard positioned after CrucibleMetaWidget, before PlannerSummary

**Upgrade Tokens:**
- Deficient stats highlighted in red text, met stats in green
- Token level dropdown at the top of the page, sticky on scroll
- Mode card color: `#8b5cf6` (purple), letter: "U"

**Time Heists:**
- Mode card color: `#14b8a6` (teal), letter: "T"
- Squad sections show character portraits in a horizontal row (reuse existing portrait components)

**Admin Toggle:**
- Feature flags section at the top of the admin dashboard
- Use a pill/switch toggle component with on/off states
- Show last-toggled timestamp

**Existing components to reuse:**
- `StarDisplay` from `src/app/components/StarDisplay.tsx` (for diamond star fix)
- Widget pattern from `WarMetaWidget.tsx`, `CrucibleMetaWidget.tsx`
- Full page pattern from `WarMetaFullPageClient.tsx` (back link, loading skeleton, error state)
- Mode card pattern from `AnalyzePageClient.tsx`
- `msfApiFetch` from `src/lib/msf-api.ts` for API calls
- `getValidAccessTokenWithRefresh` from `src/lib/auth.ts` for auth

---

## 7. Technical Considerations

- **API response shapes** are documented in `msf-api/msf-api-undocumented.md` — reference this for all endpoint data structures
- **Offers endpoint** requires the `m3p.f.pr.buy` OAuth scope (already added to login route)
- **Time Heist TCP** requires individual calls per heist level — use sequential fetching to avoid rate limits
- **Caching** uses PostgreSQL via Prisma rather than in-memory to survive deployments
- **Feature flags** are database-backed so they persist across container restarts
- **472 RESPONSE_TOO_LARGE** errors should be handled with pagination for any new endpoint that returns large datasets

---

## 8. Success Metrics

- Diamond stars display correctly for all characters with `activeRed` > 7 across all pages
- Admin can toggle caching on/off from the admin portal without deploying code
- Players see their current offers with value scores within 5 seconds of page load
- Upgrade token page loads and shows roster comparison within 5 seconds
- Time heist guide page loads and shows all levels with TCP data within 5 seconds
- Zero regression in existing E2E tests (all 22 dashboard-command-center tests continue passing)

---

## 9. Open Questions

- Should the caching layer also apply to the new Offers endpoint, or only game data endpoints?
- What is the appropriate cache TTL before forcing a refresh regardless of hash match? (Suggest: 1 hour)
- Should the Offers widget be hidden entirely if the user hasn't consented to the `m3p.f.pr.buy` scope, or show a prompt to grant access?

---

## 10. End-to-End Test Cases

### TC-001: Diamond Stars Render Correctly on War Meta Page
**Story:** US-132
**Preconditions:** User is authenticated with a roster that includes characters with `activeRed` > 7
**Steps:**
1. Navigate to `/dashboard/war-meta`
2. Wait for team data to load
3. Inspect character cards in the team roster
**Expected:**
- [ ] Characters with `activeRed: 8` show 7 star icons + 1 diamond icon
- [ ] Characters with `activeRed: 10` show 7 star icons + 3 diamond icons
- [ ] Diamond icons are visually distinct from star icons (different shape and/or color)
- [ ] No star display shows more than 7 star icons (stars are capped at 7, extras are diamonds)

### TC-002: Diamond Stars Render Correctly on Crucible Meta Page
**Story:** US-133
**Preconditions:** User is authenticated
**Steps:**
1. Navigate to `/dashboard/crucible-meta`
2. Wait for team data to load
3. Inspect character cards
**Expected:**
- [ ] Diamond stars render correctly (same rules as TC-001)
- [ ] No local StarDisplay function is used (shared component only)

### TC-003: Diamond Stars Render on Farming Pages
**Story:** US-134
**Preconditions:** User is authenticated with farming targets
**Steps:**
1. Navigate to dashboard and observe the Farming Targets widget
2. Navigate to `/dashboard/farming`
3. Inspect character star displays
**Expected:**
- [ ] Dashboard widget shows correct diamond stars for characters with `activeRed` > 7
- [ ] Full farming page shows correct diamond stars
- [ ] Star/diamond rendering matches the roster page display

### TC-004: Admin Feature Flags Toggle Exists
**Story:** US-136
**Preconditions:** User is logged in as admin
**Steps:**
1. Navigate to `/admin/dashboard`
2. Look for "Feature Flags" section
**Expected:**
- [ ] A "Feature Flags" section is visible
- [ ] A toggle labeled "Meta Hash Caching" is present
- [ ] The toggle shows its current state (off by default)

### TC-005: Admin Can Toggle Caching On and Off
**Story:** US-136
**Preconditions:** User is logged in as admin, caching is currently off
**Steps:**
1. Navigate to `/admin/dashboard`
2. Click the "Meta Hash Caching" toggle to enable
3. Verify it shows as enabled
4. Click the toggle again to disable
5. Verify it shows as disabled
6. Refresh the page
**Expected:**
- [ ] Toggle switches between on and off states
- [ ] State persists after page refresh
- [ ] No error messages appear

### TC-006: Offers Widget Loads on Dashboard
**Story:** US-139
**Preconditions:** User is authenticated with `m3p.f.pr.buy` scope granted
**Steps:**
1. Navigate to `/dashboard`
2. Scroll to find the Offers widget
**Expected:**
- [ ] An "Offers" widget section appears on the dashboard
- [ ] Shows up to 3 offers with name, value badge, expiration countdown, and cost
- [ ] Each offer has a value badge color (green/yellow/gray)
- [ ] A "View All Offers →" link is present
- [ ] Widget is positioned after the Crucible Meta widget

### TC-007: Offers Widget Shows Grant Access Prompt
**Story:** US-139
**Preconditions:** User is authenticated but has NOT granted `m3p.f.pr.buy` scope
**Steps:**
1. Navigate to `/dashboard`
2. Scroll to the Offers widget area
**Expected:**
- [ ] Widget shows a prompt indicating the user needs to grant offers access
- [ ] No error stack trace is shown

### TC-008: Offers Full Page Loads
**Story:** US-140
**Preconditions:** User is authenticated with offers scope
**Steps:**
1. Navigate to `/dashboard/offers`
2. Wait for page to load
**Expected:**
- [ ] Page title/heading is visible
- [ ] All active offers are listed, sorted by value score (High first)
- [ ] Each offer card shows: name, description, value badge, expiration countdown, remaining purchases, cost, and reward items
- [ ] "← Back to Dashboard" link is visible and functional
- [ ] Page loads without horizontal overflow on mobile viewport (375px)

### TC-009: Offers Full Page Scoring Explanation
**Story:** US-138, US-140
**Preconditions:** User has active offers
**Steps:**
1. Navigate to `/dashboard/offers`
2. Click/tap to expand an offer's scoring explanation
**Expected:**
- [ ] An explanation section expands showing why the offer received its score
- [ ] Explanation references specific roster gaps, farming targets, or DD needs
- [ ] Section collapses on second click

### TC-010: Offers Widget Links to Full Page
**Story:** US-139, US-140
**Preconditions:** User has active offers on dashboard
**Steps:**
1. Navigate to `/dashboard`
2. Click on an offer row in the Offers widget
**Expected:**
- [ ] User is navigated to `/dashboard/offers`
- [ ] Full offers page loads with all offers visible

### TC-011: Upgrade Token Page Accessible from Analyze
**Story:** US-142
**Preconditions:** User is authenticated
**Steps:**
1. Navigate to `/analyze`
2. Look for "Upgrade Tokens" mode card
**Expected:**
- [ ] An "Upgrade Tokens" mode card is visible with a purple color and "U" letter
- [ ] Card has a description and is clickable
- [ ] Clicking the card navigates to `/analyze/upgrade-tokens`

### TC-012: Upgrade Token Dropdown and Roster Comparison
**Story:** US-142
**Preconditions:** User is authenticated with a roster
**Steps:**
1. Navigate to `/analyze/upgrade-tokens`
2. Select a token level from the dropdown (e.g., UT55)
3. Wait for comparison data
**Expected:**
- [ ] Dropdown shows all available token levels
- [ ] Summary shows "X of Y characters meet this benchmark"
- [ ] Characters below the benchmark are listed with current stats vs target
- [ ] Deficient stats are highlighted (visually distinct from met stats)
- [ ] "← Back to Analyze" link is visible and works

### TC-013: Upgrade Token Page Empty State
**Story:** US-142
**Preconditions:** User is authenticated
**Steps:**
1. Navigate to `/analyze/upgrade-tokens`
2. Select the lowest token level (UT20)
**Expected:**
- [ ] If all characters meet the UT20 benchmark, a success message is shown (e.g., "All characters meet this benchmark!")
- [ ] No empty list or broken layout

### TC-014: Time Heist Page Accessible from Analyze
**Story:** US-144
**Preconditions:** User is authenticated
**Steps:**
1. Navigate to `/analyze`
2. Look for "Time Heists" mode card
**Expected:**
- [ ] A "Time Heists" mode card is visible with a teal color and "T" letter
- [ ] Card has a description and is clickable
- [ ] Clicking the card navigates to `/analyze/time-heists`

### TC-015: Time Heist Guide Shows All Levels
**Story:** US-144
**Preconditions:** User is authenticated
**Steps:**
1. Navigate to `/analyze/time-heists`
2. Wait for data to load
**Expected:**
- [ ] All time heist levels are displayed in order (lowest to highest)
- [ ] Each level shows: character target stats, min player level, squads upgraded, feature unlocks
- [ ] Player's TCP is shown for each level in abbreviated format (e.g., "165.6M")
- [ ] "← Back to Analyze" link is visible and works

### TC-016: Time Heist Expandable Details
**Story:** US-144
**Preconditions:** Time heist page is loaded
**Steps:**
1. Click/tap to expand a time heist level's details
2. View the completions granted section
**Expected:**
- [ ] Completions granted section expands showing campaigns and challenges
- [ ] Each completion shows type (campaign/challenge), name, and chapter/tier
- [ ] Section collapses on second click

### TC-017: Dashboard Renders Without Overflow After New Widgets
**Story:** US-139
**Preconditions:** User is authenticated
**Steps:**
1. Navigate to `/dashboard`
2. Set viewport to 375px width (mobile)
3. Scroll through entire page
**Expected:**
- [ ] No horizontal scrollbar appears
- [ ] All widgets render within the viewport width
- [ ] Offers widget layout is responsive

### TC-018: Offers Page Error Handling
**Story:** US-140
**Preconditions:** User is authenticated but MSF API is unavailable
**Steps:**
1. Navigate to `/dashboard/offers` when the API returns an error
**Expected:**
- [ ] An error message is displayed (not a blank page or crash)
- [ ] "← Back to Dashboard" link still works
- [ ] No unhandled exception in the console

### TC-019: Upgrade Token Page Loading State
**Story:** US-142
**Preconditions:** User is authenticated
**Steps:**
1. Navigate to `/analyze/upgrade-tokens`
2. Observe the page during data load
**Expected:**
- [ ] A loading skeleton is displayed while data loads
- [ ] Skeleton matches the page layout structure
- [ ] No layout shift when data loads

### TC-020: Time Heist Page Loading State
**Story:** US-144
**Preconditions:** User is authenticated
**Steps:**
1. Navigate to `/analyze/time-heists`
2. Observe the page during data load
**Expected:**
- [ ] A loading skeleton is displayed while data loads
- [ ] No layout shift when data loads
