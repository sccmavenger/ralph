<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Runtime and regression-check boundaries

- M1.2 was accepted and merged in PR #6 (`516fb3c`). Issue #7 authorizes
  M1.3 planning only, on `executive/m1.3-bootstrap-plan`. Keep its completed
  planning PR Draft for Owner review. No implementation, database connection,
  migration, merge, deployment or later story is authorized by that issue.
- M1.3 readiness must inspect successful migration records AND actual enabled
  guards. The M1.2 catalog test helper creates scratch tables; do not reuse it
  unchanged for a SELECT-only operator preflight. Pin committed migration bytes,
  not Windows checkout line endings, and never auto-accept checksum drift.
- Bootstrap replay must preserve existing identities and legitimate later mutable
  state. Serialize all bootstrap inputs with one fixed transaction-scoped lock;
  never derive that lock from an input hash. The existing Agent guard locks Office
  FOR UPDATE, so a future minimal bootstrap role also needs Office UPDATE access.
- `TowerResult` exists in the Prisma schema without a committed creation migration
  at the M1.2 planning baseline. Do not silently fold this historical discrepancy
  into Executive migrations, reset a configured database, or assume replay matches
  the full app schema. Compare existing drift separately from new changes.
- Future Executive DB tests must use an explicitly guarded disposable target,
  never the application Prisma singleton or implicit dotenv/DATABASE_URL. Exclude
  the dedicated DB suite from ordinary web test discovery before adding it.
- Executive schema checks run through `prisma.executive-test.config.ts` and
  `vitest.executive.config.ts`, requiring both named test roles, literal loopback
  port 55432, `NODE_ENV=test`, and the exact run-specific database confirmation.
  A name prefix is not isolation: the hosted job must own the container lifecycle.
- Executive append-only fixtures use transaction rollback. Drain deferred
  constraints before testing TRUNCATE so PostgreSQL's pending-trigger precheck
  cannot mask the guard. RESTART IDENTITY also requires sequence ownership;
  keep its owner-role test separate from non-owner broad-DML guard tests.
- Prisma 7.6.0 single-row `executiveOffice.create` without an explicit ID omits
  its cuid because ID also participates in the optional compound acceptance FK.
  M1.2 client smoke verifies `createManyAndReturn` generates the ID while retaining
  the exact schema. Later bootstrap must use the verified path or separately
  validate an explicit-ID alternative; do not weaken the same-Office FK.
- Both Executive migrations are required before later bootstrap is eligible.
  If the second migration fails, empty tables alone do not establish readiness.
  Verify successful migration records AND enabled SQL guards. M1.2's disposable
  failure rehearsals are not permission to resolve or migrate any shared DB.
- Migration rehearsal copies and baseline-generated clients live only in the
  task's ignored artifact tree and move to CI evidence before application checks.
  They must not become application typecheck/lint/build inputs or committed code.
- The web package targets Node 24. The exact tested patch is in `.node-version`;
  keep the Docker base and knowledge-refresh workflow aligned with that file.
  Runtime compatibility evidence and open verification gates are recorded in
  `docs/executive-office/m1-1-runtime-compatibility.md`.
- Executive Office work is authorized story-by-story. Do not automatically
  advance to the next story. Existing route-group/layout moves must be an isolated
  mechanical change, with route and behavior checks before and after; never
  combine those moves with redesign or unrelated refactoring.
- Run baseline compatibility checks in an isolated source copy without `.env`
  files or captured player credentials. `src/lib/wallet.test.ts` writes to its
  configured database; exclude it unless a disposable test database is provided.
  Root Vitest also discovers legacy Functions tests: use explicit
  `--exclude 'functions/**' --exclude 'src/lib/wallet.test.ts' --maxWorkers=4`
  for web-only, database-independent regression checks.
- Do not use `npm run cleanup` for isolated checks: it can kill unrelated Node
  processes. The default Playwright setup uses captured live credentials and its
  teardown kills the port-3000 listener; use a test-owned server and dummy secrets
  for public smoke checks. Block external browser requests to avoid analytics.
- A successful Windows standalone build/smoke run is not Linux/Alpine container
  verification. Report container build/startup checks separately.
