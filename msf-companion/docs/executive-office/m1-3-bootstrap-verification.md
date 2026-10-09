# M1.3 implementation — verification record

## Source-free prepared-release semantic checkpoint — October 9, 2026

**M1.3 remains incomplete and is not ready for acceptance or merge.** This
uncommitted task starts at `418e83c`, the detached workflow checkout of PR #11's
implementation. HEAD is preserved for patch collection. No commit, push, GitHub
write, database connection, cloud operation, Owner ceremony or later story work
occurred. `gh issue view 10 --repo sccmavenger/ralph --json title,body,state`
returned the missing `GH_TOKEN` diagnostic; live issue/PR inspection is not
claimed. Scope was assessed from the checked-in M1 plan, M1.3 bootstrap plan,
verification history, implementation and tests.

Objective: close the semantic validation gap between the fixed-release CLI loader
and the reusable transaction boundary. Previously a matching digest allowed the
service to accept noncanonical Markdown, while its role validator accepted empty
responsibility lists. A digest is byte evidence, not semantic validation or source
approval.

Files and implementation decisions:

- `src/lib/executive/bootstrap.ts`: before opening any transaction, validate
  Markdown as nonblank, valid Unicode, no leading BOM/CR/NUL, exactly one final LF,
  and at most 256 KiB in UTF-8 bytes. Validate descriptive values as nonblank
  Unicode strings without NUL and source name as a bounded basename matching the
  existing audit registry. Validate role canonical serialization within the
  loader's 16 KiB ceiling, with nonempty responsibility and boundary lists and
  nonblank Unicode entries. Retain empty tools/permissions and no spending.
  Replay inspects the same Markdown/role semantics before considering conflict
  auditing; it never repairs stored evidence. CLI provenance verification and
  fixed approved hashes remain required and unchanged.
- `tests/executive/bootstrap-audit.unit.test.ts`: 21 new automated cases cover
  nine invalid Markdown variants with recomputed digests, nine invalid prepared
  release variants, exact UTF-8 byte-limit creation/replay, and two returned-data
  corruption cases proving inconsistent foundation takes priority over conflict
  auditing. Transaction doubles do not establish PostgreSQL behavior.
- `tests/executive/bootstrap.integration.test.ts`: one owned-disposable-PG case
  exercises five malformed content variants in both modes, comparing every
  Executive row and sequence plus business catalogs/sentinels, then checking
  that a valid creation still succeeds. No shared database target is used.
- This verification record supplies durable review context and limitations.

No schema/migration, dependency/lockfile, configuration, workflow, policy, Charter,
manifest, approval receipt or provenance file changed. No privilege, spending or
infrastructure increase is introduced. Validation adds bounded in-memory Unicode
and byte checks; no extra SQL or external service is required. The service still
expects prevalidated approved assets from its caller; these semantic checks do
not independently establish genuine-source provenance.

Actual verification on Linux, Node **24.21.0**:

| Command/check | Result and limitation |
|---|---|
| `npm ci --no-audit --no-fund --fetch-retries=0 --fetch-timeout=15000` in `msf-companion` | Failed with `EAI_AGAIN` resolving `registry.npmjs.org`; required pinned toolchain unavailable. Package/lockfile unchanged. |
| `docker info --format '{{.ServerVersion}}'` | Docker socket access denied; no container/database started or accessed. CLI returned exit 0 despite diagnostic. |
| `node /tmp/m13-prepared-check.cjs` | Existing Functions TypeScript transpiled six source/test files without syntactic diagnostics. 38 direct Node assertion cases passed: 18 malformed prepared variants in both modes reject before transaction, plus two valid Unicode/byte-limit check cases. No DB, pinned Vitest/tsx or semantic typecheck proof. Temporary harness remains outside repository. |
| `git diff --check` | Passed. |

All **22 newly added permanent automated cases remain unrun in the required
toolchain**, including the PostgreSQL case and unit creation/replay/corruption
cases. BOOT-02/03/06 boundary coverage is extended; no BOOT requirement is newly
certified complete. BOOT-01–16 and complete M1.2 preservation, actual transaction/
locking/audit/minimal-role behavior, semantic typecheck, targeted/full lint, web
regressions, build and Linux container startup remain unverified by this run.
Historical failures remain recorded below; supplemental checks cannot establish
absence of new application regressions.

