# Executive Office Change

<!--
Keep this PR in Draft while work is incomplete. Complete every section; use
"None" or "Not applicable" with a reason rather than leaving sections blank.
Include enough context to review independently of private Codex conversations.
Do not include secrets, captured sessions, or sensitive production data.
-->

## Milestone / Story

- Milestone/story/bounded task:
- Authorized request or plan reference:
- Branch and current reviewable commit:

## Objective

Describe the intended outcome and how completion will be assessed.

## Scope

- Authorized changes:
- Explicitly out of scope:
- Any proposed scope change and its Owner approval status:

## Files Changed

List every changed file and the reason for the change.

## Database / Migration Changes

List models/migrations and whether anything was applied, to which environment,
and under what authorization. Include data compatibility and rollback concerns.
State explicitly when there are no database changes.

## Configuration Changes

List runtime/dependency versions, environment variable names (never values for
secrets), feature flags, and configuration changes, or explain why none apply.

## Tests Performed

| Command / check | Scope / environment | Evidence link |
|---|---|---|
| | | |

List required tests not run and explain why they were skipped or blocked.

## Results

Report actual pass/fail counts, build/typecheck/lint/container results where
applicable, and acceptance criteria met or outstanding. Distinguish previously
recorded evidence from checks rerun for this change.

## Known Pre-existing Failures

Identify each known baseline failure with evidence; do not treat it as passing or
silently suppress it. State "None observed" only for the scope actually checked.

## New Regressions

List new failures or changed behavior relative to the baseline, or state that no
new regressions were observed within the checks performed.

## Security Review

Describe authentication/authorization, secrets, data access, audit, and dependency
considerations as applicable. State what was reviewed and what was not verified.

## Infrastructure / Cost Impact

Describe resource changes, expected costs, CI usage, external writes, and any
required approval. State explicitly when no infrastructure or production changes
are included; do not infer spending authority from this template.

## Owner Decisions Required

- Unresolved questions:
- Decision comment links and resolution/approval status:

For each decision needing Owner input, also post a PR comment headed
**OWNER DECISION REQUIRED** containing:

- Decision needed:
- Why it matters:
- Available options:
- Codex's recommended option:
- Risks/tradeoffs:
- Work blocked pending the decision: Yes/No, with explanation.

If there are no pending decisions, explicitly say so. Keep received decisions and
their exact authorization scope in the PR, including decisions received in chat.

## Risks / Limitations

List implementation risks, verification gaps, assumptions, and deferred work.
Existing constitutional, governance, learning, security, and milestone rules
remain authoritative; this template does not change architecture or authority.

## Next Proposed Step

State the next proposed action and its authorization requirement. Do not start a
later story/milestone, merge, or deploy just because the current work is complete.

## Merge Readiness

- Safe to merge: Yes / No / Conditional — explain with supporting evidence.
- Owner approval status and applicable approval gate:
- Remaining blockers:
- Deployment authorization: explicitly separate from merge readiness/approval.

- [ ] Work was performed on a non-main branch.
- [ ] Scope matches the authorized task.
- [ ] Required tests were run; results and any skipped/blocked checks are disclosed.
- [ ] No unauthorized production deployment occurred.
- [ ] No later milestone/story was started without authorization.
- [ ] The PR contains all information required for independent review.