- `.github/workflows/m1-1-container-validation.yml` runs only on the M1.1 branch
  and builds a runner-local image without deployment or registry publication.
  Its test container uses `--network none`, dummy credentials, and loopback
  requests through `docker exec`; preserve that separation from live services.

## MSF API patterns

- Always paginate collection endpoints. In particular, omitting `perPage` from
  `/game/v1/characters` asks the MSF API to return the full catalog and will
  eventually trigger its HTTP 472 `RESPONSE_TOO_LARGE` limit as the catalog
  grows.
- Fetch `/player/v1/roster?charInfo=full` in sequential pages of 25. Larger
  pages can exceed the same response-size limit, while parallel pages can
  trigger transient upstream failures.

## Roster page patterns

- `RosterDashboard` owns the current page's roster fetch. Pass that data into
  `RosterList`; do not fetch the same endpoint again in a child component.
- Roster trait filters are OR within a category and AND across categories
  (for example, BIO + TECH means either origin, while BIO + BLASTER requires
  both an origin and a role match).

## Dashboard patterns

- All signed-in pages share `AppNavigation` (Today/Roster/Resources/Planner/More)
  via `BottomTabBar`. Do not branch the navigation design by pathname; use the
  segment-safe active matching in `app-navigation.ts`. Secondary links, FAQ,
  and sign-out live in More. Public pages and the desktop QR remain separate.
- Keep the JavaScript-only More button disabled in server HTML until hydration;
  otherwise a fast first tap on a hard navigation can be lost before handlers load.

- The signed-in `/dashboard` uses the approved H + G layout: live reward expiry,
  compact self-reported wallet, Collect/Plan/Farm/Check tiles, and collapsed
  roster/mode insights. Preserve the public `/` page and desktop QR screen.
- `dashboard-briefing.ts` derives counts from active offers and claimable
  milestone events. Exclude expired/exhausted offers, label partial data, and
  never use a milestone event end time as an assumed reward-claim deadline.
- The dashboard owns one briefing fetch shared by its expiry panel, Collect
  tile, and inline reward list. Roster/mode widgets mount only when expanded.
- Distinguish unavailable data from a valid empty result. API failures must not
  render as zero progress, a maxed roster, "all caught up," or "no events."
- Fetch independent dashboard resources with `Promise.allSettled` so one failed
  service does not discard valid data from another service. Show partial values
  with an unavailable marker and provide an in-place retry action.
- Dashboard navigation E2E tests must suppress or dismiss the install-app prompt
  before clicking page content; the modal intentionally blocks background
  pointer events while it is open.

## Inventory patterns

- `/player/v1/inventory` defaults to item IDs. Request `itemFormat=object`,
  `quantityFormat=int`, and sequential `page`/`perPage` pages for names, icons,
  and category metadata. Validate `meta.perTotal` and fail incomplete loads.
- Preserve missing balances as `null`, not zero. Unknown quantities sort last
  and are excluded from the in-stock filter; never infer low-stock thresholds
  or upgrade affordability from inventory quantities alone.
- Inventory counts represent distinct item types, not a sum of mixed resource
  units. Preserve Orbs and Currency as distinct categories. Gold/Cores wallet
  balances remain explicitly self-reported in the planner.
- Inventory refresh failures retain the last successful snapshot with a stale
  warning; an initial failure is not a valid empty inventory.

## Dark Dimension Planner patterns

- Every field inside one MSF `CharacterFilter` is ANDed, including
  `anyCharacters`; the array of filters is ORed. `specificCharacters` is a
  separate team-level rule and every listed character must be reserved in the
  recommendation when compliant.
- ISO-8 roster data stores the equipped class in `iso8.active` and its level in
  the class-named field (`iso8.striker`, `iso8.healer`, and so on). There is no
  generic `iso8.level` field.
- Mission-character nodes use a fixed game-provided team and must not fetch or
  recommend the player's roster.
- DD recommendations fetch roster pages sequentially in groups of 25. Treat
  upstream 401 and 403 responses as a one-time token-refresh opportunity.
- MSF `meta.hashes.nodes` and `meta.hashes.chars` changes invalidate every
  `dd:` cache entry, not just the endpoint that observed the new hash.
