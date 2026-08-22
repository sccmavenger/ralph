<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

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

- Distinguish unavailable data from a valid empty result. API failures must not
  render as zero progress, a maxed roster, "all caught up," or "no events."
- Fetch independent dashboard resources with `Promise.allSettled` so one failed
  service does not discard valid data from another service. Show partial values
  with an unavailable marker and provide an in-place retry action.
- Dashboard navigation E2E tests must suppress or dismiss the install-app prompt
  before clicking page content; the modal intentionally blocks background
  pointer events while it is open.

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
