# M1.3 planning — verification and Owner review record

Date: September 23, 2026.
Issue: [#7](https://github.com/sccmavenger/ralph/issues/7).
Branch: `executive/m1.3-bootstrap-plan`.
Base: `516fb3c157b703f729fc742a4b13f9ea5deef36a`, accepted M1.2 / merged PR #6.
Review: [Draft PR #8](https://github.com/sccmavenger/ralph/pull/8).

## Outcome and authority

The [detailed plan](m1-3-bootstrap-plan.md) is complete for Owner/architecture review.
It contains proposed contracts only, not implemented bootstrap or passing runtime
evidence. The PR remains Draft and unmerged as Issue #7 requires. No implementation
is authorized. Initial checkpoint `78b6ebc` was committed/pushed before final design
review; the PR head identifies the current reviewed documentation revision.

## Every file changed

| File | Reason |
|---|---|
| `msf-companion/docs/executive-office/m1-3-bootstrap-plan.md` | Detailed proposed M1.3 CLI, readiness, provenance, transactions, replay, audit, recovery, file/test inventory and acceptance contract |
| `msf-companion/docs/executive-office/m1-3-planning-verification.md` | Actual planning checks, review findings, evidence and limitations |
| `msf-companion/AGENTS.md` | Current planning-only gate and discovered readiness/locking/privilege patterns |

No schema, migration, application/runtime source, dependency, lockfile, environment,
workflow, infrastructure or generated client was changed. No DB connection,
container/CI execution, source import, bootstrap or deployment was performed.

## Checks actually performed

- Read Issue #7 and all repository/app instructions; confirmed PR #6 merged and
  created a fresh branch from fetched main at the exact commit above.
- Read the approved M1 plan, accepted M1.2 schema/guards and verification evidence,
  dedicated test harness/configuration, workflow and current package configuration.
- Read the Charter's full body and inspected relevant DOCX structure/footer;
  rechecked original raw-file SHA-256
  `654a4baa4e86743af373f620a8dc156519dada487f3288811b39ae42e5413660`.
  This is source inspection, not completion of faithful Markdown transcription.
- Independent read-only reviewer checked readiness/catalog counts and checksums,
  migration records, privileges, concurrency/replay and isolated test design.
- Inspected generated-client resolution and absent tsx dependency; reviewed Node24
  documentation and upstream tsx release for the proposed explicit runner choice.
  Read-only npm registry metadata confirms 4.23.15 exposes `dist/cli.mjs`; no
  dependency was installed and package/lockfiles are unchanged.

| Check | Result / scope |
|---|---|
| `git diff 516fb3c --check` | Passed; documentation whitespace validation |
| Base-to-working-tree changed-file allowlist | Passed: exactly the three files listed above |
| Restricted source/schema/package/Dockerfile/infra/workflow diff | Empty; no implementation or configuration changes |
| Read-only documentation assertions | Passed: sections 1–16 in order, BOOT-01–BOOT-16, all 5 local relative links resolve, all 16 named PR-template sections present |
| `Get-FileHash` / independent byte read of original DOCX | 40,485 bytes, SHA-256 matches source provenance above |
| Node read-only `git show` buffer hashing | Both committed migration hashes match the plan; 24,557-byte foundation and 11,963-byte guard migration, no Windows line-ending conversion |
| `gh run list --branch executive/m1.3-bootstrap-plan` | No task-branch runs; no workflow executed for this planning PR |
| Independent read-only plan review | Readiness/privilege/replay/source custody and runtime proposals examined; concrete corrections below incorporated |

One initial inline PowerShell documentation-assertion invocation exited without
results; it was replaced with a read-only Node assertion command, which passed all
listed checks. This was a checker invocation issue, not an application test result.
All commands above inspect documentation/Git/source bytes only; no application
server, operator, Prisma command or DB test was executed.

No raw source binary, personal Owner input, credentials, private environment data
or captured player sessions is included in this PR. The original source remains
in Owner-controlled local custody, not uploaded as an artifact.

## Required checks not run

Build, typecheck, lint, web/database tests, migration replay, container verification,
CLI execution, Charter transcription/import, genuine-source rehearsal and live
role/security validation were not run: this is a documentation-only authorization.
The plan specifies future gates, not passing implementation evidence.

Historical M1.2 results are linked in the plan and
[M1.2 verification report](m1-2-foundation-verification.md): 364 dedicated assertions
passed; baseline/candidate web tests 676 passed / 9 failed; lint 123 errors /
36 warnings; typecheck, targeted lint, builds and container smoke passed. M1.1's
26 dependency findings and the known TowerResult migration-history gap remain
unchanged and unremediated. None was rerun or newly certified here.

## Review findings incorporated

- Migration names alone are not readiness; compare successful records and exact
  committed-byte checksums plus all enabled guard definitions/FK enforcement.
- Existing catalog-test normalization writes scratch tables; proposed operator
  checker uses a reviewed static manifest and SELECT-only target inspection.
- Agent's existing Office row lock requires Office UPDATE privilege even in an
  insert-only bootstrap; prove the proposed narrow column grant in future tests.
- Lock key is independent of canonical input/version; reads follow acquisition;
  replay preserves legitimate later mutable Owner/auth/acceptance state.
- Hashes prove identity, not transcription fidelity; add review/custody gate and
  disclose synthetic hosted tests versus full genuine-source CLI proof.
- No-ID Office single-create is not assumed to work; choose M1.2's proven
  createManyAndReturn without changing accepted schema/guards.
- Pinned local runner is an explicit proposed dependency, not unpinned npx download
  or an undocumented native-TypeScript compatibility assumption.
- Final design review required mandatory npm `--silent` (otherwise npm echoes
  private argument paths), explicit local runner path (no global PATH fallback),
  READ ONLY REPEATABLE READ for coherent check-mode snapshots, exact original
  success-event pair cardinality, and unknown audit persistence when commit
  acknowledgment is ambiguous. All were incorporated with explicit future tests.
- The independent reviewer re-read those corrections and reported no blocking
  design defect; Issue #7 coverage is complete. D1–D3 remain Owner choices, and
  all unimplemented runtime/database/source-rehearsal claims remain future gates.
- Clarified that the current inertness flag concerns disabled CEO execution, not
  whether a later legitimate Owner enrollment or Charter acceptance has occurred.

## Issue #7 requirement coverage

| Requested planning content | Detailed plan section |
|---|---|
| Exact operator entry/invocation | 2 |
| Environment, both migrations and enabled guards | 2–3 |
| Serialization/concurrency | 8–9 |
| Canonical input/version/hash | 4 |
| Prisma Office creation limitation/path | 5 |
| Exact pending Owner fields | 5 |
| Exact onboarding CEO/empty authority | 6 |
| Faithful Charter/source/canonical hashes/manifest | 7 |
| Atomic Office/Owner/Charter/CEO/audit transaction | 8 |
| Identical replay/conflicting inputs | 9 |
| Success/import/rejected audit/redaction | 10 |
| Errors/forward recovery | 11 |
| Exact future files | 12 |
| Isolated concurrency/replay/provenance/readiness/rollback tests | 13 |
| Regression/container requirements | 14 |
| Risks/decisions/implementation acceptance | 15–16 |

Required initial-state constraints are explicit in sections 1, 4–8 and 16.
Two initial success events are a visible proposal (import and complete bootstrap),
not a Charter acceptance. No auth or autonomous behavior is introduced.

## Approval gates

Keep the planning PR Draft. Owner review must approve or amend the proposed
contract/runner, disposable-only scope/source transport and Charter review process.
Implementation, documentation merge, real-source transport, live execution and
later stories require their respective explicit approval. Stop after planning.

Owner decision comments, all pending:

- [D1 — contract and local runner](https://github.com/sccmavenger/ralph/pull/8#issuecomment-5805065785).
- [D2 — disposable-only scope and source transport](https://github.com/sccmavenger/ralph/pull/8#issuecomment-5805066018).
- [D3 — fidelity review and future identity inputs](https://github.com/sccmavenger/ralph/pull/8#issuecomment-5805066239).

Technical merge assessment: **Conditional**, documentation-only checks passed;
Owner/architecture approval and separate merge authorization remain required.
No new regression observed within documentation checks. Application behavior is
unchanged by the diff but not re-exercised. No cloud resources, image publication,
CI consumption, production operation or new spending commitment was created.
External writes were limited to the authorized branch, Draft PR and review/issue
comments. Neither planning completion nor a future documentation merge authorizes
M1.3 implementation, any shared/live bootstrap, deployment or M1.4.