- Live DD detail payloads expose the sparse map in `rays` and may omit the
  legacy `rooms` object. Derive selectable room IDs and node counts from unique,
  non-empty ray cells; use `rooms` only to enrich metadata when present.
- A DD map's `startingRoomId` is a non-combat entrance. Exclude it from combat
  node counts and selectors; the first remaining room is player-facing Node 1.
- A successful DD room request with an empty `data` object is an unavailable
  upstream payload, not valid zero-enemy intelligence. Return a retryable error
  and do not cache it.
- Node requirements can be a difficulty-indexed array; normalize index 0 for
  the DD planner because it does not expose a difficulty selector.
- DD browser tests should call `suppressInstallPrompt` unless they are testing
  the PWA install sheet itself.
- DD recommendation percentages describe roster readiness (eligible team size,
  available power, and role coverage), never a probability of clearing. Do not
  label them as confidence without observed outcome evidence.
- Never infer that sharing traits with an enemy makes a character a counter.
  Cross-mode value may use `teamOrder` appearances as popularity evidence, but
  must label usage separately from wins and degrade to roster readiness when
  the analysis feed is unavailable.
- Generate node strategy only from facts present in the live node payload
  (composition, roles, stats, ISO-8, and wave triggers). Do not invent passive
  interactions or claim a guaranteed target order when ability evidence is absent.

## Teams page patterns

- Treat the player roster as required Teams data and meta usage as optional.
  Show roster failures with retry UI; when meta fails, keep manual building
  available and never infer that an unverified squad is "Unique."
- Teams-picker filters use OR within a trait category and AND across categories.
  Cosmic is a location trait alongside City and Global, not an origin or a
  named-team trait.
- Do not count the passive owner as one of its own "allies." Match trait names
  on text boundaries and preserve the complete passive description so dotted
  names such as S.H.I.E.L.D. remain intact.
- The combined `/game/v1/analysis/teamOrder` response may exceed the upstream
  size limit. Fall back to sequential, paginated per-mode requests. Fetch player
  roster pages sequentially in groups of 25 and cache global ability-kit data.
- Keep team-order usage separate from performance evidence. `total` on
  `teamOrder` measures popularity; War `total`/`wins` and Crucible
  `defends`/`defeats` provide performance samples. Rank rates with a
  sample-size adjustment and label the confidence instead of treating a tiny
  perfect record as conclusive.
- Teams build readiness is an explicit toolkit benchmark (GT16, 7 yellow,
  5 red), not a guarantee that the team can clear a particular mode.

## Advisor patterns

- Treat every client-supplied conversation ID as tenant-scoped input. Verify
  both Premium entitlement and `commanderId` ownership before reading history
  or writing messages; the conversation detail/list APIs enforce the same rule.
- A fresh Advisor chat has no conversation ID. Omit the field from client
  requests when empty, and treat missing or `null` IDs as a new conversation at
  the API boundary so stricter validation cannot break first-question flows.
- SSE reads can split a JSON event at any byte. Use `SseDataParser` on both the
  Azure OpenAI upstream and browser downstream, and retain unfinished tails
  between chunks.
- Load the newest conversation messages with a descending query plus an
  in-memory reverse. A Prisma child's insert does not refresh its parent's
  `updatedAt`, so explicitly update the conversation when adding messages.
- Shared response-cache entries are allowed only when there is no roster or
  conversation context. Never reuse commander-personalized answers across
  accounts.
- Missing, timed-out, or unhealthy AI configuration returns HTTP 503 so the UI
  shows the honest fallback. Do not turn provider failures into synthetic 200
  "coming soon" answers or consume a free question before provider acceptance.
- Advisor roster fallbacks and login snapshots use sequential pages of 25.
  Reuse `advisor-roster.ts` to normalize both legacy and current snapshots.
- Show source freshness only when a real dated source exists. Default offline
  guidance must identify itself as general guardrails rather than current meta.
- Build all new Advisor evidence with `createKnowledgeDocument`; every document
  needs a stable source ID, publication/ingestion timestamps, content hash,
  pipeline version, lifecycle status, and explicit source type/tier.