Next proposed action: run pinned unit/operator cases and the complete explicitly
guarded owned-disposable PostgreSQL suite, then finish regression/container
verification. Genuine-source protected check/apply/replay and Owner acceptance
remain mandatory separate gates. Technical merge-readiness: **not ready**;
acceptance, merge, deployment and progression to M1.4 are not claimed.

## Source-free audit persistence checkpoint — October 9, 2026

**M1.3 remains incomplete and is not ready for acceptance or merge.** This
uncommitted task starts at `281db64`, the detached workflow checkout of PR #11's
implementation branch. HEAD is preserved for workflow patch collection; no
commit, push, GitHub write, database connection, production/cloud operation,
Owner ceremony or later milestone work occurred. Live Issue #10/PR #11 inspection
was attempted with `gh issue view 10 --repo sccmavenger/ralph --json title,body,state`
but stopped at the missing `GH_TOKEN` authentication diagnostic. Scope was assessed
from the checked-in M1.3 plan, runtime/tests and existing verification record;
no renewed live issue/PR review is claimed.

Objective: close the conflict-audit persistence verification gap within the
approved BOOT-14 transaction contract. Creation already inspected birth events,
but conflict handling previously trusted the insert acknowledgment alone.

Files and implementation decisions:

- `src/lib/executive/audit.ts`: snapshot/validate the event, validate generated
  identity and positive bigint sequence, then SELECT the inserted row by identity
  using the supplied interactive transaction. Check every event field, exact
  metadata, timestamps, identity and sequence before returning. Missing/altered
  readback fails with the bounded `AUDIT_EVENT_INVALID` error; no raw data enters
  diagnostics. Applies to both success events and conflict attempts.
- `src/lib/executive/bootstrap.ts`: drain deferred constraints in the conflict
  audit phase before returning for commit. Audit readback/constraint failures
  remain non-retryable `AUDIT_WRITE_FAILED`; acknowledgment loss after callback
  completion retains the existing unknown-commit classification.
- `tests/executive/bootstrap-audit.unit.test.ts`: update transaction doubles for
  real readback; six missing/altered-row cases and one service classification
  case. Doubles do not claim PostgreSQL rollback proof.
- `tests/executive/bootstrap-recovery.integration.test.ts`: two disposable-PG
  conflict failure cases verify rollback of the attempted rejection, preservation
  of the existing foundation/history, redaction, identical replay and subsequent
  successful conflict audit. Sequence gaps remain permitted. Readback corruption
  is test-only returned-data injection, never a history update or guard bypass.
- This verification record supplies the durable review/evidence summary.

No schema/migration, dependency/lockfile, target configuration, workflow, policy,
Charter, manifest, approval receipt or provenance file changed. Existing minimal
SELECT/INSERT grants cover the additional read; no authority increase or cost/
infrastructure change is introduced. Two extra SELECTs during initial creation
and one per conflict are the bounded runtime overhead. No PR write was performed,
as explicitly required by this workflow invocation.

Actual verification on Linux, Node **24.21.0**:

| Command/check | Result and limitation |
|---|---|
| `npm ci --no-audit --no-fund --fetch-retries=0 --fetch-timeout=15000` in `msf-companion` | Failed with `EAI_AGAIN` resolving `registry.npmjs.org`; pinned local toolchain unavailable. Package/lockfile unchanged. |
| `docker info --format '{{.ServerVersion}}'` | Socket access denied; no container/database started or accessed. CLI returned exit 0 despite the diagnostic. |
| `node /tmp/m13-audit-check.cjs` | Supplemental existing Functions TypeScript transpilation: six source/test files without syntactic diagnostics; twelve direct Node audit assertions passed (three event types plus nine invalid/read-failure cases). No DB. Neither semantic typecheck nor pinned Vitest/tsx proof. Temporary harness remains outside the repository. |
| `git diff --check` | Passed. |

All **nine newly added automated cases remain unrun in the required toolchain**,
including both actual PostgreSQL cases. BOOT-14 implementation/coverage is extended;
no BOOT requirement is newly certified complete. BOOT-01–16, all M1.2 preservation
checks, actual transaction/locking/audit/role behavior, semantic typecheck,
targeted/full lint, web regressions, builds and Linux container startup remain
unverified by this run. Historical failures remain as recorded below; these
supplemental assertions cannot establish absence of new application regressions.

