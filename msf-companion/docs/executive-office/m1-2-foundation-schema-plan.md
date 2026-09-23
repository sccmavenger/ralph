# M1.2 — Foundation schema implementation plan

Date: September 22, 2026. Status: **proposed contract; implementation is not authorized**.

Issue: [#3](https://github.com/sccmavenger/ralph/issues/3).
Base: `5b000501fcd500265c8664290dac363cbdfa8634` (merged M1.1 and workflow).
Branch: `executive/m1.2-foundation-schema-plan`.

Review: [Draft PR #4](https://github.com/sccmavenger/ralph/pull/4).

## 1. Outcome and authorization boundary

Only repository documentation is being changed. No schema edit, migration file,
database operation, authentication/passkey implementation, route/layout change,
M1.3 work, merge, or deployment is authorized by Issue #3.

If separately approved, M1.2 implementation adds eleven empty tables, Prisma
definitions, invariants and isolated verification. No Office, Owner, CEO, Charter,
acceptance or credential is seeded. Database uniqueness establishes **at most one**
Office/Owner/CEO; M1.3 transactional bootstrap establishes exactly one.

Authority: Owner story-specific instructions and Charter governance boundaries;
then the updated technical specification (original package is supporting context);
then the [approved M1 plan](m1-plan.md) and this proposed detail contract. Source
documents are requirements, not permission to execute later stories. The broader
specification's initial objectives wording does not expand the subsequently
approved eleven-model M1 scope. No objective/workforce/approval/runtime/permission
tables, autonomous tools, model calls, or business decisions are added.

The approved order remains M6 Workforce -> M7 First Real Onboarding -> M8 Full
Owner Portal -> M9 Engineering Bridge -> M10 Release Hardening. Any later layout
move remains an isolated mechanical change, verified before and after.

Source provenance (SHA-256 of original files; source text read locally):

| Source | Hash |
|---|---|
| `MSF_Toolkit_AI_Executive_Office_M1_Implementation_Plan.md` | `01452306db7da7c77407c0b579717993e7d310deae157cd8c976b1dd8f916af5` |
| `MSF_Toolkit_AI_CEO_Charter_and_Governance_Framework.docx` | `654a4baa4e86743af373f620a8dc156519dada487f3288811b39ae42e5413660` |
| `MSF_Toolkit_AI_CEO_Codex_Implementation_Package_Updated.docx` | `c5079a7bc2f174059ad914d9dc82a3fab73ff917f112914c51af3a531ee1211d` |

This plan is not a Charter transcription/import or acceptance; those remain M1.3
and M1.5 work. No document filename confers additional constitutional authority.

## 2. Confirmed repository baseline

- M1.1 targets Node 24.21.0, Prisma 7.6.0, and the existing PostgreSQL adapter.
- Infrastructure source declares PostgreSQL 16; the live database was not queried.
- The repository contains 24 migrations. `TowerResult` exists in the Prisma schema
  but not in committed migration SQL. Do not fold that pre-existing discrepancy
  into Executive migrations or reset a configured database to reconcile it.
- The M1.1 report records 9 existing test failures, 123 lint errors / 36 warnings,
  and 26 install-audit vulnerabilities. These are not resolved by this planning PR.
- Existing schema: 23 models; historical migration replay defines 22 tables.
- `prisma.config.ts` imports dotenv and uses DATABASE_URL; `src/lib/prisma.ts`
  uses that application connection. New isolated tests must use neither.
- `vitest.config.ts` would discover new DB tests by default; an explicit exclusion
  and dedicated test config are required. `tsconfig.json` targets ES2017, so use
  `BigInt(0)` rather than bigint literals; do not change the target for this story.
- Existing wallet migration demonstrates custom SQL CHECKs. Generated Prisma
  output under `src/generated/prisma` is ignored and must not be committed.
- `msf-companion/progress.txt` documents historical drift/manual migration work;
  that is context, not permission to reset or reconcile a configured database.

Do not generate M1.2 by blindly accepting a full schema-versus-migration-replay
diff: it could include the unrelated Tower table. Use an old-schema/new-schema
delta and review an Executive-only object allowlist. Compare drift before/after,
requiring **no additional drift**, while reporting TowerResult separately. No
`db push`, reset, blanket `migrate resolve`, or unrelated reconciliation.

The [M1.1 report](m1-1-runtime-compatibility.md) is historical evidence, not rerun
here: 676 passing / 9 failing selected web assertions; 123 lint errors / 36 warnings;
build/typecheck and candidate container smoke passed. Install audit: 26 findings
(1 low, 10 moderate, 14 high, 1 critical). Separate pre-release security triage
remains required; no dependency remediation is authorized in this story.

## 3. Exact proposed scalar model contract

These tables specify all scalar fields; section 4 supplies every relation and
inverse, section 5 every index. This is documentation, not executable schema.

Common fields on **all eleven models**:

- `id String @id @default(cuid())`, PostgreSQL TEXT. Prisma generates cuid values;
  direct SQL fixtures must supply IDs because this is not a PostgreSQL default.
- `createdAt DateTime @default(now()) @db.Timestamptz(3)`.
- Every DateTime listed below also uses `@db.Timestamptz(3)`; new tables only.
  Existing TIMESTAMP columns stay unchanged; later API timestamps serialize as UTC.
- `updatedAt`, only where listed, uses `@updatedAt`; Prisma, not a database-wide
  trigger, manages it. Direct SQL updates must supply the value.
- PostgreSQL now() is the transaction-start time, not wall-clock time at each
  INSERT. Later issuance/acceptance services must use a coherent trusted timestamp
  and explicitly supply related timestamps together where the defaults differ;
  never use a browser time. Test delayed transactions, not only immediate inserts.
- `?` means nullable, with no non-null default. All other fields are required.
  Unspecified defaults are absent. String=TEXT, Int=INTEGER, BigInt=BIGINT,
  Bool=BOOLEAN, Bytes=BYTEA, Json=JSONB. State fields are String plus SQL CHECKs.
- Use quoted model/field names in the existing `public` schema; no namespace
  change, new enum/extension, or Commander relationship.
- All hash fields are lowercase 64-character SHA-256 hex. Token/grant/browser
  binding plaintext is never stored. Sections 6–7 define checks and mutability.

### 3.1 ExecutiveOffice

| Field beyond common fields | Type / default | Purpose |
|---|---|---|
| key | String | Unique, fixed `msf-toolkit` |
| name | String | Office display name |
| phase | String; FOUNDATION | Only FOUNDATION permitted in M1 |
| executionMode | String; DISABLED | Only DISABLED permitted in M1 |
| bootstrapVersion | Int | Positive bootstrap-contract version |
| bootstrapHash | String | Immutable canonical bootstrap-input digest |
| activeCharterAcceptanceId | String? | Null until later explicit acceptance |
| updatedAt | DateTime; @updatedAt | Mutable timestamp |

### 3.2 ExecutiveOwner

| Field | Type / default | Purpose |
|---|---|---|
| officeId | String | Unique: one human Owner per Office |
| displayName | String | Display only |
| contactEmail | String? | Contact only, not unique or authorization |
| status | String; PENDING_ENROLLMENT | PENDING_ENROLLMENT / ACTIVE / LOCKED |
| webauthnUserId | String | Unique immutable opaque random user handle |
| authVersion | Int; 1 | Positive nondecreasing revocation generation |
| updatedAt | DateTime; @updatedAt | Mutable timestamp |

### 3.3 ExecutiveOwnerCredential

| Field | Type / default | Purpose |
|---|---|---|
| ownerId | String | Permanent Owner identity |
| credentialId | String | Unique canonical base64url external WebAuthn ID |
| publicKey | Bytes | Nonempty COSE public key, never a private key |
| counter | BigInt | Nonnegative authenticator counter; zero valid |
| rpId | String | Immutable relying-party ID |
| label | String | Editable display label |
| transports | Json | Array of transport strings |
| deviceType | String | singleDevice / multiDevice |
| backedUp | Bool | Observed backup state |
| lastUsedAt | DateTime? | Last use |
| revokedAt | DateTime? | Irreversible revocation marker |

### 3.4 ExecutiveOwnerEnrollment

| Field | Type / default | Purpose |
|---|---|---|
| ownerId | String | Intended Owner |
| purpose | String | INITIAL / RECOVERY |
| tokenHash | String | Unique grant digest, never bearer grant |
| expiresAt | DateTime | Fixed expiry |
| consumedAt | DateTime? | Single-use marker |
| revokedAt | DateTime? | Revocation marker |
| operatorReason | String | Required bounded rationale, no secret |

### 3.5 ExecutiveOwnerChallenge

| Field | Type / default | Purpose |
|---|---|---|
| ownerId | String | Server-resolved intended Owner |
| purpose | String | INITIAL_ENROLLMENT / RECOVERY_ENROLLMENT / SIGN_IN / ADD_CREDENTIAL / REVERIFY |
| challenge | String | Unique random base64url challenge |
| browserBindingHash | String | Digest of separate browser binding |
| enrollmentId | String? | Same-Owner grant, purpose-dependent |
| sessionId | String? | Same-Owner session, purpose-dependent |
| authVersion | Int | Captured generation |
| expiresAt | DateTime | Fixed expiry |
| consumedAt | DateTime? | Irreversible single-use marker |

### 3.6 ExecutiveOwnerSession

| Field | Type / default | Purpose |
|---|---|---|
| ownerId | String | Session identity |
| credentialId | String | Credential **record id**, not external WebAuthn credentialId |
| tokenHash | String | Unique opaque session-token digest |
| authVersion | Int | Immutable issuance generation |
| verifiedAt | DateTime | Last successful verification |
| lastSeenAt | DateTime | Monotonic observed use |
| idleExpiresAt | DateTime | Renewable, bounded expiry |
| absoluteExpiresAt | DateTime | Fixed upper expiry |
| revokedAt | DateTime? | Irreversible revocation marker |

### 3.7 ExecutiveAuthRateLimit

| Field | Type / default | Purpose |
|---|---|---|
| bucketKeyHash | String | Unique keyed digest; no raw IP/email/token |
| attemptCount | Int; 0 | Nonnegative count |
| windowStartedAt | DateTime | Current window |
| blockedUntil | DateTime? | Optional block deadline |
| expiresAt | DateTime | Cleanup deadline |
| updatedAt | DateTime; @updatedAt | Mutable timestamp |

No Owner FK: pre-authentication attempts need shared throttling too. A bucket is
not identity evidence. Namespacing/hash construction and atomic increments are M1.4.

### 3.8 ExecutiveAgent

| Field | Type / default | Purpose |
|---|---|---|
| officeId | String | Office membership |
| roleKey | String | Only CEO in M1 |
| displayName | String | Display, not authority |
| reportsToOwnerId | String | Same-Office Owner |
| status | String; ONBOARDING | Only ONBOARDING in M1 |
| roleDefinitionVersion | Int | Positive version |
| roleDefinition | Json | Closed descriptive foundation object |
| governingCharterAcceptanceId | String? | Null until explicit acceptance |
| updatedAt | DateTime; @updatedAt | Mutable timestamp |

Proposed roleDefinition has **exactly** these keys: schemaVersion (number 1),
mission (nonempty string), responsibilities and nonResponsibilities (string arrays),
tools (empty array), permissions (empty array), spendingAuthority (false).
Reject missing/extra keys and JSON nulls. No content is seeded in M1.2; M1.3 supplies
descriptive text without fabricated strategy. Later changes to authority/role
structure require an approved migration, not a JSON bypass.

### 3.9 ExecutiveCharter

| Field | Type / default | Purpose |
|---|---|---|
| officeId | String | Office scope |
| version | Int | Positive immutable version |
| title | String | Source title |
| contentMarkdown | String | Immutable canonical UTF-8 text |
| contentHash | String | Hash of stored canonical text |
| sourceFileName | String | Source basename, not local path |
| sourceFileHash | String | Hash of original source bytes |
| importedByOwnerId | String? | Same-Office importer; null for operator bootstrap |

No mutable active flag. Same content may have multiple numbered versions; only
Office + version is unique. M1.3 handles import idempotency without overwriting.

### 3.10 ExecutiveCharterAcceptance

| Field | Type / default | Purpose |
|---|---|---|
| officeId | String | Office scope |
| charterId | String | Exact immutable Charter |
| ownerId | String | Same-Office accepting Owner |
| ownerCredentialId | String | Same-Owner credential record id |
| ownerSessionRef | String | Non-secret session record id snapshot; **no FK** |
| contentHash | String | Must equal referenced Charter hash |
| verifiedAt | DateTime | Recorded recent verification |
| acceptedAt | DateTime | Server-supplied acceptance time |
| requestKey | String | Unique server-scoped idempotency key, not bearer material |

No uniqueness on Owner + Charter: separate explicit acceptances may create new
receipts, but the same requestKey may not. M1.5 checks identical retry versus
conflicting reuse. Credential revocation/session expiry do not invalidate history.

### 3.11 ExecutiveActivityEvent

| Field | Type / default | Purpose |
|---|---|---|
| officeId | String | Required scope |
| sequence | BigInt; @default(autoincrement()) | Globally unique sequence-backed default |
| eventType | String | Bounded operation name; registry in M1.3 |
| actorType | String | OWNER / OPERATOR / SYSTEM / ANONYMOUS |
| actorOwnerId | String? | Same-Office Owner, present iff actorType OWNER |
| subjectType | String | Bounded entity-category name |
| subjectId | String? | Historical reference, not polymorphic FK |
| requestId | String | Required correlation ID, not unique |
| outcome | String | SUCCESS / REJECTED / FAILED |
| metadata | Json | Required object, later allowlisted/redacted |
| occurredAt | DateTime; now() | Event time |

Sequence is not gapless or guaranteed commit chronology. Rollback can consume
values; raw SQL can explicitly supply values, so later APIs never accept sequence
from clients. Use it for stable feed pagination, retain event time separately,
serialize BigInt as decimal text. [PostgreSQL sequence semantics](https://www.postgresql.org/docs/16/functions-sequence.html).

## 4. Exact relations and cross-scope integrity

All FKs explicitly use **onDelete: Restrict, onUpdate: Restrict**, including optional
ones. No Cascade/SetNull inheritance from customer models. Use the relation name
on both Prisma relation sides. Only the FK-owning side specifies fields,
references, onDelete, onUpdate and `map`; its FK map name is the relation name
plus `_fk`. The inverse specifies the shared relation name only. Names below are
under PostgreSQL's identifier limit.

Abbreviations in this and later tables: Office/Owner/Credential/Enrollment/Challenge/
Session/RateLimit/Agent/Charter/Acceptance/Event refer to the eleven full model names
above. They are documentation aliases, not actual table names. Inverse fields are
arrays except Office.owner, which is an optional Owner scalar.

| Relation name | Child relation field / parent inverse | Child columns -> parent columns |
|---|---|---|
| ExecOwnerOffice | Owner.office / Office.owner | Owner(officeId) -> Office(id) |
| ExecCredentialOwner | Credential.owner / Owner.credentials | Credential(ownerId) -> Owner(id) |
| ExecEnrollmentOwner | Enrollment.owner / Owner.enrollments | Enrollment(ownerId) -> Owner(id) |
| ExecChallengeOwner | Challenge.owner / Owner.challenges | Challenge(ownerId) -> Owner(id) |
| ExecSessionOwner | Session.owner / Owner.sessions | Session(ownerId) -> Owner(id) |
| ExecSessionCredential | Session.credential / Credential.sessions | Session(ownerId,credentialId) -> Credential(ownerId,id) |
| ExecChallengeEnrollment | Challenge.enrollment? / Enrollment.challenges | Challenge(ownerId,enrollmentId) -> Enrollment(ownerId,id) |
| ExecChallengeSession | Challenge.session? / Session.challenges | Challenge(ownerId,sessionId) -> Session(ownerId,id) |
| ExecAgentOffice | Agent.office / Office.agents | Agent(officeId) -> Office(id) |
| ExecAgentOwner | Agent.reportsToOwner / Owner.agents | Agent(officeId,reportsToOwnerId) -> Owner(officeId,id) |
| ExecCharterOffice | Charter.office / Office.charters | Charter(officeId) -> Office(id) |
| ExecCharterImporter | Charter.importedByOwner? / Owner.importedCharters | Charter(officeId,importedByOwnerId) -> Owner(officeId,id) |
| ExecAcceptanceOffice | Acceptance.office / Office.charterAcceptances | Acceptance(officeId) -> Office(id) |
| ExecAcceptanceOwner | Acceptance.owner / Owner.charterAcceptances | Acceptance(officeId,ownerId) -> Owner(officeId,id) |
| ExecAcceptanceCredential | Acceptance.ownerCredential / Credential.charterAcceptances | Acceptance(ownerId,ownerCredentialId) -> Credential(ownerId,id) |
| ExecAcceptanceCharter | Acceptance.charter / Charter.acceptances | Acceptance(officeId,charterId,contentHash) -> Charter(officeId,id,contentHash) |
| ExecOfficeActiveAcceptance | Office.activeCharterAcceptance? / Acceptance.activeForOffices | Office(id,activeCharterAcceptanceId) -> Acceptance(officeId,id) |
| ExecAgentAcceptance | Agent.governingCharterAcceptance? / Acceptance.governingAgents | Agent(officeId,governingCharterAcceptanceId) -> Acceptance(officeId,id) |
| ExecEventOffice | Event.office / Office.activityEvents | Event(officeId) -> Office(id) |
| ExecEventOwner | Event.actorOwner? / Owner.activityEvents | Event(officeId,actorOwnerId) -> Owner(officeId,id) |

Question marks on child relation fields indicate optional Prisma relations; others
are required. RateLimit has no relations. No other implicit joins are proposed.
Compound parent uniqueness is specified next. Overlapping relation syntax must be
validated with installed Prisma 7.6.0 during authorized implementation.

Independent valid ownerId/credentialId values do not prove shared ownership; the
compound FK does. Direct Office FKs remain where optional composites could skip
validation. Use ordinary **MATCH SIMPLE** for optional composites, plus the explicit
purpose/null-shape CHECKs below. MATCH FULL would reject a legitimate required
scope ID paired with a null optional pointer; composite SetNull could null required
scope columns. [PostgreSQL foreign-key rules](https://www.postgresql.org/docs/16/ddl-constraints.html).

ownerSessionRef deliberately does not block session cleanup. subjectId is a
historical reference whose ephemeral target may disappear. Neither is proof of
authorization or scope: later services derive/validate them server-side. An
arbitrary DB writer can otherwise forge attribution; this plan does not claim
database constraints alone authenticate the Owner.

## 5. Exact uniqueness and indexes

Every model has its ID primary key. Additional B-tree indexes below use explicit
`map` names through @unique/@@unique/@@index. Column order is significant. Compound
unique keys support FKs even when id alone is unique. No partial/GIN/concurrent indexes.

| Model | Unique indexes: name(columns) | Nonunique indexes: name(columns) |
|---|---|---|
| Office | ExecOffice_key_uq(key) | None |
| Owner | ExecOwner_office_uq(officeId); ExecOwner_handle_uq(webauthnUserId); ExecOwner_scope_id_uq(officeId,id) | None |
| Credential | ExecCredential_external_uq(credentialId); ExecCredential_owner_id_uq(ownerId,id) | ExecCredential_owner_revoked_idx(ownerId,revokedAt) |
| Enrollment | ExecEnrollment_token_uq(tokenHash); ExecEnrollment_owner_id_uq(ownerId,id) | ExecEnrollment_owner_purpose_idx(ownerId,purpose,createdAt); ExecEnrollment_expiry_idx(expiresAt) |
| Challenge | ExecChallenge_value_uq(challenge) | ExecChallenge_owner_expiry_idx(ownerId,expiresAt); ExecChallenge_enrollment_idx(ownerId,enrollmentId); ExecChallenge_session_idx(ownerId,sessionId); ExecChallenge_expiry_idx(expiresAt) |
| Session | ExecSession_token_uq(tokenHash); ExecSession_owner_id_uq(ownerId,id) | ExecSession_credential_idx(ownerId,credentialId); ExecSession_owner_revoked_idx(ownerId,revokedAt); ExecSession_absolute_idx(absoluteExpiresAt); ExecSession_idle_idx(idleExpiresAt) |
| RateLimit | ExecRateLimit_bucket_uq(bucketKeyHash) | ExecRateLimit_expiry_idx(expiresAt) |
| Agent | ExecAgent_office_role_uq(officeId,roleKey) | ExecAgent_owner_idx(officeId,reportsToOwnerId); ExecAgent_acceptance_idx(officeId,governingCharterAcceptanceId) |
| Charter | ExecCharter_version_uq(officeId,version); ExecCharter_scope_hash_uq(officeId,id,contentHash) | ExecCharter_importer_idx(officeId,importedByOwnerId) |
| Acceptance | ExecAcceptance_request_uq(requestKey); ExecAcceptance_scope_id_uq(officeId,id) | ExecAcceptance_time_idx(officeId,acceptedAt,id); ExecAcceptance_charter_idx(officeId,charterId,contentHash); ExecAcceptance_owner_idx(officeId,ownerId); ExecAcceptance_credential_idx(ownerId,ownerCredentialId) |
| Event | ExecEvent_sequence_uq(sequence) | ExecEvent_feed_idx(officeId,sequence); ExecEvent_type_idx(officeId,eventType,sequence); ExecEvent_actor_idx(officeId,actorOwnerId,sequence); ExecEvent_request_idx(officeId,requestId) |

At-most-one Office = unique key plus fixed-key CHECK; at-most-one Owner = unique
officeId; at-most-one CEO = unique (officeId,roleKey) plus CEO-only CHECK. No unique
email/name/content hash/event request/session receipt reference. Do not create a
time-dependent partial index for “one unexpired grant”; M1.4 locks issuance.

## 6. Row-local CHECKs and later service responsibilities

Name checks `Exec<ModelAlias>_<rule>_ck`, with suffixes state/shape/time/count/hash
where grouped. These predicates, including explicit null branches, need SQL tests.
Required columns are NOT NULL; where an invalid JSON/optional expression could
evaluate SQL NULL, use a false fallback rather than accidentally accepting it.
No CHECK reads another table or depends on now().

| Model | Exact required rules |
|---|---|
| All | Nonempty ID and required human/reference strings after trimming; lowercase 64-hex hash fields; updatedAt >= createdAt where present. |
| Office | key='msf-toolkit'; phase='FOUNDATION'; executionMode='DISABLED'; bootstrapVersion >= 1. |
| Owner | Defined status; authVersion >= 1; webauthnUserId alphabet/length is unpadded base64url, exactly 43 characters for a later random 32-byte handle; optional contactEmail nonempty and <=320 characters. Encoding canonicality is a later service check. |
| Credential | counter >= 0; publicKey nonempty; defined deviceType; transports string array; lastUsedAt/revokedAt null or >= createdAt. No strict increasing-counter rule. |
| Enrollment | Defined purpose; expiresAt > createdAt; consumedAt null or createdAt <= consumedAt < expiresAt; revokedAt null or >= createdAt; consumedAt and revokedAt not both set; operatorReason 1..1000 characters. |
| Challenge | Defined purpose; authVersion >= 1; expiresAt > createdAt; consumedAt null or createdAt <= consumedAt < expiresAt; pointer matrix below. |
| Session | authVersion >= 1; absoluteExpiresAt > createdAt; createdAt <= lastSeenAt < idleExpiresAt <= absoluteExpiresAt; verifiedAt <= lastSeenAt; revokedAt null or >= createdAt. Initial verification may precede session creation. |
| RateLimit | attemptCount >= 0; createdAt <= windowStartedAt < expiresAt; blockedUntil null or windowStartedAt <= blockedUntil <= expiresAt. |
| Agent | CEO only; ONBOARDING only; roleDefinitionVersion >=1; exact closed role JSON from section 3.8. |
| Charter | version >=1; nonempty content; sourceFileName basename only (no slash/backslash or dot/dot-dot path value); content digest bound to text as below. |
| Acceptance | verifiedAt <= acceptedAt <= createdAt; acceptedAt - verifiedAt <= 5 minutes; nonempty ownerSessionRef/requestKey. Not proof that a real passkey ceremony occurred. |
| Event | sequence >0; defined actor/outcome; actorOwnerId non-null iff actorType OWNER; metadata JSON object; eventType/subjectType 1..100 chars; requestId 1..200 chars. No promise of commit chronology. |

For acceptance insertion, M1.5 must explicitly set acceptedAt and createdAt to
the same trusted database clock instant obtained when recording acceptance,
rather than mixing a later acceptedAt with the transaction-start createdAt default.
Keep verifiedAt as the verified ceremony time. The DB timestamp checks do not
replace actual recent-verification evidence. Session/enrollment/challenge fixture
issuance similarly supplies coherent createdAt/use/expiry values together.

Use a row-local immutable SQL helper `public.exec_foundation_json_valid(kind TEXT,
payload JSONB)` for the TRANSPORTS and ROLE_DEFINITION JSON shapes. Unknown kind or
null/invalid shape returns false. No table reads, clock, side effects, network,
permission lookup or model reasoning; create/test this helper in migration one.

Charter content predicate: `contentHash = encode(sha256(convert_to(contentMarkdown,
'UTF8')), 'hex')`. PostgreSQL 16 has byte-string SHA-256 without pgcrypto. Proposed
M1.3 canonical text: UTF-8 without BOM, LF line endings, exactly one final newline;
hash exact stored bytes. DB binding prevents a text/hash mismatch but cannot prove
the source DOCX transcription is faithful; M1.3 verifies source bytes and manifest.
[PostgreSQL hash functions](https://www.postgresql.org/docs/16/functions-binarystring.html).

| Challenge purpose | enrollmentId | sessionId | Additional guard |
|---|---|---|---|
| INITIAL_ENROLLMENT | Required | Null | Grant purpose INITIAL |
| RECOVERY_ENROLLMENT | Required | Null | Grant purpose RECOVERY |
| SIGN_IN | Null | Null | None |
| ADD_CREDENTIAL | Null | Required | Composite same-Owner session FK |
| REVERIFY | Null | Required | Composite same-Owner session FK |

M1.4 still checks current status/authVersion, dynamic expiry/revocation, origin/RP,
browser binding, signature, required user verification and concurrent single use.
Do not FK authVersion to Owner's current generation: stale sessions must remain
representable after revocation. Revoked credentials likewise retain historical
references. The 15-minute grant, 5-minute challenge, 8-hour absolute session and
30-minute idle limits are later issuance logic, not clock-dependent CHECKs.

Recent verification must preserve credential attribution. With the proposed
immutable Session.credentialId, M1.4 REVERIFY must use that session's credential.
If the Owner verifies with a different passkey, issue a new session bound to it
rather than refreshing the old session's verifiedAt under misleading attribution.
M1.5 derives ownerCredentialId from the recently verified session. This proposed
handoff must be covered by M1.4/M1.5 tests; no authentication is implemented here.

## 7. Append-only, identity and cross-row guards

Migration two uses scoped PL/pgSQL functions with qualified public-schema objects,
explicit safe search_path and SECURITY INVOKER, not SECURITY DEFINER. Rejection
uses SQLSTATE 23514 plus a non-secret rule name. No test mode, custom setting,
admin cookie, bootstrap flag or caller bypass disables guards.

### 7.1 History guards

On Charter, Acceptance and Event, attach `exec_history_write_guard` BEFORE
UPDATE OR DELETE FOR EACH STATEMENT using `exec_reject_history_mutation()`.
Reject even zero-row/no-op mutations. Also attach `exec_truncate_guard` BEFORE
TRUNCATE FOR EACH STATEMENT using `exec_reject_truncate()`. Test direct/cascading
TRUNCATE including RESTART IDENTITY. INSERT still obeys checks/FKs/uniqueness.
Corrections create new records, never edit historical rows.

DELETE triggers do not cover TRUNCATE. These are application append-only guards,
not WORM storage or protection against an administrator who can alter the schema.
[PostgreSQL TRUNCATE behavior](https://www.postgresql.org/docs/16/sql-truncate.html).

### 7.2 Identity and terminal-state guards

Office, Owner, Agent and Credential receive `exec_identity_delete_guard` BEFORE
DELETE FOR EACH STATEMENT using `exec_reject_identity_delete()`, and the truncate
guard above. This prevents delete/recreate even without child records. Recovery
preserves the Owner; revoked credentials remain for attribution.

`exec_update_guard` BEFORE UPDATE FOR EACH ROW calls
`exec_guard_foundation_update()` on the eight mutable models below. All fields
not explicitly listed are immutable, including id/createdAt. Compare immutable
fields using IS DISTINCT FROM to handle nulls safely.

| Model | Exhaustive mutable fields | Transition rules |
|---|---|---|
| Office | name, activeCharterAcceptanceId, updatedAt | Non-null acceptance pointer cannot clear; deferred pair rule below. |
| Owner | displayName, contactEmail, status, authVersion, updatedAt | authVersion never decreases; valid status is not authorization for a transition. |
| Credential | counter, label, transports, backedUp, lastUsedAt, revokedAt | lastUsedAt never moves backward/clears; revokedAt only null -> timestamp then fixed; counter stays nonnegative but need not strictly increase. |
| Enrollment | consumedAt, revokedAt | Only null -> timestamp then fixed; mutually exclusive. |
| Challenge | consumedAt | Only null -> timestamp then fixed. |
| Session | verifiedAt, lastSeenAt, idleExpiresAt, revokedAt | First three never decrease; revocation only null -> timestamp then fixed. |
| RateLimit | attemptCount, windowStartedAt, blockedUntil, expiresAt, updatedAt | Window never moves backward; count decreases only when window advances. |
| Agent | displayName, governingCharterAcceptanceId, updatedAt | Non-null pointer cannot clear; role definition/version/reporting identity fixed in M1. |

Enrollment/Challenge/Session/RateLimit allow DELETE for later expired-artifact
maintenance; no maintenance service is implemented here. Validate expiry later
and delete dependent challenges before grants/sessions. Receipt ownerSessionRef
does not prevent cleanup; never delete credentials or constitutional/audit history.

### 7.3 Grant-purpose linkage

`exec_challenge_grant_guard` BEFORE INSERT OR UPDATE on Challenge calls
`exec_check_challenge_grant()`. Enrollment purposes require a same-Owner parent
grant whose purpose matches INITIAL/RECOVERY; missing/mismatched parent rejects.
Parent purpose/ownership is immutable and FK restricts deletion. Dynamic expiry
and authentication do not belong in this trigger.

### 7.4 Office and CEO acceptance agreement

Separate same-Office FKs permit two different valid receipts unless an additional
rule exists. Proposed rule: at transaction commit, a CEO's governing pointer must
equal the Office active pointer using null-safe comparison. If no CEO exists,
Office active pointer must be null. Both-null setup is valid; no existence seed.

- `exec_agent_office_lock` BEFORE INSERT OR UPDATE on Agent calls
  `exec_lock_agent_office()`, taking its Office row FOR UPDATE. Office updates
  naturally lock that same row. Later services use Office-first lock ordering.
- `exec_charter_pair_guard` AFTER INSERT OR UPDATE FOR EACH ROW on both Office
  and Agent is a DEFERRABLE INITIALLY DEFERRED constraint trigger calling
  `exec_check_charter_pointer_pair()`. Read current stored rows at firing time,
  not intermediate NEW snapshots; compare final pointers on commit or explicit
  SET CONSTRAINTS IMMEDIATE.
- Shared locking and two-connection tests must prove no split-authority race.
  Later services retry bounded deadlock/serialization failures, never bypass.
- Later acceptance inserts a receipt before changing both pointers in one
  transaction. All section-4 FKs remain immediate; no deferred FK required.

Deferred triggers do not alone solve concurrency; locking is part of this
proposal and must be tested. [PostgreSQL constraint trigger timing](https://www.postgresql.org/docs/16/sql-createtrigger.html).

### 7.5 Audit and privilege limits

No automatic audit writer/auth service in M1.2. M1.3–M1.5 must transact sensitive
state and SUCCESS audit inserts together; audit failure rolls back state. Tests
can rehearse this with synthetic writes, not claim implemented bootstrap/auth.
Operator bootstrap/import uses OPERATOR, not a fabricated authenticated OWNER.
Before any Office exists, a scoped Event cannot be inserted: failures belong in
redacted operator diagnostics, not a fake Office. Subject scope/metadata redaction
are later service responsibilities; never log tokens or raw assertions.

No production role/grant/RLS changes. Infrastructure source uses an administrator
connection string, but actual privileges are unverified. Runtime/migration role
separation is a pre-release security follow-up if absent; guards do not protect
against DDL-capable administrators. No schema-only plan claims otherwise.

## 8. Exact migration sequence

Keep the approved filenames; both sort after the August 31 existing migration.
No collision at the planning base; recheck before implementation. Never rename
applied history to solve a later collision without review.

### Migration one

`msf-companion/prisma/migrations/20260922090000_executive_foundation/migration.sql`

1. Explicit BEGIN; transaction-local lock timeout 5 seconds / statement timeout
   60 seconds. Tune only from isolated rehearsal evidence, with disclosure.
2. Create eleven tables and the Event sequence-backed default, no seed data.
3. Create the immutable JSON helper, row CHECKs, primary/unique/nonunique indexes.
4. Add the twenty FKs after all tables exist, resolving the Office/Acceptance cycle.
5. COMMIT. No existing table, row, constraint, extension, role or grant change.

### Migration two

`msf-companion/prisma/migrations/20260922090100_executive_immutability_guards/migration.sql`

1. Explicit BEGIN; same transaction-local timeout policy.
2. Create the seven section-7 trigger functions: history rejection, truncate
   rejection, identity-delete rejection, update guard, challenge-grant check,
   Agent/Office lock and deferred pointer-pair check.
3. Attach every specified trigger to Executive tables only; COMMIT.

Use nonconcurrent indexes on new empty tables. Rehearse DDL/Prisma error metadata
using installed **Prisma 7.6.0**, not assumptions about a newer migration system.
These files are separate durability units. If one succeeds and two fails, the
foundation is **not ready for bootstrap**. M1.3 must verify both successful
migration records **and actual required/enabled constraints/triggers**.

Prisma schema/validate/diff alone do not verify custom SQL guards. Keep custom
SQL in reviewed migrations and assert actual catalog definitions. [Prisma
custom-migration guidance](https://docs.prisma.io/docs/orm/prisma-migrate/workflows/unsupported-database-features).

## 9. Bootstrap and later-story dependencies — not implemented here

| Story | Required use of schema |
|---|---|
| M1.3 | Explicit operator bootstrap; validate environment and both migrations/guards; serialize initialization; verify canonical inputs/source hashes; atomically insert Office with null active pointer, pending Owner, unaccepted Charter v1, onboarding CEO with null governing pointer and audit. Identical replay returns existing; conflicting inputs fail without overwrite. No automated enrollment or acceptance. |
| M1.4 | Generate random handles/grants/challenges/tokens; store only appropriate digests; verify current identity, statuses, generation, RP/origin, expiry and signatures; consume/revoke atomically with audit. Recovery keeps identity/history. Maintenance deletes eligible challenges before grants/sessions. |
| M1.5 | Authenticate/reverify Owner, validate exact Charter/hash and expected prior receipt; lock Office first; insert receipt, update both pointers, append audit atomically. Conflicting idempotency replay fails; execution remains DISABLED and CEO ONBOARDING. |
| M1.6–M1.8 | Analytics-free mechanical layouts, minimal UI, broad integration/browser/security checks and Owner walkthrough, each separately authorized. |

Schema fixtures are not real authentication, bootstrap, acceptance or cleanup
services. Last-passkey protection, actual source transcription, metadata redaction,
service concurrency, physical passkey testing and request authorization stay in
their later story acceptance criteria.

## 10. Exact future implementation files

Paths are repository-relative. **No implementation file below is changed or created
in this planning PR.** If evidence requires a different file plan, update the
implementation PR and surface scope changes before proceeding.

| Action | Path | Purpose |
|---|---|---|
| Modify | `msf-companion/prisma/schema.prisma` | Append eleven models and relational metadata; existing models untouched |
| Create | `msf-companion/prisma/migrations/20260922090000_executive_foundation/migration.sql` | New tables/checks/indexes/FKs |
| Create | `msf-companion/prisma/migrations/20260922090100_executive_immutability_guards/migration.sql` | Immutability and cross-row guards |
| Create | `msf-companion/prisma.executive-test.config.ts` | Explicit guarded test datasource, no dotenv/DATABASE_URL fallback |
| Create | `msf-companion/vitest.executive.config.ts` | Dedicated Executive suite, bounded workers and owned test lifecycle |
| Modify | `msf-companion/vitest.config.ts` | Only exclude `tests/executive/**` from normal discovery |
| Create | `msf-companion/tests/executive/test-database.ts` | Pure fail-closed URL checks, owned clients and fixture transactions |
| Create | `msf-companion/tests/executive/test-database.unit.test.ts` | No-connection validation guard tests |
| Create | `msf-companion/tests/executive/foundation.integration.test.ts` | Models, checks, uniqueness, FKs and inert state |
| Create | `msf-companion/tests/executive/immutability.integration.test.ts` | Direct SQL guards, valid updates and cleanup |
| Create | `msf-companion/tests/executive/migrations.integration.test.ts` | Fresh/upgrade/repeat/failure/catalog/old-client lanes |
| Create | `msf-companion/tests/executive/concurrency.integration.test.ts` | Duplicate insert, paired-pointer and single-use fixture races |
| Create | `.github/workflows/m1-2-foundation-validation.yml` | Narrow future implementation-branch PostgreSQL CI, no deployment |
| Create | `msf-companion/docs/executive-office/m1-2-foundation-verification.md` | Actual implementation results, commands, versions and limitations |
| Modify | `msf-companion/AGENTS.md` | Verified SQL/isolation patterns learned in implementation |

No dependency/package/lockfile change expected; existing Prisma, pg and Vitest
suffice. Generate ignored Prisma client only for verification. Keep production
Prisma config/singleton, historical migrations/migration_lock, application routes,
runtime files, infrastructure, Functions, emails and deployment workflows unchanged.

This **planning PR's actual files** are only `m1-plan.md`, this detail plan,
`m1-2-planning-verification.md`, and an app AGENTS note recording planning and
testing boundaries. No generated schema/migration artifact is hidden in docs.

## 11. Isolated migration and invariant tests

### 11.1 Environment and safety contract

Propose GitHub-hosted `ubuntu-latest` verification during later implementation,
without a permanent local engine. Node comes from `.node-version`; use PostgreSQL
16 and pin/report the chosen image digest and exact patch in the future workflow.
No live DB connection, Azure operation or infrastructure provisioning.

Create a task-owned PostgreSQL instance bound only to loopback with distinct
`exec_test_migrator` and `exec_test_app` roles. Test roles/grants/random passwords
and sentinel fixtures exist only there. No repository/environment secrets, Azure
identity, image push, real email/game request, or production service. GitHub token
permissions contents:read only; bounded job and artifacts. Future workflow triggers
only on implementation branch `executive/m1.2-foundation-schema` and relevant
schema/test/workflow paths, not documentation-only pushes or pull_request_target.

Test-only configuration, never production variables:

| Variable | Purpose |
|---|---|
| EXECUTIVE_TEST_DATABASE_URL | Disposable non-owner role connection |
| EXECUTIVE_TEST_MIGRATION_DATABASE_URL | Disposable migrator connection for dedicated Prisma config |
| EXECUTIVE_TEST_DATABASE_CONFIRM | Exact generated database name acknowledging target; non-secret |
| NODE_ENV=test | Explicit required test context |

Before **any** connection, reject missing/malformed values, non-PostgreSQL schemes,
nonliteral/nonloopback host, unexpected role/port, arbitrary DB names, mismatched
confirmation and query options that redirect connections. Require host 127.0.0.1,
CI-owned port, listed role, database prefix `msf_exec_m12_` plus run-specific suffix.
No fallback to DATABASE_URL or dotenv. Never print secrets. A name prefix alone
does not prove isolation: CI must own the instance/port/name lifecycle. Do not
automatically drop/reset a database from an arbitrary user-supplied URL.

Dedicated tests never import application Prisma, dotenv, existing wallet tests,
captured browser credentials, default Playwright setup/teardown or cleanup script.
Missing DB configuration fails the integration lane, never silently skips to green.
Pure guard tests assert zero connection attempts for rejection. Normal web tests
exclude `tests/executive/**`; use the separate config explicitly.

Append-only fixtures use transaction rollback, not DELETE/TRUNCATE cleanup.
Cross-connection cases use dedicated task-owned databases in the ephemeral
instance; preserve evidence then remove only that instance.

### 11.2 Migration lanes

1. **Fresh:** replay 24 historical plus two new migrations; assert exact catalogs
   and zero Executive rows. Report missing TowerResult as baseline, not a pass.
2. **Upgrade:** replay historical migrations; insert synthetic fixtures into
   historically migrated business tables; snapshot catalogs and sorted contents;
   apply both Executive migrations; assert all 22 existing tables/fixtures unchanged.
3. **Repeat:** second deploy has no pending work, new rows, duplicated guards or
   changed fixtures. No IF NOT EXISTS masking incompatible definitions.
4. **Old client:** baseline-generated Prisma client still accesses the same
   existing migrated tables after upgrade; no claim for Tower/live workflows.
5. **Failure:** inject bounded failure in disposable copies of each candidate
   migration, prove transaction rollback, inspect failed-migration metadata and
   rehearse state-based recovery. Failure of migration two means not ready; actual
   bootstrap refusal will be implemented/tested in M1.3.
6. **Catalog/drift:** compare exact FK columns/actions, CHECKs, indexes, function
   definitions, trigger enablement/timing/deferred flags. Before/after drift must
   show no new discrepancy. A Prisma-only diff is insufficient for custom guards.

### 11.3 Required cases

| ID | Required positive/negative assertions |
|---|---|
| DB-01 | Empty tables and valid synthetic foundation; reject second Office/Owner/CEO, wrong key, other roles/status, execution enablement. |
| DB-02 | All unique keys including duplicate handle/credential/token/challenge/version/request/sequence; concurrent duplicate inserts have one winner, no partial state. |
| DB-03 | All twenty FK definitions/actions match; wrong/nonexistent scope fails; optional null references succeed only in permitted shapes. |
| DB-04 | Compound session/credential and challenge/grant/session ownership; INITIAL/RECOVERY mismatch rejects; valid references succeed. |
| DB-05 | Wrong acceptance Charter/hash/Office/Owner/credential rejects; text/hash mismatch fails; Unicode/multiline canonical content succeeds. |
| DB-06 | Every enum, null shape, negative count, JSON shape and stored time boundary; SQL NULL/JSON null cannot bypass checks; delayed transactions with explicit coherent receipt/issuance timestamps succeed. |
| DB-07 | History UPDATE/DELETE, zero-row/no-op changes, TRUNCATE, RESTART IDENTITY and TRUNCATE CASCADE reject. |
| DB-08 | Identity rewrite/reassignment/delete-recreate rejects even without children; valid display/use changes pass; version/terminal-state/monotonic rules hold. |
| DB-09 | Eligible fixture challenge cleanup then session/grant cleanup preserves receipts, Charter, Owner, credentials and audit; referenced auth deletes fail. |
| DB-10 | Receipt-first paired-pointer transaction passes; split commit/SET CONSTRAINTS fails; null bootstrap passes; clearing active pointers fails; two-connection interleavings cannot leave split authority. |
| DB-11 | Synthetic state+audit transaction rolls back if audit insert fails; sequence gaps allowed; no claim of completed audit service. |
| DB-12 | Stale authVersion/revoked-credential references remain representable for history; usable-session auth rejection deferred to M1.4. |
| DB-13 | Ordinary non-owner test-role legitimate operations pass; separate disposable broad-DML grant proves UPDATE/DELETE/TRUNCATE guards fail independently of privilege denial. Never substitute schema-owner-only tests. |
| DB-14 | URL safety tests and discovery exclusion prevent implicit .env/live DB use or existing port-3000 teardown. |
| DB-15 | Fresh/upgrade/repeat/failure/catalog/data-preservation lanes pass; old Tower discrepancy explicitly retained/reported. |

Two valid Offices/Owners cannot exist under singleton rules. Do not relax production
constraints to fabricate tenants: combine catalog proof of compound keys, valid
single-scope cases and invalid scope/reference tests. Disclose this limitation,
rather than claim a two-tenant behavior test. Future multitenancy needs new testing.

### 11.4 Future commands, not executed during planning

Use a secret-free source copy and pinned Node. Verify Prisma 7.6 CLI options with
local --help; never fetch @latest. The harness selects/guards each owned target
and orchestrates historical-only/fresh/upgrade/failure lanes.

```text
npm ci --no-audit --no-fund
node node_modules/prisma/build/index.js validate --config prisma.executive-test.config.ts
node node_modules/prisma/build/index.js generate --config prisma.executive-test.config.ts
node node_modules/prisma/build/index.js migrate deploy --config prisma.executive-test.config.ts
node node_modules/prisma/build/index.js migrate status --config prisma.executive-test.config.ts
node node_modules/vitest/vitest.mjs run --config vitest.executive.config.ts
node node_modules/vitest/vitest.mjs run --exclude "functions/**" --exclude "src/lib/wallet.test.ts" --maxWorkers=4
node node_modules/typescript/bin/tsc --noEmit --incremental false
npm run lint
npm run build
```

Run targeted ESLint on all added test/config files, and report full-lint and
regression deltas separately. The future build uses inert/dummy config, no live
database. A candidate Docker rebuild/start/public smoke with dummy secrets and
blocked external network is the generated-client/runtime regression gate; keep it
inside the narrow future validation workflow, not a deployment workflow. Historical
M1.1 container success is not a fresh check of future schema/client changes.

## 12. Rollback and recovery

- M1.2 seeds nothing and activates no feature. Application-code rollback leaves
  additive tables intact. Old-app compatibility is explicitly rehearsed.
- Once later stories write history, rollback means disable Executive access and
  roll back application code, **not drop/purge history**. A future feature flag
  does not exist until its later story; do not claim it is implemented now.
- If migration one commits but guards fail, keep foundation unusable. Capture
  failed statement, migration metadata and catalog. Do not mark applied merely
  to silence failure. Rehearse explicit-transaction rollback on disposable copies.
- Correct unapplied candidates before review; changes to successfully applied
  shared schema require reviewed forward repair, never altered checksums/history.
  Failed-migration resolution must match actual verified DB state.
- Later live recovery needs separate approval, backup/PITR checks and restoration
  into a separate recovery target first. Never overwrite shared customer data to
  reverse an Executive release. No backup/restore operation is authorized here.
- No destructive down migration, cascading DROP, trigger-disable bypass, reset,
  history purge or automatic production rollback script.

## 13. Proposed refinements, risks and Owner decision

The eleven models and overall architecture are unchanged. Exact refinements for
Owner review before implementation:

1. New-only timestamptz(3), explicit composite keys and fixed inert M1 states.
2. DB-bound Charter text digest, closed no-authority role JSON, permanent identity
   guards/terminal markers, locked/deferred Office–CEO pointer agreement, coherent
   receipt timestamps and session-bound recent-verification credential attribution.
3. Dedicated test Prisma config, default Vitest exclusion, and ephemeral hosted
   PostgreSQL validation, with no permanent local engine.
4. Keep TowerResult history gap outside M1.2; never silently reconcile it.

### D1 — contract approval and separate implementation authorization

Options: A) approve this bounded contract, then explicitly authorize only M1.2
implementation on its own branch; B) request revisions and retain planning-only
scope. Recommendation: review/approve this contract with its safety boundaries,
then authorize M1.2 only. Merge and implementation approvals are distinct; neither
grants production changes or M1.3. Planning can complete; **implementation is
blocked pending explicit Owner approval**. Record the decision in the Draft PR
as OWNER DECISION REQUIRED, with options, recommendation, tradeoffs and status.

### Open evidence and future release gates

- Proposed compound Prisma syntax, SQL catalogs and trigger concurrency are not
  executed/compiled yet. They are mandatory implementation gates. Do not write
  schema code now simply to prove it before approval.
- Live PG version/history, roles and backup readiness are unverified. Separately
  authorized rollout preflight must stop on unexpected drift.
- Trigger guards do not replace authenticated services or least privilege. A
  privileged DDL writer can bypass them. Role separation/retention/privacy review
  remain explicit release gates, not unapproved grants or a new purge policy.
- Fixed M1 role/state guards intentionally require approved later migrations for
  broader autonomy/workforce. No data value alone turns on an execution engine.
- Retained history grows and contains identity references; no automatic deletion
  is invented. No legal/compliance certification is claimed by this schema plan.
- Known M1.1 vulnerabilities/test/lint issues remain separately tracked before
  production; no scope expansion to remediation.
- Source digest verifies identified bytes, not faithful Charter transcription or
  an Owner's acceptance. Those need their actual later-story evidence.

## 14. M1.2 implementation acceptance criteria

Report M1.2 complete only with actual evidence for each gate in its implementation PR:

1. Eleven new models, twenty listed FKs and exact index contract; no existing
   business model/table/data/auth/route/layout change.
2. Both named migrations pass isolated PostgreSQL 16 replay with zero Executive
   business rows; no seed or runtime activation.
3. Every invariant case DB-01–DB-15 passes, using raw SQL and generated Prisma
   client as appropriate, including independent non-owner and concurrency tests.
4. Unsafe test targets fail before connecting; DB suite excluded from ordinary
   discovery; no live credentials or default browser teardown.
5. Existing catalogs/synthetic fixtures unchanged after upgrade; repeat deploy
   inert; partial-failure readiness/recovery proven and documented.
6. Prisma validation/generation, targeted lint, typecheck, build and new tests
   pass; container/client smoke recorded. Existing baseline failures separated
   from any new regression, with exact counts and evidence.
7. TowerResult history gap not repaired or hidden; no additional migration drift.
8. Legitimate future recovery and expired-auth cleanup remain possible without
   destroying permanent identities or constitutional/audit history.
9. No new dependencies, production config/resources/grants, model calls, actual
   auth/bootstrap/acceptance services, shared/live/production database migration,
   merge or deployment. Real disposable test-database migrations are required.
10. Full file list, commands/results, versions/image digest, skipped tests, risks
    and Owner gates in PR/report. State technical readiness separately from merge
    authority, then stop before M1.3.

## 15. Planning completion is not implementation completion

This task ends when the contract is independently reviewed, documentation-only
changes are verified, and the Owner decision is posted on Draft PR #4. See
[planning verification](m1-2-planning-verification.md) for checks actually performed.
None of the proposed database acceptance criteria is claimed as executed/passed
during planning. Stop for Owner review; do not begin M1.2 implementation or M1.3.