- The current MSF character contract uses `abilityKit` (request
  `abilityKits=full`), `traits` (request `traitFormat=id`), and
  `iso8ClassAdoption` (request `charAdoption=full`). Page full kits in groups of
  10 because some 25-row pages exceed the upstream response limit.
- Analysis endpoints return a `squad` array. War performance is `wins / total`;
  Crucible defensive holds are `(defends - defeats) / defends`. Usage volume is
  popularity evidence, not success evidence.
- The official updates HTML page is client rendered. Ingest the Twill services
  at `/services/twill/getArticles` and `/services/twill/getArticle`, retaining
  the article's actual publication date.
- Creator discovery uses the verified registry in `kb-creators.ts`, the uploads
  playlist API when a YouTube key is available, and RSS only as a fallback.
  Fetch captions with `yt-dlp` first and `youtube-transcript` second.
- Advisor retrieval is hybrid only when an embedding deployment is configured;
  keyword retrieval is the availability fallback. Search must exclude system
  and non-active lifecycle documents and infer legacy provenance accurately.

## Email digest patterns

- Newly detected character API records can be summoned units (`Summon` trait),
  not newly unlockable roster characters. Preserve that distinction in alerts.
- Official `costumes.*.fullArt` is optional, and newly published ability-icon
  URLs can return 404. Use a verified portrait fallback and omit unavailable
  icons; never invent asset URLs or silently substitute another costume.
- New-character spotlight assets are embedded once per character through
  `prepareCharacterEmailAssets`; keep time/size bounds, the official-host
  allowlist, and existing delivery idempotency keys. Do not trigger sync or
  replay historical alerts merely to verify a presentation-only deployment.
- A delivery or verification notification is test infrastructure, never weekly
  digest content. Filter test and verification records before deciding whether
  a commander has anything worth emailing.
- Weekly reports must be assembled from data that is actually produced: roster
  snapshots, recent Advisor activity, genuine recent alerts, and fresh official
  MSF posts. Do not depend on `DailyTip` until a real producer exists.
- Label roster snapshot dates and warn when they are more than seven days old.
  Never present an old snapshot as current account progress.
- Roster snapshots are created on successful login, so adjacent rows may be
  identical. Do not call the immediately preceding login a weekly comparison.
  Select the newest baseline on or before the 7-day and 30-day cutoffs, show
  its exact date and elapsed days, and phrase a true zero delta as no recorded
  change.
- Email progression visuals must use broadly supported table/div markup rather
  than canvas or JavaScript. If bars use a relative scale, say so and display
  the exact numeric total beside every bar.
- Bulk weekly delivery must require recorded consent provenance and the weekly
  preference, pace provider calls, isolate per-recipient failures, and return a
  failed job status after processing if any delivery failed. Keep idempotency
  versioned so retries cannot duplicate successful sends.
- Graduate weekly reports independently with `WEEKLY_EMAIL_AUTOMATION_MODE`;
  do not enable the global automation mode when the request does not also cover
  daily lifecycle, win-back, and new-character campaigns.
- Graduate new-character alerts independently with
  `NEW_CHARACTER_EMAIL_AUTOMATION_MODE`. Their live audience spans Free and
  Premium tiers, but still requires an enabled account, a usable deduplicated
  mailbox, recorded consent provenance, the category preference, and no prior
  hard bounce, complaint, or provider suppression.
- Cancellation feedback is a dedicated case workflow, not a generic lifecycle
  win-back. Queue only voluntary Stripe cancellations, delay outreach 24 hours,
  cancel it on reactivation, enforce a 180-day mailbox cooldown, and control it
  with the independently fail-closed `CANCELLATION_FEEDBACK_EMAIL_MODE`. Track
  form and manually entered inbox replies in `/admin/cancellation-feedback` so
  feedback can move from new to reviewing, planned, actioned, and closed.
- The established MSF Companion Discord invite is
  `https://discord.gg/2ptFQ2Vefk`; weekly feedback invitations should cover
  praise, suggestions, bug reports, and complaints without displacing the
  personalized roster content.
- Only include active official posts published within the last seven days; if
  no useful section can be built, skip the email instead of sending a shell.
