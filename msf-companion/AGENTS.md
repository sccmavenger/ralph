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
