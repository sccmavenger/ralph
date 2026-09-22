# M1.2 planning — verification and review record

Date: September 22, 2026.
Issue: [#3](https://github.com/sccmavenger/ralph/issues/3).
PR: [#4, Draft](https://github.com/sccmavenger/ralph/pull/4).
Branch: `executive/m1.2-foundation-schema-plan`.
Base: `5b000501fcd500265c8664290dac363cbdfa8634`.

## Outcome and authority

The [detailed plan](m1-2-foundation-schema-plan.md) is complete for Owner review.
It specifies all eleven proposed scalar models, twenty foreign-key relationships,
index/constraint contracts, two named migrations, immutable-history protections,
bootstrap dependencies, recovery, isolated tests, exact future file inventory,
risks and implementation acceptance criteria. This is **planning completion**, not
schema implementation or a database-security certification.

Issue #3 authorizes documentation only. PRs #1 and #2 were already merged when this
branch was created. No schema/migration/application implementation, database
connection, CI execution, deployment, or next-story work occurred for this task.
PR #4 remains Draft; merge and implementation require explicit Owner decisions.

## Every file changed in this planning task

| File | Change |
|---|---|
| `msf-companion/docs/executive-office/m1-plan.md` | Approved M1 source snapshot, with provenance and current authorization header. Original body preserved after normalizing line endings. |
| `msf-companion/docs/executive-office/m1-2-foundation-schema-plan.md` | Detailed proposed M1.2 implementation contract. |
| `msf-companion/docs/executive-office/m1-2-planning-verification.md` | This actual-checks/review record. |
| `msf-companion/AGENTS.md` | Planning-only approval gate, pre-existing migration discrepancy and safe future DB-test boundaries. |

No Prisma model/migration, application source, runtime/dependency, production
configuration, environment file, workflow, infrastructure or generated client changed.

## Checks actually performed

Environment: local Windows PowerShell; read-only repository/source inspection and
documentation validation. No application, migration, test-container or DB process
was invoked for this issue.

| Check / command | Result | Scope / evidence |
|---|---|---|
| `gh issue view 3 --repo sccmavenger/ralph --json ...` | Passed: planning-only scope and stop gate read | [Issue #3](https://github.com/sccmavenger/ralph/issues/3) |
| `gh pr view 1` / `gh pr view 2`; `git fetch origin`; `git log origin/main` | Both prior PRs MERGED; new branch based on updated main | Base commit above |
| `git diff --check` and final base-to-branch whitespace check | Final checks passed; an extra source-snapshot EOF blank line was detected and removed | Documentation changes only |
| `git diff origin/main --name-only` plus untracked-file inspection | Exactly the four documented files | This PR Files Changed |
| `git diff origin/main -- msf-companion/prisma msf-companion/src msf-companion/package.json msf-companion/package-lock.json .github/workflows` | Empty | No implementation/config/workflow mutation |
| PowerShell Markdown structure assertions | 15 numbered sections, 11 model sections, 20 FK rows, 15 DB-test case groups | Detailed plan |
| PowerShell original-source/snapshot body comparison | Exact equality after CRLF/LF normalization and terminal whitespace normalization | Approved M1 source snapshot |
| `Get-FileHash` on approved M1 source | SHA-256 matches recorded provenance | `01452306db7da7c77407c0b579717993e7d310deae157cd8c976b1dd8f916af5` |
| `rg -n TowerResult msf-companion/prisma` and source counts | Schema references only; 23 models, 24 migration files, 22 CREATE TABLE statements | Baseline finding, not executed migration replay |
| Local Markdown relative-link existence check | Passed: 6 local Markdown links across the three planning documents | Local Markdown references resolve |
| Two independent read-only design reviews | Initial reviews completed; final migration review completed; schema follow-up findings incorporated and checked by author | Schema/integrity and migration/test-safety reviews |

The schema file's local SHA-256 during planning was
`8e72fac428e7845f1119a0b8d8f392cfc59f500409afb3f51a28f5b0528d87a8`.
Git comparison, rather than line-ending-dependent file hashes alone, confirms it
is unchanged from the base. No DB state was inspected to infer live drift.

## Independent review findings and disposition

### Schema/integrity review

- Compound same-Owner/same-Office FKs and supporting unique keys explicitly
  specified; independent valid IDs are insufficient.
- Optional composite keys retain MATCH SIMPLE plus purpose/null checks, avoiding
  MATCH FULL and composite SetNull pitfalls.
- Singleton rules distinguished from later exactly-one bootstrap population.
- History has statement-level UPDATE/DELETE and separate TRUNCATE rejection;
  permanent identities also reject delete/recreate without child rows.
- Office/CEO receipt agreement has an explicit deferred, locked transaction
  invariant; concurrency proof remains an implementation acceptance gate.
- Corrected wording: shared Prisma relation name on both sides, but FK map,
  fields, references and referential actions only on the owning side.
- Corrected timestamp contract: PostgreSQL now() is transaction-start time;
  later receipt insertion supplies coherent acceptedAt/createdAt explicitly.
  Delayed-transaction tests are required.
- Expiring sessions/challenges remain cleanable without deleting acceptance
  history; stale authVersion references remain storable but not authorized.
- Added explicit future re-verification attribution: use the session-bound
  credential, or issue a new session when a different passkey verifies. Do not
  refresh verification while attributing acceptance to the wrong credential.

The schema reviewer supplied follow-up corrections but did not provide a final
re-review sign-off after the last correction. The author incorporated and checked
those corrections; independent Owner/architecture review is still the next gate.

### Migration/test-safety review

- Identified TowerResult migration-history discrepancy and kept it out of scope.
- Dedicated test-only Prisma config and default Vitest discovery exclusion are
  listed explicitly, preventing implicit dotenv/application DB access.
- Test lifecycle includes controlled PostgreSQL 16, distinct disposable roles,
  fail-closed URL validation, fresh/upgrade/repeat/failure/catalog/old-client lanes.
- Recovery preserves history; no blanket reset or mark-applied shortcut.
- Clarified “no shared/live/production migration”; actual disposable PostgreSQL
  migration tests are required during separately authorized implementation.
- All Issue #3 requested planning areas and Owner gates are covered.

These are design reviews, not proof that unimplemented Prisma/SQL/trigger code
compiles or enforces the proposed invariants.

## Checks deliberately not performed

| Check | Reason |
|---|---|
| Prisma validate/generate for proposed models | No schema implementation authorized; only a documentation contract exists |
| Migration creation/application, DB inspection or invariant tests | Explicitly outside Issue #3; no database contacted |
| Build, typecheck, lint, existing Vitest and browser suites | No runtime/application/test code changed; not rerun for documentation-only task |
| Linux/PostgreSQL/container CI | Future test strategy only; no workflow created or run |
| Production/security-role/backup verification | Requires separately approved environment-specific preflight |

Do not report any of these unrun checks as passing. The plan describes future
commands and acceptance cases, not executed evidence.

## Known baseline limitations

The [M1.1 report](m1-1-runtime-compatibility.md) records 9 selected web test failures,
123 lint errors and 36 warnings, plus 26 dependency-audit findings including one
critical. These are historical, unchanged by this task and not independently
retested here. Vulnerability triage remains a separate pre-production gate.

Static inspection additionally found TowerResult in schema but not in committed
creation migrations. This does not establish actual production drift or authorize
repair. Full-schema replay compatibility cannot be claimed until that separately
tracked discrepancy is addressed.

No new regression was observed within documentation checks; application behavior
was not exercised. SQL/Prisma syntax, trigger concurrency, live privileges/version,
faithful Charter transcription and actual Owner authentication remain unverified
and explicitly assigned to later authorized work.

## Security, infrastructure and cost

No secrets, live session captures, auth payloads or database credentials were read
or included in the changed files. No database, cloud resource, production setting,
model invocation, paid-service commitment, deployment or CI job was changed/run.
External writes were the requested Git branch/checkpoint pushes and GitHub review
coordination. Public primary documentation was consulted for PostgreSQL/Prisma
semantics; links are beside the relevant design decisions in the plan.

The proposed schema provides application-level append-only protection, not
administrator-proof immutability or authorization. No security-policy relaxation
or production role/grant change is implied.

## Merge readiness and next gate

**Technically ready for documentation review/merge, subject to Owner approval.**
Only documentation changes; source snapshot and scope checks pass. Keep PR Draft
as requested. No merge has been performed, and no implementation permission is
inferred from technical readiness or a future docs merge.

Owner decision D1: accept the exact plan/refinements or request revisions; then
separately authorize M1.2 implementation if desired. The required [Owner decision
comment](https://github.com/sccmavenger/ralph/pull/4#issuecomment-5786354919) records
the options, recommendation, tradeoffs and pending resolution status.
Stop here. Do not implement M1.2, begin M1.3, merge or deploy automatically.