Next proposed action: run the pinned audit/operator cases and complete explicitly
guarded disposable PostgreSQL suite in the authorized validation environment,
then complete outstanding regression/container evidence. Genuine-source protected
check/apply/replay and Owner acceptance remain mandatory separate gates; no
synthetic run substitutes for them. Technical merge-readiness: **not ready**;
M1.3 acceptance, merge, deployment and progression to M1.4 are not claimed.

## Source-free invocation-boundary checkpoint — October 9, 2026

**M1.3 remains incomplete and is not ready for acceptance or merge.** This
uncommitted task starts at `bf66916` on the detached workflow checkout of
PR #11's implementation branch. HEAD is preserved for patch collection. No
commit, push, GitHub write, database connection, cloud operation, Owner ceremony
or later milestone work occurred. Live Issue #10 could not be read: `gh issue
view 10 --repo sccmavenger/ralph` returned the missing-authentication diagnostic.
The checked-in approved M1 plan, M1.3 contract, operations and existing evidence
were inspected; no renewed live issue/PR review is claimed.

Implementation and review scope:

- `src/lib/executive/bootstrap.ts` captures client, mode and readiness callback
  before the first await. Together with the existing prepared-input clone and
  request-ID capture, both bounded attempts use the same invocation. Caller
  mutation during readiness or retry cannot change check/apply behavior, skip a
  required conflict audit, switch clients or substitute the readiness callback.
- `src/lib/executive/bootstrap-config.ts` returns detached validated target
  metadata and revalidates the complete target at the exported connection
  boundary. An apparently loopback URL cannot accompany a remote driver host,
  different port, migrator role or non-disposable target. Invalid runtime modes
  and check-mode confirmations are rejected with a stable `INVALID_TARGET` error.
- `tests/executive/bootstrap-audit.unit.test.ts` adds three orchestration cases
  for mode/input mutation and retry retention of client/readiness/correlation.
- `tests/executive/bootstrap-input.unit.test.ts` adds eight cases for detached
  metadata, direct invalid targets and the closed mode/confirmation contract.
- `tests/executive/bootstrap.integration.test.ts` adds a real disposable-PG
  read-only check case that mutates caller options after actual check-mode
  readiness and compares every Executive row and sequence before/after.
- This verification record is the durable review summary. No schema, migration,
  dependency, lockfile, workflow, policy, Charter, manifest, approval receipt or
  provenance file changed. No cost or infrastructure change is introduced.

Actual verification on Linux, Node **24.21.0**:

| Command/check | Result and limitation |
|---|---|
| `npm ci --no-audit --no-fund --fetch-retries=0 --fetch-timeout=15000` in `msf-companion` | Failed with `EAI_AGAIN` resolving `registry.npmjs.org`; required local dependencies unavailable. Package/lockfile unchanged. |
| `docker info --format '{{.ServerVersion}}'` | Docker socket access denied; no container started or database accessed. The CLI reported this diagnostic despite returning exit 0. |
| `node /tmp/m13-boundary-check.cjs` | Supplemental temporary harness: seven source/test files transpiled with existing Functions TypeScript, CommonJS/ES2022, without syntactic diagnostics. Fourteen direct Node assertion cases passed for both modes, retry retention, detached target, six invalid target variants, invalid mode/confirmation and valid check/apply configuration. No DB connection. This is neither semantic typecheck nor pinned Vitest/tsx validation. |
| `git diff --check` | Passed. |

The supplemental harness initially exposed an error-code mismatch: unknown target
keys emitted `INVALID_SCHEMA`. The connection boundary now converts target
validation failures to `INVALID_TARGET`; the complete supplemental rerun passed.
The temporary harness stays outside the repository; the permanent automated tests
above contain the reviewable regression cases.

All **12 newly added automated cases remain unrun in the required toolchain**,
including the PostgreSQL test. BOOT-01/04/08/09/14 boundary coverage was extended;
no BOOT requirement is newly certified complete. BOOT-01–16 and M1.2 full-suite
preservation, real transaction/locking/audit/role behavior, pinned operator runtime,
semantic typecheck, targeted/full lint, web regressions, build and Linux container
startup remain unverified by this run. Historical failures remain as recorded
below; no new application regression assessment can be made from these checks.

Next proposed action: run the pinned unit/operator cases and the complete
explicitly guarded disposable PostgreSQL suite in the authorized validation
environment. Genuine-source protected check/apply/replay and Owner acceptance
remain mandatory separate gates. Synthetic evidence does not satisfy them.
Technical merge-readiness assessment: **not ready** until those required checks
and gates are resolved; no merge or deployment authorization is inferred.

## Source-free development checkpoint — October 9, 2026

**M1.3 remains incomplete and is not ready for acceptance or merge.** This
uncommitted patch starts from `ec44006` on the workflow's detached checkout of
PR #11. HEAD was left unchanged; no branch creation, commit, push, GitHub write,
database connection, production action or later milestone work occurred.
`gh issue view 10 --json title,body,state` could not read the live issue because
the session has no GitHub authentication. Scope was assessed from the checked-in
M1.3 plan, operations and verification records, not a renewed live review claim.

Changes in this bounded task:

- `scripts/executive/bootstrap.ts`: guard execution with `require.main === module`
  for the package's pinned CommonJS tsx entry point. Imports must not execute the
  operator, parse arguments, read private files or change the caller's exit code.
- `src/lib/executive/bootstrap.ts`: validate closed prepared/envelope/nested keys
  and Owner display/contact metadata before opening any transaction. A matching
  canonical digest alone no longer admits extra fields or invalid Owner metadata.
  Valid changed bootstrap inputs retain the existing conflict behavior.
- `tests/executive/bootstrap-cli.integration.test.ts`: add real require/dynamic
  import subprocess cases with hostile arguments and a pre-existing exit code.
- `tests/executive/bootstrap-audit.unit.test.ts`: add six rehashed invalid-input
  cases proving rejection before transaction invocation and diagnostic redaction.
- This verification record. No schema, migration, dependency, workflow, policy,
  Charter, manifest, approval receipt or provenance file was changed.

Actual verification on Linux, Node **24.21.0**:

| Command/check | Result and limit |
|---|---|
| `npm ci --no-audit --no-fund` in `msf-companion` | Blocked: `EAI_AGAIN` resolving `registry.npmjs.org`; install incomplete. Package/lockfile unchanged. |
| `docker info --format '{{.ServerVersion}}'` | Blocked: sandbox denies Docker socket access. No container/DB started or existing DB accessed. |
| Supplemental `node node_modules/vitest/vitest.mjs run --config vitest.config.mts` in a secret-free `/tmp` copy using existing Functions Vitest 3.2.4 | Did not reach test collection: missing Linux Rollup native package. This is not the required Vitest 4 suite. No tests reported as passing. |
| Supplemental Node inline `typescript.transpileModule` using existing Functions TypeScript, `CommonJS` / `ES2022` | Eight operator/library files transpiled without syntactic diagnostics in `/tmp`; not a semantic typecheck or pinned-tsx proof. |
| Supplemental Node inline assertions against those transpiled modules | Six rehashed malformed envelopes returned `INPUT_INVALID`, exit 2, no audit and zero transaction calls; one valid synthetic envelope reached a deliberately rejecting transaction double. Seven assertions passed, no DB connection. |
| Direct `node <temporary-transpiled-cli> --help` | HELP JSON returned with exit 0; generated client absent in the temporary source copy. |
| Direct `node -e` require and dynamic import of temporary-transpiled CLI | Both retained deliberately assigned exit 7 and emitted no operator output. Runner environment emitted its existing NO_COLOR/FORCE_COLOR warning. These are supplemental direct-process checks, not the new pinned-tsx subprocess tests. |
| `git diff --check` | Passed. |

A supplemental esbuild attempt could not transpile because existing Functions
dependencies contain the Windows native binary. TypeScript transpilation was
used instead. A child-process supplemental harness also encountered sandbox
`spawnSync EPERM`; its results are not counted as passing. Direct Node invocations
above were then run independently. No dependency or guard was weakened to make
these limitations disappear.

The newly added eight automated cases remain **unrun in the required toolchain**.
BOOT-01–16 completion, actual PostgreSQL transaction/locking/audit/privilege
verification, all M1.2 preservation checks, semantic typecheck, targeted/full
lint, web regressions, build and Linux container startup remain unverified by
this run. Genuine-source protected CLI check/apply/replay and Owner acceptance
remain mandatory separate gates; synthetic assertions do not satisfy them.
Next action: validate this patch with the pinned local runner and complete
disposable PostgreSQL suite in the existing authorized validation environment.

## Current checkpoint — September 24, 2026

**Implementation in progress; not yet ready for M1.3 acceptance or merge.**
The [Owner approval](https://github.com/sccmavenger/ralph/pull/11#issuecomment-5807081719)
resolves G1/G2 and provides standing authorization through M1.8. The approval
receipt is now populated; final canonical manifest SHA-256:
`f452fb4bfa0850bbb2f0d3789db46f1011c8c0de38f6229e00914e49a8985fe6`.
Source/content/role bytes are unchanged from the approved artifact checkpoint.

Implementation adds strict operator input/canonicalization/provenance validation,
transactional bootstrap/audit, and SELECT-only readiness verification. The exact
locked local runner is tsx 4.23.15. No new models or migrations are introduced.
The first narrowly scoped hosted job captures PostgreSQL 16's catalog from the
unchanged accepted migrations for independent review. Its output does not become
trusted automatically; readiness fails closed while the manifest is incomplete.
Full tests, runtime/operator rehearsal, regression/container evidence and the
private-source protected job remain pending. No private source has been uploaded.

Material process choice: keep separate story branches/PRs without merging. Later
stories may be stacked on completed predecessor branches, with exact story-only
commit comparisons recorded alongside the PRs against main. This preserves the
repository's no-merge-without-approval rule and standing implementation authority.
The real-device Owner walkthrough is deferred to final M1 review as authorized.

Additional reversible integrity choice: `.gitattributes` pins **only** the reviewed
Charter Markdown to LF. An isolated Windows archive check exposed automatic CRLF
conversion (6,689 rather than approved 6,557 bytes), which the verifier correctly
rejected. Pinning checkout bytes avoids a broken Windows operator experience;
runtime still rejects altered bytes and never normalizes a Charter at import.
The original approved Markdown blob is unchanged. No general formatting rewrite.

Checkpoint evidence: source-free hosted catalog capture
[35993715966](https://github.com/sccmavenger/ralph/actions/runs/35993715966)
passed at `58196f2`, PostgreSQL 16.15 / Node 24.21.0. Reviewed static manifest
file SHA-256 `8387901a086a371e1096abc0a8cddb1c88d6cdf5b8579b4ad2b8190b8c701993`.
Review compared accepted Git migration bytes, all eight function bodies, FK actions,
trigger modes and exact object counts; artifact is now checked in, never learned
from operator targets. Local isolated Node24 run passed 295 pure/operator-process
tests, typecheck and targeted lint before five additional driver-default tests were
added. Those and the newly written real-DB suite await the next hosted run. No
local database was connected. Lockfile review removes six unrelated optional
Tailwind entries generated by npm; no existing package version is upgraded.

## Historical G1/G2 review checkpoint (superseded status)

Status: **Partial implementation; stop for Owner decisions. Not ready for final
M1.3 acceptance or merge.**

Authorization: [Issue #10](https://github.com/sccmavenger/ralph/issues/10).
Base: `15795cfd9cad5b54bf37a9d945d184841053574d` (approved planning PR #8).
Branch: `executive/m1.3-bootstrap`.
Review: [Draft PR #11](https://github.com/sccmavenger/ralph/pull/11).
Immutable artifact checkpoint: `fd8c0be75d4bdc934a9c303c179820128ef24c08`;
subsequent changes are review/evidence documentation only.
Owner's recorded [D1/D2/D3 approval](https://github.com/sccmavenger/ralph/pull/8#issuecomment-5806414132)
approved the process and bounded implementation, not the exact source transport or
yet-unseen Charter/hash/role artifacts. This first checkpoint follows section 12's
transcription → Owner hash review sequence and the user's stop-at-any-gate instruction.

## What is and is not implemented

Prepared the candidate canonical Charter, closed-schema candidate manifest, exact
descriptive role JSON and operational review instructions. No executable operator,
readiness/transaction/audit service, test suite or workflow has been created yet.
No package/dependency/runtime version changed; tsx 4.23.15 is approved but **not
installed** at this checkpoint. No database was contacted or bootstrap performed.

The manifest is deliberately non-importable: its four review fields are empty
until an actual Owner approval supplies the receipt. No approved/final manifest
hash is claimed. The original source was inspected locally and remains private.

## Every file changed at this checkpoint

| File | Purpose |
|---|---|
| `msf-companion/docs/executive-office/charter/charter-v1.md` | Exact-text canonical Markdown candidate |
| `msf-companion/docs/executive-office/charter/charter-v1.manifest.json` | Provenance/presentation candidate; explicitly missing approval |
| `msf-companion/src/lib/executive/bootstrap-role-v1.json` | Exact role object from approved plan section 6; no consumer or execution |
| `msf-companion/docs/executive-office/operations.md` | G1 exact proposal, G2 review procedure, custody and unresolved gates |
| `msf-companion/docs/executive-office/m1-3-bootstrap-verification.md` | This evidence and limitation record |
| `msf-companion/AGENTS.md` | Issue #10 authorization/sub-gates and pending-manifest safety |

All six paths are in the approved future inventory. No schema, migration, existing
application code, routes/layouts, package/lockfile, Dockerfile, workflow, captured
session, environment file or infrastructure was modified.

## Exact G2 review material

- [Canonical Markdown](charter/charter-v1.md).
- [Candidate manifest](charter/charter-v1.manifest.json).
- [Descriptive CEO role](../../src/lib/executive/bootstrap-role-v1.json).

| Item | Size / SHA-256 |
|---|---|
| Source basename | `MSF_Toolkit_AI_CEO_Charter_and_Governance_Framework.docx` |
| Original DOCX bytes | 40,485 / `654a4baa4e86743af373f620a8dc156519dada487f3288811b39ae42e5413660` |
| Canonical Charter UTF-8/LF bytes | 6,557 / `673560486fa44a687dcddc6395bd4439848225c40f0f42831dc3a21daee3b3e5` |
| Exact role JSON file bytes | 1,026 / `c59c691f058d17a6ce937855562ca11fce12c4e789430d04ccf01a47148ce73b` |
| Canonical role JSON, section-4 algorithm | `3165fa4f4cf09096952ad6ecfb964bf1ba8f2e5783f8bd11d40358bafdc65827` |
| Candidate manifest formatted file bytes | 2,047 / `304e46a03b89a7297949ad4cc64cc7b07db08e299e55f4b897396db80a0f6f59` |
| Candidate manifest canonical review hash | `ad4dcb7d39d011902b2faf053b543b34de5205ed45fee5f26a335864cbe647db` |

The candidate manifest hash above includes the four intentionally empty review
strings and must not be presented as an approved release digest. Canonical JSON
means recursively sorted ASCII keys, retained array
order, JSON.stringify string escaping, UTF-8/no BOM and no final newline. This is
distinct from hashing a formatted JSON file or the raw DOCX ZIP bytes.

## Fidelity evidence and its limits

The source has 89 body paragraphs, one empty; 88 nonempty paragraphs comprise
the exact title/subtitle/body text, twelve numbered Heading1 sections and fifty
ListBullet items. ListBullet inherits numId 1, referencing abstractNumId 8's bullet
format. The Markdown retains literal section numbers, list order and each
nonempty paragraph's text/code points, including the decision-loop double spaces,
arrows, bullet in the subtitle and curly quotation marks.

Reviewed source document XML, used paragraph styles, numbering and document
relationships; repeating footer reads `MSF Toolkit • AI CEO Charter & Governance
Framework`. Footer omission and non-semantic layout changes are explicitly listed
in the manifest, including direct bold subtitle/arrow-sequence/principle emphasis,
the italic tagline and centering/font/color treatment. These presentation choices
remain subject to Owner review, not an assertion of pixel-identical rendering.
No technical-package prose or development commentary was added
to the Charter itself. This is a transcription candidate, not a new constitution.

**Rendered-source fidelity review remains open.** This workstation's inspected
command/installation/Word-registration locations did not provide a Word or
LibreOffice renderer. No document was uploaded to an online converter, no new
renderer was installed and no screenshot/rendering fidelity is falsely claimed.
Owner G2 must compare the actual rendered original and candidate section by
section; if another authorized renderer/reviewer is desired, obtain that direction.
OOXML/text equality is evidence, not a substitute for this human review.

| Source section | Body paragraph range, including heading |
|---|---|
| Title/subtitle | 1–4 |
| 1. Mission | 5–6 |
| 2. CEO Mandate | 7–9 |
| 3. Definition of Success | 10–18 |
| 4. Responsibilities | 19–27 |
| 5. Decision Philosophy | 28–34 |
| 6. Autonomy | 35–45 |
| 7. Owner Approval Boundaries | 46–60 |
| 8. Relationship With the Owner | 61–69 |
| 9. Operating Principle | 70–72 |
| 10. First Assignment | 73–85 |
| 11. Foundational System Principle | 86–87 |
| 12. Implementation Note | 88–89 |

## Actual checks and remaining evidence

| Actual local check | Result |
|---|---|
| Read-only GitHub issue/PR approval and fetched-main inspection | Correct Issue #10 authority; fresh branch from accepted `15795cf` |
| Raw DOCX SHA-256/size; direct OOXML/style/numbering/relationship inspection | Passed; exact source identity, structural evidence above |
| Temporary PowerShell/.NET ordinal paragraph checker | 88/88 nonempty paragraphs, 12/12 headings and 50/50 bullets matched; strict UTF-8/no BOM/LF/one final LF passed |
| Read-only Node JSON and canonical-hash assertions | Role deep-equaled approved section 6; candidate manifest closed keys and four empty review strings confirmed; hashes above match |
| Local artifact bytes versus committed `git show` blob hashes | All three artifact files match their recorded raw SHA-256; no accidental CRLF-based approval hash |
| Git diff allowlist against `15795cf`; protected-path diff | Exactly six approved inventory files; schema/migrations/packages/Dockerfile/infra/workflows unchanged |
| `git diff --cached --check` and base-to-head whitespace check | Passed |
| Markdown/PR structure assertions | All 10 local links resolve; all 16 Executive PR template sections present |
| `gh run list --branch executive/m1.3-bootstrap` | No task-branch CI runs |

The temporary PowerShell checker initially used a culture-sensitive BOM-prefix
comparison and falsely rejected valid bytes. Changing the checker to ordinal
comparison resolved it; all byte/paragraph checks then passed without altering
the Charter. This was a local checker defect, not a runtime/application test.

Independent read-only review confirmed all 88 nonempty paragraphs by ordinal
code-point equality, all 12 headings and 50 bullets, UTF-8/LF rules, and exact
approved role fields/values/array/key ordering. Source inspection found no body
tables, drawings, hyperlinks, tracked changes, fields, hidden text, tabs/breaks,
note/comment references, content controls or alternate-content nodes. Custom XML
contains only an empty bibliography container. The reviewer identified omitted
direct emphasis/centering, now specifically disclosed in the candidate manifest.
This is an OOXML review, not a rendered-source sign-off or Owner approval.

No BOOT-01–BOOT-16 runtime/integration claim is made. These cases, M1.2 regression
preservation, dependency/lockfile review, typecheck/targeted lint/build and Linux
container startup/smoke remain **not run** at this pre-operator gate. A JSON/text
review is not a passing database or application test.

Historical baseline only: [M1.2 evidence](m1-2-foundation-verification.md) recorded
364/364 dedicated tests; selected web tests 676 passed / 9 failed; lint 123 errors /
36 warnings; typecheck, targeted lint, build/container smoke passed. The nine
Tower failures (history 1, events 3, rooms 5), TowerResult migration-history gap
and prior 26 dependency findings are not fixed, waived or rerun here.

## Owner gates and stop

G1: [Owner decision request](https://github.com/sccmavenger/ralph/pull/11#issuecomment-5806709604).
Approve or amend the exact protected-environment/two-secret/one-run transport
in [operations](operations.md). No environment, secrets, source upload or CI run
exists for this task yet. The proposal includes explicit monitored cleanup, not
an assertion of automatic secret expiry.

G2: [Owner decision request](https://github.com/sccmavenger/ralph/pull/11#issuecomment-5806709886).
Review the precise artifacts/hashes above, presentation changes and exact
inert role, then record approval or requested corrections. Until then all review
strings remain empty and any genuine-source apply is forbidden. Final manifest
hash changes when the real approval reference/identity/hashes are inserted.

G3: not reached; no real Owner identity is needed. Do not request or infer private
identity values for this synthetic/disposable checkpoint.

Stopped at the required decision comments; the PR remains Draft and unmerged.
The implementation remains incomplete, not technically complete pending acceptance.
No merge, shared/live DB access, deployment, M1.4 or later work is authorized.
