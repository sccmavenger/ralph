# M1.3 — Transactional bootstrap, Charter import, and audit plan

Status: **Proposed implementation contract; planning only; Owner review required.**
Date: September 23, 2026.
Authorization: [Issue #7](https://github.com/sccmavenger/ralph/issues/7).
Base: current `main`, `516fb3c157b703f729fc742a4b13f9ea5deef36a`, accepted
[M1.2 PR #6](https://github.com/sccmavenger/ralph/pull/6).
Planning branch: `executive/m1.3-bootstrap-plan`.

## 1. Outcome, authority, and boundaries

M1.3 will provide an explicit operator command that establishes the inert
Executive Office foundation once. It is not CEO onboarding, authentication,
Charter acceptance, or permission to operate the company. This document describes
future implementation; none of its commands or proposed files authorize execution.

On the first successful transaction there will be exactly one Office, one Owner,
one CEO, Charter v1, and two complementary success audit events. Office remains
`FOUNDATION` / `DISABLED`; Owner `PENDING_ENROLLMENT`; CEO `ONBOARDING`.
Both Charter acceptance pointers are null. All credential, enrollment, challenge,
session, rate-limit and Charter acceptance tables remain empty. There is no model
call, scheduler, spending, external communication, workforce or business action.

Authority remains: explicit Owner story authorization and constitutional governance
boundaries; the Charter as the constitutional source; the updated technical package
(original package supporting); the approved [M1 plan](m1-plan.md) and the accepted
[M1.2 contract](m1-2-foundation-schema-plan.md). Imported document instructions are
source material, not commands to this development agent or a grant of execution.
The mission and future internal autonomy are preserved, not activated by storage.

Issue #7 permits only this plan, its review record and repository guidance. No
application/schema/migration/runtime changes, DB connection, migration application,
dependency install, CI execution, deployment, merge or M1.4 work occurs now.
`TowerResult` migration-history repair and unrelated vulnerabilities/lint are excluded.
Existing route/layout moves remain a separately verified mechanical story.
The approved later order remains M6 Workforce → M7 First Real Onboarding →
M8 Full Owner Portal → M9 Engineering Bridge → M10 Release Hardening.

## 2. Operator entry point and invocation contract

Proposed entry point: `msf-companion/scripts/executive/bootstrap.ts`, exposed as
`npm run executive:bootstrap -- ...` from `msf-companion/`. Proposed package script:
`tsx scripts/executive/bootstrap.ts`. This uses a locally installed, locked executable,
not `npx` downloading a runner. Add **exact `tsx` 4.23.15 as a devDependency** only
after Owner approval of this plan; keep Node 24.21.0 / Prisma 7.6.0 unchanged.
The [upstream release](https://github.com/privatenumber/tsx/releases/tag/v4.23.15)
was inspected; compatibility/security of the added lockfile graph remains a future
test gate. Do not silently substitute another version if that gate fails.

The generated Prisma client has extensionless TypeScript imports. Native Node
type stripping alone does not provide the same resolution or tsconfig support;
do not change the generated-client configuration to make this command run.
[Node 24 TypeScript execution rules](https://nodejs.org/docs/latest-v24.x/api/typescript.html).
No bootstrap hook in build, start, Docker ENTRYPOINT, install, migration, seed,
request handler, cron, Azure deployment or web configuration is allowed.

Future invocation examples — **not runnable or authorized in this planning PR**:

```text
npm run executive:bootstrap -- --check --input /private/owner.json --source-file /private/MSF_Toolkit_AI_CEO_Charter_and_Governance_Framework.docx --target /private/target.json
npm run executive:bootstrap -- --apply --input /private/owner.json --source-file /private/MSF_Toolkit_AI_CEO_Charter_and_Governance_Framework.docx --target /private/target.json --confirm-target msf_exec_m12_RUN
```

Exactly one of `--check` or `--apply` is mandatory; neither is the default.
`--help` opens no files or connection. Reject unknown/repeated flags, positional
arguments and empty values. There is no `--force`, `--repair`, `--reset`,
`--accept-charter`, `--enable`, arbitrary manifest override or inline DB URL option.
Resolve explicit paths; do not discover inputs from the working directory. Input
and target files must be regular files, each at most 16 KiB, decoded as strict UTF-8
without BOM. Reject duplicate JSON keys, unknown fields and invalid scalar types.
Do not echo raw input, file paths, connection strings or Owner contact details.

Private input has exactly `inputVersion: 1` and `owner`, whose exact fields are
`displayName` and `contactEmail` (explicit null allowed). Display name: 1–200
Unicode scalar values, no surrounding whitespace or control characters. Email:
null or a single plain mailbox, no display-name wrapper, whitespace/control chars,
at most 320 characters; preserve case, do not lowercase or infer identity. Reject
unpaired surrogates. No silent trimming, Unicode normalization, email lookup,
Commander lookup, existing admin-session reuse or verification email.

### Target/configuration policy proposed for M1.3

Implement and verify the operator on **task-owned disposable targets only** in
M1.3. Do not add a shared/live override. A later Owner-approved operational gate
must specify real target identity, TLS/CA, role grants, backups and DDL exclusion
before enabling or running against it. This deliberately limits the first CLI;
it does not claim to deliver live bootstrap execution. Owner decision D2 covers it.

The target JSON has exactly: `targetVersion: 1`, `environment: "disposable"`,
`host: "127.0.0.1"`, `port: 55432`, `database` (the existing guarded
`msf_exec_m12_` run-specific naming contract), `role: "exec_test_app"`,
`tls: "disabled"`, and `runId` (nonempty CI run ID or locally documented container
ownership ID, max 100 ASCII letters/digits/hyphens). The existing prefix is retained
to avoid weakening the M1.2 test guard; it is not proof of isolation by itself.
The invoking test harness must own the container lifecycle; a label is not authority.

| Environment variable | Future contract |
|---|---|
| `EXECUTIVE_BOOTSTRAP_DATABASE_URL` | Required explicit secret; exact target match, no URL query/fragment/host aliases or options overrides; never logged |
| `EXECUTIVE_BOOTSTRAP_DATABASE_CONFIRM` | Required exact database name for both modes; `--apply` additionally requires matching `--confirm-target` |
| `NODE_ENV` | Must be `test` for this disposable-only release |
| `EXECUTIVE_TEST_DATABASE_URL`, `EXECUTIVE_TEST_MIGRATION_DATABASE_URL`, `EXECUTIVE_TEST_DATABASE_CONFIRM` | Existing isolated harness only; not implicit bootstrap fallbacks |
| `DATABASE_URL`, `PG*`, `.env*`, customer/admin secrets | Never connection fallbacks; no dotenv/application Prisma singleton imports |
| `EXECUTIVE_OFFICE_ENABLED`, browser origin/RP/session variables | Not needed, read or changed by M1.3; no route enabled |

Construct adapter connection options explicitly from the validated URL/target,
including credentials, TLS, port and database, rather than allowing driver
environment defaults. No production credentials in fixtures, manifests, PRs or CI.
Keep private files outside the checkout; only synthetic examples may be committed.

`--check` performs file validation and a read-only readiness/replay assessment;
it does not take the write lock, allocate sequences or persist rejection events.
It returns `READY_EMPTY`, `ALREADY_BOOTSTRAPPED`, or a classified error, never a
promise that a later apply cannot race. `--apply` repeats all checks. A successful
apply returns `CREATED` or `ALREADY_BOOTSTRAPPED`, existing IDs, bootstrap version,
request ID and current inertness flag. Serialize event sequence IDs as decimal
strings. Print structured, allowlisted JSON only after confirmed commit; npm's own
banner is not part of that JSON protocol (use `npm run --silent` when capturing it).

## 3. Preflight and actual database readiness

Run pure argument/target/source/manifest/canonical-input validation before creating
any client. Use a fresh, explicitly configured PrismaPg/Prisma client, not
`src/lib/prisma.ts`; do not import `prisma.config.ts`, which loads dotenv.
The operator never generates a client, migrates, grants privileges or repairs a DB.
Client generation is a separate preparation step in the isolated build harness.

On connect, inspect identity with SELECTs: database, session/current role,
server address/port as appropriate to container port forwarding, PostgreSQL major
16, UTF8 server encoding, writable primary for apply and normal transaction mode.
Do not compare server port 5432 inside the container to forwarded client port 55432.
Require `session_replication_role = origin` on the actual transaction connection;
replica mode can suppress both guards and FKs. Set bounded session/transaction
timeouts and a fixed schema-qualified query policy, never caller SQL.
[PostgreSQL session replication behavior](https://www.postgresql.org/docs/16/runtime-config-client.html#GUC-SESSION-REPLICATION-ROLE).

### Required migration records and byte checksums

Require one successful, non-rolled-back record for **each** migration below:
`finished_at` nonnull, `rolled_back_at` null, positive applied step count, exact
checksum. Earlier explicitly rolled-back failed attempts may coexist. Reject
unfinished non-rolled-back migrations anywhere in the history, duplicate successful
records, absent required records or mismatched checksums. Do not fetch migration
`logs` into ordinary diagnostics. No automatic resolve, mark-applied or waiver.

| Migration | SHA-256 of committed LF bytes at accepted `516fb3c` |
|---|---|
| `20260922090000_executive_foundation` | `a163291fc98de4c74a4da8acf15ceb4985a5bfbdf4c7ef88bc819ff38d4a3a9c` |
| `20260922090100_executive_immutability_guards` | `393fae52624a37b68fde874f82d96c11ec6c5033229474d4511ee3a4f4caf182` |

Pin these in a reviewed readiness manifest. Do not recompute trust from whichever
files an operator supplies or accidentally use a CRLF-converted Windows checkout.
A real environment's differing historical checksum requires separate investigation,
not rewriting migration history. Unrelated completed app migrations do not by
themselves fail readiness; any changed Executive contract requires a reviewed new
manifest/CLI version. Do not require or repair the known missing TowerResult table.

### Catalog contract, not just names or counts

Future `readiness.ts` issues SELECT-only catalog queries against a static reviewed
`m1-2-readiness-manifest.json`. Generate that expected manifest only during future
disposable PG16 preparation from the accepted migration bytes, review it, and
commit it; never generate expectations from the target under inspection.
M1.2's `assertExecutiveCatalog` uses scratch tables and must not be copied into a
supposedly read-only preflight. Test readiness inside a read-only transaction.

Compare the complete Executive contract: 11 ordinary permanent public tables,
exact columns/types/nullability/defaults, RLS/policies/rules/inheritance; 43 CHECK
expressions and validation state; 20 same-scope FKs including ordered columns,
referents, MATCH SIMPLE, immediate timing, RESTRICT actions and enabled internal
FK triggers; 52 valid/ready indexes (11 PK, 18 additional unique, 23 nonunique),
column order, methods, predicates and expressions; all 8 function signatures,
bodies, languages, volatility, SECURITY INVOKER and fixed search_path; all 26
custom triggers including exact function identity, event/row/statement flags,
enabled state `O`, timing, deferrability, initial deferral, arguments, column lists
and absence of unexpected WHEN clauses. Reject extra Executive triggers/rules or
weakened/conditional replacements, not merely missing names. Normalize only
documented PG16 deparser formatting, never semantic content.

Check ActivityEvent's owned BIGINT sequence/default binding, positive increment,
noncycling bounds and required access. Do not require `last_value = 1`, contiguous
events or a pristine sequence: an aborted transaction may consume values.
Unrelated application objects are outside the manifest, not silently re-baselined.

### Operator database privileges

Require a non-owner role with no superuser, CREATEDB, CREATEROLE, REPLICATION or
BYPASSRLS attribute, Executive-object ownership, schema CREATE/table TRIGGER
authority, or inherited/SET ROLE path to such authority. Check effective membership,
not only direct grants. Reject privileged migrator credentials. No autogrants.

Minimum capability: CONNECT, public schema USAGE; SELECT on all eleven Executive
tables and `_prisma_migrations`; INSERT on Office, Owner, Agent, Charter and Event;
Event sequence USAGE; required helper function EXECUTE. The existing Agent trigger
uses `SELECT ... FOR UPDATE` on Office, so require Office UPDATE permission too.
The proposed minimal grant is column-level UPDATE on Office `updatedAt`; prove
that suffices in integration tests before documenting it as operationally verified.
No UPDATE is issued by bootstrap. Ordinary TEMP or broader DML in the existing
guard-test lane is not itself DDL bypass; least-privilege and broad-DML tests remain
separate. Shared/live role review is deferred, not certified by these tests.

Recheck migration, catalog, role and replication readiness **inside the locked
apply transaction**. These checks and advisory locking do not defeat an administrator
changing DDL concurrently. Future live execution requires a reviewed maintenance
exclusion for migrations/DDL; no silent claim of administrator-proof immutability.

## 4. Canonical bootstrap input, version and hash

`inputVersion = 1` describes the private CLI input. `bootstrapVersion = 1`
describes this complete creation protocol. Role schema/version and Charter version
are independent, each initially 1. Unsupported versions fail; a future version
does not permit a second Office, overwrite or automatic upgrade.

Build a closed canonical envelope from validated input plus trusted release assets:

| Key | Exact content |
|---|---|
| `bootstrapVersion` | Integer 1 |
| `office` | `key: "msf-toolkit"`, `name: "MSF Toolkit Executive Office"`, `phase: "FOUNDATION"`, `executionMode: "DISABLED"`, `activeCharterAcceptanceId: null` |
| `owner` | Validated `displayName`, explicit `contactEmail`; `status: "PENDING_ENROLLMENT"`, `authVersion: 1` |
| `ceo` | `roleKey: "CEO"`, `displayName: "MSF Toolkit CEO"`, `status: "ONBOARDING"`, `roleDefinitionVersion: 1`, full section-6 role object, `governingCharterAcceptanceId: null` |
| `charter` | `version: 1`, exact title, canonical `contentHash`, exact `sourceFileName`, raw `sourceFileHash`, canonical `manifestHash`, `importedByOwnerId: null` |
| `auditSchemaVersion` | Integer 1 |

Canonical serialization v1: recursively sort object keys by ASCII code point
(all schema keys are ASCII); retain array order and Unicode string code points;
JSON-escape strings with ECMAScript JSON.stringify semantics; use literal null,
false/true and permitted integer numerals; no insignificant whitespace or terminal
newline. Encode strict UTF-8 without BOM; `bootstrapHash = SHA256(bytes)` as 64
lowercase hex characters. This is a deliberately restricted versioned format,
not a claim to implement all of RFC 8785. Reject unsupported keys/types, duplicate
input keys, nonfinite values and unpaired surrogates before canonicalization.

Exclude generated row IDs, random WebAuthn handle, request ID, timestamps,
credentials, target host/database, local file paths and operator-machine details.
Include all descriptive creation choices, role content and Charter provenance.
The same approved inputs on two machines produce the same bootstrapHash while
the generated identities remain database-specific. Golden UTF-8/hash vectors must
be independently calculated in tests. Treat bootstrapHash as potentially
correlatable personal-data metadata, not anonymization; keep it out of public logs.

## 5. Exact Office and Owner creation

All writes use the same Prisma interactive transaction client. **Choose
`executiveOffice.createManyAndReturn` with exactly one data element**, no explicit
ID, no `skipDuplicates`, upsert or nested write. Require exactly one returned row
with nonempty generated cuid; otherwise abort. This is the path M1.2 actually
verified. Do not use ordinary no-ID `create()` or weaken the acceptance relation.

| Model | Exact initial scalar fields |
|---|---|
| ExecutiveOffice | `id` generated by the verified operation; `createdAt = updatedAt = T`; key/name/phase/executionMode from section 4; `bootstrapVersion = 1`; computed `bootstrapHash`; `activeCharterAcceptanceId = null` |
| ExecutiveOwner | Prisma-generated cuid; `createdAt = updatedAt = T`; `officeId` returned above; input displayName/contactEmail; `status = PENDING_ENROLLMENT`; `authVersion = 1`; `webauthnUserId` from 32 cryptographically random bytes, unpadded base64url (43 characters) |

Obtain T once from the database in the transaction, rounded to TIMESTAMPTZ(3)
precision. Supply it explicitly wherever createdAt/updatedAt/occurredAt must agree.
Do not mix client clocks with transaction-start defaults. The WebAuthn handle is
an immutable opaque account handle, **not** a credential, enrollment token or
proof of identity; never derive it from the email or a customer ID. Generate it
only on the genuinely empty creation branch; replay never rotates it.

Owner contact is optional metadata, not email authentication. Bootstrap actor is
OPERATOR, not an authenticated Owner. Real Owner values are requested/confirmed
only before a separately authorized real bootstrap; do not reuse an email from
the earlier character-preview task. Tests use synthetic Owner data only.

## 6. Exact inert CEO record

ExecutiveAgent: generated cuid; `createdAt = updatedAt = T`; `officeId` from Office;
`roleKey = CEO`; `displayName = MSF Toolkit CEO`; `reportsToOwnerId` from Owner;
`status = ONBOARDING`; `roleDefinitionVersion = 1`;
`governingCharterAcceptanceId = null`. The proposed role object is exactly:

```json
{
  "schemaVersion": 1,
  "mission": "Build MSF Toolkit into a growing, sustainable, profitable business by creating exceptional value for Marvel Strike Force players and converting a reasonable portion of that value into recurring revenue.",
  "responsibilities": [
    "Understand the company using evidence and identify important unknowns.",
    "Develop measurable objectives and evaluate sustainable business value.",
    "Identify needed capabilities and propose an evidence-based organization.",
    "Report directly to the Owner and respect the Charter's approval boundaries.",
    "Learn from results and distinguish business progress from activity."
  ],
  "nonResponsibilities": [
    "This foundation record does not authorize or execute onboarding work.",
    "No tools, delegated permissions, spending, external actions or autonomous execution are enabled in M1.",
    "This descriptive role summary does not replace or amend the Charter."
  ],
  "tools": [],
  "permissions": [],
  "spendingAuthority": false
}
```

Store the reviewed object as `bootstrap-role-v1.json`. Its future mandate is
descriptive; the nonResponsibilities text describes M1's temporary execution
boundary, not a permanent revocation of the Charter's internal autonomy. No
company assessment, recommendations, employees or fabricated findings are seeded.

## 7. Charter source, faithful transcription and provenance

The sole constitutional source is the Owner-provided
`MSF_Toolkit_AI_CEO_Charter_and_Governance_Framework.docx`.
Raw source SHA-256, independently rechecked during planning:
`654a4baa4e86743af373f620a8dc156519dada487f3288811b39ae42e5413660`.
The source is 40,485 bytes. Its 12 substantive sections, title/subtitle, lists,
arrows, punctuation and quoted principle must be preserved. Technical package
content is not appended or silently promoted into the Charter.

Future implementation sequence, before any import:

1. Retain the original binary in Owner-controlled custody; do not add Downloads
   paths, usernames or the source binary to GitHub. Obtain the exact source through
   the explicit `--source-file` path. Enforce exact basename, raw-byte size/hash
   (a renamed or re-saved DOCX is not automatically the same source).
2. Produce `charter/charter-v1.md` as a faithful transcription, not a summary or
   LLM rewrite. Review OOXML body, paragraph styles, numbering, tables, headers/
   footers, notes, hyperlinks, drawings and tracked changes as well as the rendered
   source. Simple concatenation of text nodes is not proof of fidelity.
3. Planning inspection found 89 body paragraphs, 12 numbered sections, no body
   tables/drawings/hyperlinks/tracked-change/comment/note references, and a repeating
   footer `MSF Toolkit • AI CEO Charter & Governance Framework`. Inspect styles and
   numbering definitions too. Proposed treatment: preserve all substantive text;
   omit the repeating footer from Markdown and record that presentation-only
   omission in the manifest. Owner review must confirm that disposition.
4. Canonical Markdown: UTF-8, no BOM, LF only, exactly one final LF. Author-time
   CRLF/CR conversion and final-newline fixing are documented transformations;
   runtime validates canonical bytes and **rejects** noncanonical artifacts rather
   than silently changing a reviewed document. Do not trim paragraph content,
   normalize Unicode or replace smart punctuation. Compute contentHash over exactly
   the stored Markdown bytes; no HTML/rendered-text hash.
5. Produce the manifest below. Review rendered DOCX versus Markdown section by
   section and record an Owner/authorized-reviewer PR comment identifying the raw
   source hash and exact Markdown content hash. A matching hash proves byte
   identity, not faithful transcription. Import requires a reviewed release asset;
   neither a self-asserted `approved: true` nor an arbitrary operator file is proof
   of approval. Source custody and the review comment form the human trust anchor.
6. Runtime loads the fixed checked-in Markdown/manifest/role assets from the trusted
   release, reads each once into bounded memory, verifies hashes/schema/provenance
   and uses those same bytes throughout. No document download, GitHub API call,
   conversion, Markdown execution, external link fetch or asset re-read inside the
   transaction. Source DOCX is hashed, not executed or parsed during bootstrap.

`charter-v1.manifest.json` exact schema: `manifestVersion: 1`, `charterVersion: 1`,
`title: "AI CEO Charter & Governance Framework"`, `sourceFileName` as above,
`sourceFileHash` as above, `sourceByteLength: 40485`,
`contentFileName: "charter-v1.md"`, `contentHash`, `contentByteLength`,
`canonicalization: "utf8-no-bom-lf-one-final-newline-v1"`,
`transcriptionMethod: "faithful-manual-ooxml-and-rendered-review-v1"`,
`sourceSectionCount: 12`, `presentationChanges` (ordered strings describing only
actual heading/list/line-break/footer treatment), and `review` with exactly
`reference` (specific approval comment URL), `reviewer` (public review identity),
`reviewedSourceFileHash`, `reviewedContentHash`. All keys mandatory, no extras;
content nonempty and at most 256 KiB, manifest at most 16 KiB. Validate the title,
filenames, hash syntax, byte lengths, count and matching review hashes.

`manifestHash` uses section-4 canonical JSON bytes of the whole manifest, with
no self-hash field. Formatting-only JSON changes do not alter that digest. Review
references must not point to the manifest's own future commit hash: approve the
content/source hashes first, then record the comment. Audit and bootstrapHash bind
this manifest. The schema needs no new provenance columns.

No Markdown content hash, manifest digest or fidelity approval is invented in
this plan: transcription/review is future work and must complete before apply.
In CI use synthetic source bytes/manifests in tests of pure services. The actual
CLI must keep its pinned source/approved-asset policy; unit injection must not
become a production `--skip-provenance` switch. A separately authorized operator
rehearsal can supply the genuine source locally without publishing it as a CI
artifact; section 13 distinguishes that gate from synthetic hosted checks.

ExecutiveCharter creation: generated cuid; `createdAt = T`; same `officeId`;
`version = 1`; exact manifest title; canonical Markdown string; computed
`contentHash`; source basename and raw SHA-256; `importedByOwnerId = null`.
Import is not acceptance. No acceptance row, active flag or pointer is created.

## 8. Serialization and atomic transaction

Use Prisma 7.6 interactive `$transaction` with `ReadCommitted`, `maxWait = 5000`
ms, `timeout = 30000` ms. On its connection use `lock_timeout = 5000` ms,
`statement_timeout = 10000` ms and `idle_in_transaction_session_timeout = 15000`
ms. Connection acquisition is bounded at 5000 ms. Test actual adapter behavior;
do not assume a Promise timeout cancels server-side work.

Use one fixed transaction advisory lock pair **(1297303109, 1)**, reserved for
MSF Executive foundation initialization. Keep it the same for every input, Owner,
hash and future bootstrap protocol version. Acquire it before any initialization
state read in the apply transaction; parameterized
`pg_catalog.pg_advisory_xact_lock(int, int)` only. Never use session locks or
process-local mutexes. READ COMMITTED's subsequent reads see the winning commit
after a waiter acquires the lock. Database singleton constraints remain the
backstop against noncooperating writers.
[PostgreSQL transaction-level advisory locks](https://www.postgresql.org/docs/16/explicit-locking.html#ADVISORY-LOCKS).

Transaction order:

1. Set local limits; acquire the common advisory lock; recheck all readiness.
2. Read all Executive foundation identities and their crosslinks. If any state
   exists, follow section 9; do not create a missing sibling opportunistically.
3. For an empty foundation require all eleven Executive tables empty, including
   auth/rate-limit/history tables. Read T, generate Owner handle.
4. Insert Office using the exact verified operation, Owner, Charter, then CEO.
   Keep Office-before-Agent locking order used by existing guards.
5. Insert `executive.charter.imported`, then `executive.bootstrap.completed` with
   the same request ID/T and the returned IDs/hashes. Two events deliberately
   separate import evidence from complete-foundation evidence; neither is an
   acceptance event. Both must succeed.
6. Re-read and assert exactly-one identities, same-Office relationships, exact
   initial values, null pointers, two success events and zero auth/acceptance rows.
   Force deferred constraints with `SET CONSTRAINTS ALL IMMEDIATE` before return.
7. Commit; only after confirmed commit return `CREATED` and report success.

No external I/O, human prompt, file parsing or network API call occurs inside this
transaction. Any insert, readback, audit or deferred constraint failure rolls back
all new records. Helpers accept the transaction client; none starts a nested
transaction or writes with the outer singleton. Sequence gaps after rollback are
normal, not partial foundation records. Commit is the final success boundary.

## 9. Identical replay, conflicts and partial state

| Observed state after the lock | Required behavior |
|---|---|
| All eleven tables empty | Create the foundation exactly once |
| Same bootstrapVersion/hash and complete valid original foundation | Return `ALREADY_BOOTSTRAPPED` with the same Office/Owner/CEO/Charter IDs; zero mutations, zero sequence allocations, zero new success events |
| Valid existing foundation but different canonical bootstrapVersion/hash | Reject `BOOTSTRAP_CONFLICT`; never overwrite, upsert, rename, rotate or import another v1; section-10 rejection audit may append |
| Office without required siblings/events, orphan/foreign identity, mismatched immutable role/Charter provenance, unexpected duplicate identities | Reject `FOUNDATION_INCONSISTENT`; no fill-in/repair or fabricated success |
| Missing/unready schema/guards or unknown Executive schema contract | Reject readiness before foundation writes; no bootstrap on partially migrated DB |

Replay validates immutable birth evidence: Office key/version/hash, one linked
Owner identity/handle, CEO identity/role definition/reports-to relationship, Charter
v1 bytes and source hashes, and both original success events with matching IDs,
digests, request ID and event schema. It does **not** compare mutable display/contact
values to their original values or insist every auth table is still empty. Later
legitimate enrollment/status/authVersion/display changes and paired Charter
acceptance pointers are preserved, not reset. Return a separately computed
`currentlyInert` flag; `ALREADY_BOOTSTRAPPED` does not mean currently unauthenticated.
Additional later audit events are allowed; do not require total Event count two
on replay. Future contract changes require a reviewed compatible checker.

A first-creation mismatch cannot be excused as later evolution: fresh postconditions
are strict. Partial state or forged/missing historical evidence fails closed even
when Office bootstrapHash matches. Canonical fields changed by an operator are
conflicts, not an Owner contact-update API. Identity continuity is verified using
stored immutable relationships and success evidence, not the current email string.

## 10. Audit registry, attribution and redaction

All persisted events use `actorType = OPERATOR`, `actorOwnerId = null`, generated
cuid, DB sequence default, bounded server-generated UUID requestId, and metadata
with `schemaVersion: 1`. OPERATOR means possession of the separately authorized
database execution path, **not** verified Owner identity. Do not claim a passkey
signature or log an OS username as authenticated identity.

| Event type | Outcome / subject | Closed metadata beyond schemaVersion |
|---|---|---|
| `executive.charter.imported` | SUCCESS / `ExecutiveCharter`, Charter ID | `bootstrapVersion`, `charterVersion`, `contentHash`, `sourceFileName`, `sourceFileHash`, `manifestHash`, `importMethod: "OPERATOR_BOOTSTRAP"` |
| `executive.bootstrap.completed` | SUCCESS / `ExecutiveOffice`, Office ID | `bootstrapVersion`, `bootstrapHash`, `ownerId`, `ceoId`, `charterId`, `charterContentHash`, `manifestHash`, `phase: "FOUNDATION"`, `executionMode: "DISABLED"`, `ownerStatus: "PENDING_ENROLLMENT"`, `ceoStatus: "ONBOARDING"`, `acceptanceCreated: false` |
| `executive.bootstrap.rejected` | REJECTED / `ExecutiveOffice`, known Office ID | `reasonCode: "BOOTSTRAP_CONFLICT"`, `bootstrapVersion`, `auditPersisted: true` |

Do not include attempted Owner values, raw/canonical input, differing field values,
raw DOCX/Charter text, paths, full URLs, email, WebAuthn handle, credentials, tokens,
environment dumps, SQL parameters, driver error messages or stack traces.
Success hashes are internal evidence with access restrictions; rejected events
omit attempted hashes to avoid creating a contact-guessing correlation log.
Reject unknown metadata keys and cap encoded metadata at 8 KiB. Audit functions
construct allowlisted objects rather than deleting known secret keys afterward.

Rejected-attempt persistence is deliberately bounded:

- File/target/provenance/preflight failure, missing Office, inconsistent foundation,
  failed transaction, and `--check` errors emit redacted **local diagnostics only**;
  no false Event is written to an untrusted/unready/nonexistent Office. Diagnostic
  kinds: `executive.bootstrap.rejected` or `executive.bootstrap.failed`, with only
  requestId, reasonCode, phase and `auditPersisted: false`.
- An `--apply` conflict discovered against a valid, ready, committed foundation
  appends the rejection Event in that same locked transaction, with no foundation
  mutation. Return a rejection result from the transaction, commit the audit,
  **then** exit nonzero. Do not throw inside it and accidentally roll back the
  rejection record. If that audit/commit fails, fail closed and report the audit
  gap; never turn failure into success or retry an unbounded audit loop.
- Idempotent replay writes nothing. Process-local replay output is not another
  business success event. Failure before creation cannot have a persistent
  Office-scoped audit because no Office exists. This limitation is explicit;
  future durable operator-log collection is separate, not a schema change here.

## 11. Error handling and forward recovery

| Exit / reason class | Action |
|---|---|
| 0: `READY_EMPTY`, `CREATED`, `ALREADY_BOOTSTRAPPED` | Report only verified outcome; close client |
| 2: `INPUT_INVALID`, `TARGET_INVALID`, `PROVENANCE_INVALID` | No connection on pure failure; correct private input/source/review artifact, then rerun |
| 3: `READINESS_FAILED`, `PRIVILEGE_FAILED` | No writes; obtain separately approved environment/migration/role remediation; rerun check |
| 4: `BOOTSTRAP_CONFLICT`, `FOUNDATION_INCONSISTENT` | Stop for Owner/operator investigation; never overwrite permanent history |
| 5: `LOCK_TIMEOUT`, `TRANSACTION_FAILED`, `AUDIT_WRITE_FAILED` | Roll back/close; report stable reason, not raw exception |
| 6: `COMMIT_OUTCOME_UNKNOWN` | Do not announce success or blindly create anew; rerun the same validated inputs to resolve through replay |

No automatic retry for invalid inputs, provenance/readiness, constraint/unique
violations, conflict or audit failure. Retry only server-confirmed aborted
transactions for deadlock/serialization (`40P01`/`40001` or a verified adapter
mapping), at most one retry after 250 ms, same inputs/request correlation. A
5-second advisory-lock timeout returns a bounded retryable diagnostic, not a loop.
Ambiguous disconnect/commit acknowledgment is never classified as proven rollback.
Allowlisted mappings are tested against PrismaPg 7.6; unknown errors remain generic.

After a confirmed rollback, a later identical invocation starts from empty state
and creates once. After lost commit acknowledgment, identical replay finds the
committed identities/events or safely creates if the transaction did not commit.
For inconsistent permanent state or wrong imported content after commit, preserve
evidence and request an Owner-approved forward-recovery plan; do not disable
guards, delete/truncate records, reset migrations, roll back Charter history or
use a new version number to bypass the conflict. No bootstrap repair mode.

## 12. Exact future file inventory and implementation sequence

**None of these implementation files are created/changed by this planning PR.**
Paths below are relative to `msf-companion/`, except the workflow explicitly rooted
at repository level. Existing schema/migrations/client configuration, app routes,
layouts, auth/session services, Dockerfile and infrastructure remain unchanged.

| Action | Exact path | Responsibility |
|---|---|---|
| Create | `scripts/executive/bootstrap.ts` | Explicit CLI, safe client lifecycle/output/exit handling; no import-time execution in reusable modules |
| Create | `scripts/executive/bootstrap.example.json` | Synthetic Owner input only |
| Create | `scripts/executive/bootstrap-target.example.json` | Disposable target shape; no secret |
| Create | `src/lib/executive/contracts.ts` | Closed bootstrap, outcome and metadata types; not future auth APIs |
| Create | `src/lib/executive/bootstrap-config.ts` | Pure CLI/target/env validation; explicit adapter options |
| Create | `src/lib/executive/canonical.ts` | Restricted canonical JSON/UTF-8/hash rules |
| Create | `src/lib/executive/readiness.ts` | SELECT-only migration/catalog/privilege verification |
| Create | `src/lib/executive/m1-2-readiness-manifest.json` | Reviewed PG16 catalog expectation plus pinned migration checksums |
| Create | `src/lib/executive/bootstrap.ts` | Lock, transaction, create/replay/conflict, postconditions |
| Create | `src/lib/executive/bootstrap-role-v1.json` | Exact section-6 descriptive role |
| Create | `src/lib/executive/charter.ts` | Bounded canonical artifact/source verification; tx insert, not standalone import command |
| Create | `src/lib/executive/audit.ts` | Closed event builders/transaction-bound append and safe diagnostics |
| Create | `docs/executive-office/charter/charter-v1.md` | Faithful reviewed transcription |
| Create | `docs/executive-office/charter/charter-v1.manifest.json` | Source/content/review provenance |
| Create | `docs/executive-office/operations.md` | Check/apply/replay/recovery, custody and no-live-run gate |
| Create | `docs/executive-office/m1-3-bootstrap-verification.md` | Actual future test results, commands, commits and limitations |
| Create | `tests/executive/bootstrap-fixtures.ts` | Explicit synthetic assets, child DBs, minimal grants, controlled fault injection |
| Create | `tests/executive/bootstrap-input.unit.test.ts` | Pure CLI/target/canonical/hash and zero-connection checks |
| Create | `tests/executive/bootstrap-charter.unit.test.ts` | Provenance/canonicalization/limits/redaction |
| Create | `tests/executive/bootstrap-readiness.integration.test.ts` | Manifest/migration/catalog/privilege negative lanes |
| Create | `tests/executive/bootstrap.integration.test.ts` | Initial state, replay, conflict, unchanged business data |
| Create | `tests/executive/bootstrap-concurrency.integration.test.ts` | Separate process/connection races and bounded waits |
| Create | `tests/executive/bootstrap-recovery.integration.test.ts` | Every write-boundary rollback and ambiguous commit |
| Create | `tests/executive/bootstrap-cli.integration.test.ts` | Real process parsing, validation, exit/output/no-side-effect contract |
| Create | `tests/executive/bootstrap-audit.unit.test.ts` | Exact event metadata, attribution and error redaction |
| Modify | `package.json` | One npm script and exact approved tsx devDependency only |
| Modify | `package-lock.json` | Corresponding minimal runner dependency graph; no unrelated upgrades |
| Create | repository `.github/workflows/m1-3-bootstrap-validation.yml` | Narrow hosted disposable DB/regression/container evidence |
| Modify | `AGENTS.md` | Verified new patterns and correct story gate only |

Reuse `tests/executive/test-database.ts`, `vitest.executive.config.ts` and
`prisma.executive-test.config.ts` without weakening guards or ordinary-test
exclusions. They already discover the proposed dedicated suite. Negative catalog
cases use new child DBs and ignored migration copies, not committed SQL edits.
If actual implementation requires additional files/dependency changes, update
the PR inventory and seek approval for material scope changes first.

Future sequence after separate authorization: (a) source transcription and Owner
hash review; (b) pure contracts/canonicalization/target checks; (c) reviewed catalog
manifest/readiness; (d) transaction/replay/audit; (e) CLI and isolated tests;
(f) baseline comparison and hosted container evidence; (g) actual report, then
stop for Owner review. No UI/auth/later story is included as a convenience.

## 13. Isolated test strategy and execution safety

All tests below are **required future evidence, not performed in Issue #7**.
Use a GitHub-hosted `ubuntu-latest` runner with the existing pinned PostgreSQL 16
image from [M1.2 verification](m1-2-foundation-verification.md), unique task-owned
container, literal loopback 55432, run-confirmed database names, separate migrator
and non-owner app roles, no repository/environment production secrets. Use the
existing dedicated config; no implicit dotenv, application singleton, wallet tests
or default credential-capturing browser setup. Do not install a permanent local
container engine. All changed guard/history fixtures stay in disposable child DBs.

| ID | Required proof |
|---|---|
| BOOT-01 | Invalid/missing/duplicate args/JSON, secret-bearing URL variants, host aliases, wrong role/port/name/confirmation, NODE_ENV mismatch and forbidden env fallback fail before any connection |
| BOOT-02 | Golden canonical vectors: key order/JSON whitespace invariant; array order/case/Unicode/content/provenance changes meaningful; BOM, CRLF Markdown, extra terminal LF, malformed UTF-8/surrogates, oversized input reject |
| BOOT-03 | Source raw hash/name/size, Markdown hash/length, manifest/review hashes and exact schema mismatch reject; full Unicode/multiline round-trip; no arbitrary source override or technical-package substitution |
| BOOT-04 | Successful typed-client transaction uses createManyAndReturn and generated IDs; exactly one Office/Owner/CEO/Charter, exact role and inert fields, two success events, all six other tables empty |
| BOOT-05 | Identical replay preserves all IDs/handle/timestamps and row/sequence state; mutate each permitted canonical input separately to prove conflict/no overwrite; unsupported versions fail, never reinitialize |
| BOOT-06 | Replay after synthetic legitimate display/contact/authVersion/status/paired-acceptance progression returns existing IDs without resetting state; partial/corrupt identity/provenance/events fail, never repair |
| BOOT-07 | Two independent identical callers → one CREATED, one ALREADY_BOOTSTRAPPED; conflicting callers → one winner, one conflict plus bounded rejection audit; barrier-controlled locking, no arbitrary sleeps as race proof |
| BOOT-08 | Separate held advisory lock produces bounded timeout and no writes; approved transient retry at most once; all retries use same fixed lock for different hashes/versions |
| BOOT-09 | Readiness runs in READ ONLY transaction with zero DML/DDL/nextval; zero/missing/failed/rolled-back/checksum-mismatched/duplicate migration records reject; successful record after an old rolled-back attempt handled correctly |
| BOOT-10 | Missing/disabled/replica-only/conditional/wrongly timed trigger, altered function body/search_path/security, weakened CHECK/FK/index, missing FK enforcement, view/RLS/rule substitution, sequence misbinding and unsupported version reject |
| BOOT-11 | Least-privilege non-owner succeeds including Office lock permission; missing SELECT/INSERT/sequence/Office UPDATE, owner/migrator credentials and dangerous inherited/SET ROLE authority reject; broad-DML guards separately remain effective |
| BOOT-12 | Inject failure after each of Office/Owner/Charter/CEO/first Event/second Event, readback and deferred constraints; every new row rolls back, business sentinels unchanged; sequence gaps explicitly permitted |
| BOOT-13 | Disconnect before commit rolls back; drop only commit acknowledgment after actual commit, then identical replay recovers same IDs/events; ambiguous acknowledgment never reported as confirmed success/rollback |
| BOOT-14 | Audit failure rolls back new foundation; valid conflict persists rejection before nonzero exit; unready/empty/check-only failure has no DB audit; idempotent replay produces none; secrets/PII absent in stdout/stderr/errors/metadata |
| BOOT-15 | Operator process imports cause no DB/network work, help is pure, generated client missing fails clearly without installing, no auth/model/email/cron imports, check writes nothing and apply requires double target confirmation |
| BOOT-16 | Re-run all existing M1.2 tests and unchanged business catalog/sentinel comparisons; no schema/migration change; preserve TowerResult drift exactly, not a repair or passing full-schema compatibility claim |

Never bypass real readiness to make a broken fixture pass. Alter test-only migration
copies to install negative catalogs; mismatched checksums may be reported alongside
catalog findings. Pure catalog snapshots cover impossible/unsafe combinations
without altering production-role privileges. Test faults are dependency-injected
in test composition only, not CLI flags, environment bypasses or exported runtime
repair tools. Synthetic later acceptance/auth rows in BOOT-06 are fixtures only,
not implemented enrollment/acceptance services.

Three distinct provenance/e2e evidence lanes are required:

1. Hosted tests exercise real PostgreSQL writes with explicitly synthetic artifacts
   through the same bootstrap service and actual strict readiness. Synthetic assets
   are labeled and never become the CLI's trusted constitutional defaults.
2. Hosted real-CLI processes prove argument/target/check/no-source refusals; approved
   checked-in Markdown/manifest integrity can be checked without the original binary.
   Do not label these a full actual-source CLI success if the source is absent.
3. Before declaring M1.3 implementation complete, perform a full genuine-source CLI
   check/apply/replay against an owned disposable DB, including independent fidelity
   review. Supply the Owner-custodied original through a separately approved
   short-lived CI secret-file mechanism or an already available temporary local
   container. Never commit/upload the binary as public evidence or send real Owner
   contact data. Owner decision D2 selects custody transport; lack of it is an
   explicit remaining verification gate, not permission to skip provenance.

## 14. Regression and container requirements for implementation

Future narrow workflow: only the separately authorized M1.3 implementation branch
and relevant path changes/manual dispatch, `contents: read`, pinned action SHAs,
no Azure login, production secrets, registry push, scheduled bootstrap or deploy.
Preserve baseline-to-candidate evidence from accepted main (`516fb3c`, or a newer
explicitly recorded baseline at implementation start) in secret-free isolated
source copies. Record every command, runtime version, commit, image digest and
artifact link; upload sanitized failure/container logs and always clean up only
the exact run-owned container/volumes. Never disable guards for cleanup.

Required commands/gates in those copies, using already installed local executables:

- `npm ci --no-audit --no-fund`; review exact lockfile delta and separately record
  dependency-audit baseline/candidate. No unrelated remediation or silent upgrades.
- `prisma validate`, `prisma generate`, and disposable-only `prisma migrate deploy`
  via `prisma.executive-test.config.ts`; ordinary app config is forbidden here.
- `vitest run --config vitest.executive.config.ts`: all existing M1.2 plus BOOT
  tests. Preserve the strict target guard and actual named role separation.
- `tsc --noEmit --incremental false`; targeted ESLint on every new TS/config file;
  full `npm run lint` baseline/candidate exact diagnostic comparison.
- Web regression: `vitest run --exclude 'functions/**' --exclude 'src/lib/wallet.test.ts' --maxWorkers=4`;
  do not include live DB/browser credentials; retain new dedicated-suite exclusion.
- `npm run build` baseline/candidate with inert dummy configuration and telemetry
  disabled. Record outputs; no server/startup bootstrap allowed.
- Build the **unchanged current Dockerfile** using its Node 24 base; start the
  image as its non-root user with `--network none`, dummy credentials and readiness
  polling through `docker exec`. Repeat the M1.2 public route/auth-boundary/Sharp
  smoke coverage, capture startup failures, then remove only owned resources.
  No external DNS/API/analytics/DB connection, image publication or deployment.
- Separate operator validation proves the CLI against the disposable PostgreSQL
  service. Web-container readiness does not prove bootstrap, and bootstrap passing
  does not prove the web-container build/startup.

Known historical evidence, **not rerun for this planning PR**: M1.2 run
[35871473800](https://github.com/sccmavenger/ralph/actions/runs/35871473800)
passed 364/364 dedicated assertions; selected web baseline/candidate each had
676 passes / 9 failures (685 assertions); lint each 123 errors / 36 warnings;
typecheck, targeted lint, builds, container startup and 14 HTTP checks passed.
M1.1 recorded 26 dependency findings (1 low, 10 moderate, 14 high, 1 critical).
Tower failures and migration-history gap remain separately reported, not waived
as new regressions. Compare exact failure sets, not just totals. Reconfirm actual
numbers during implementation; this plan is not renewed runtime/security evidence.

## 15. Risks and Owner decisions

| ID | Decision / recommendation / alternatives | Gate and tradeoff |
|---|---|---|
| D1 | Approve this contract, including proven createManyAndReturn, one fixed lock, two atomic success events and no-write replay. Approve the exact pinned tsx dev runner; alternative is a separately planned `.mjs`/pg SQL operator with explicit generated IDs. | Recommended: typed Prisma path with pinned runner. Small new build/operator dependency and its audit/Node24 test burden; no schema workaround. Implementation remains blocked until explicit authorization, even if this plan is merged. |
| D2 | Approve disposable-only M1.3 execution and choose genuine-source rehearsal transport: short-lived approved CI secret-file delivery, or an already available temporary local container. Alternative: revise a separately reviewed shared-target policy first. | Recommended: hosted disposable validation plus Owner-approved temporary source transport; no permanent local engine. Original DOCX remains Owner-custodied, source bytes never public artifacts. Planning completes now; full genuine-source implementation acceptance cannot be claimed until transport and fidelity review are supplied. |
| D3 | Future Charter transcription/hash and descriptive role approval; later actual Owner display/contact values. No such values or fidelity approval are assumed here. | Approve the proposed process now; review exact content hashes/role in implementation PR before any real-source apply. Contact email optional and not authentication; do not infer it from past email-preview tasks. |

No unresolved technical choice is hidden behind “implementation detail”: the
selected designs above are proposals, and changed choices require a visible PR
amendment. Post decision comments headed **OWNER DECISION REQUIRED** and link
their resolutions in the PR; do not treat silence or this planning task as consent.

Remaining risks: fidelity needs human review; trusted-release artifacts are not
cryptographic Owner signatures; catalog deparser/adapter behavior needs actual
PG16 testing; privileges do not stop DDL administrators; advisory locks cooperate
only with callers honoring the convention; commitment can outlive a dropped
client connection; historical dependency/test/lint issues remain. No full live
security certification, production bootstrap readiness or newly authenticated
Owner is claimed by M1.3. Planning PR stays Draft and unmerged for review.

## 16. M1.3 implementation acceptance criteria and stop condition

Future implementation is complete only when its separate PR has actual evidence for:

1. Exact bounded CLI/config/runner contract and zero implicit startup/deployment use;
   Owner-approved source custody and canonical Charter/manifest/role review recorded.
2. Fail-closed explicit target validation; actual migration checksums, catalog guards,
   role privileges and same-transaction readiness verified with read-only checks.
3. Exactly-one Office/Owner/CEO/Charter v1 plus two atomic success events; required
   inert statuses/null pointers; all auth/acceptance tables untouched.
4. Proven Prisma createManyAndReturn/generated-ID path without schema or migration
   change; complete field/hash/provenance/relationship readback and canonical vectors.
5. Independent callers serialize correctly; identical replay and advanced-state
   replay preserve original IDs/history; conflicts/inconsistent state never overwrite.
6. All failure boundaries roll back; bounded error/retry/redaction behavior;
   ambiguous commit recovery and explicit audit gaps accurately reported.
7. BOOT-01–BOOT-16 and all existing M1.2 cases pass on owned PostgreSQL; full
   genuine-source CLI rehearsal separately evidenced, not replaced by mock proof.
8. Typecheck/targeted lint/build and Linux container start/smoke pass; exact existing
   regression/lint/audit baseline reported separately, no unexplained new failures.
9. Every changed file, dependency/config delta, command/run/artifact, decision and
   remaining limitation recorded; no auth/UI/later story or production activity.
10. Stop for Owner review; do not merge, deploy, enable execution or begin M1.4.

**Issue #7's current stop condition is earlier:** deliver an independently
reviewable planning Draft PR and stop. Approval of a plan, permission to merge
documentation, M1.3 implementation authorization, original-source transport and
permission to touch a shared/live database are distinct decisions.
