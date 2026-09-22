# Approved M1 plan — source snapshot

Recorded for independent review of [Issue #3](https://github.com/sccmavenger/ralph/issues/3).
This is the Owner-approved M1 plan, preserved below without substantive edits.
Original file: `MSF_Toolkit_AI_Executive_Office_M1_Implementation_Plan.md`.
Original file SHA-256: `01452306db7da7c77407c0b579717993e7d310deae157cd8c976b1dd8f916af5`.

The original proposal wording is historical: the Owner subsequently approved
passkeys, separate Executive authentication, analytics isolation, and the
Charter/audit architecture. M1.1 is complete and merged through PR #2. Issue #3
authorizes **M1.2 planning only**. Neither this snapshot nor its broader file plan
authorizes implementation of later stories. The Owner additionally requires any
route/layout move to be an isolated mechanical change, verified before and after.

See [the detailed M1.2 plan](m1-2-foundation-schema-plan.md) for proposed schema
refinements, implementation gates, and current evidence. The Charter remains the
constitutional authority; this source snapshot is not a Charter import or acceptance.

---

# M1 Implementation Plan — Executive Office Foundation

**Your revised milestone order is adopted. M1 will establish identity, constitutional records, security, and a minimal interface—not activate an autonomous CEO.**

This is a proposed implementation plan only. No files, migrations, configuration, or production systems have been changed as part of implementation. This Markdown document records the plan for review and sharing.

## 1. Revised milestone order

M0–M5 remain unchanged. The revised sequence is:

| Milestone | Deliverable |
|---|---|
| M6 | Workforce |
| M7 | **First Real Onboarding** |
| M8 | Full Owner Portal |
| M9 | Engineering Bridge |
| M10 | Release Hardening |

M7 becomes an explicit gate before M9: the CEO must demonstrate evidence-based company understanding, proposed objectives, capability-gap analysis, and an organizational proposal before automated engineering access is introduced.

A usable briefing/review interface will accompany M7; it will not depend on the full portal arriving in M8.

## 2. M1 outcome and scope

At completion, you should be able to:

1. Sign in as the specifically identified human Owner.
2. Review and accept an exact version of the Charter.
3. See one CEO agent reporting to you.
4. Confirm that the CEO is in `ONBOARDING` state with execution disabled.
5. Inspect the audit history of setup, authentication, and Charter acceptance.
6. Manage your authentication credentials and revoke sessions.

**M1 will not include:**

- Model calls or CEO conversations.
- Company analysis or real CEO onboarding.
- Objectives, KPIs, strategy, or department seeding.
- Employee creation, assignments, or hiring.
- Scheduled CEO runs, queues, or autonomous tools.
- Business approvals or the Green/Yellow/Red engine.
- GitHub automation, customer communications, billing changes, or production deployment.

Owner credential enrollment in M1 is distinct from **CEO onboarding in M7**.

## 3. Owner identity design

### Recommended authentication: Owner passkeys

I recommend application-managed passkeys, using a maintained WebAuthn library, with required user verification. This allows an authenticator such as Windows Hello, a phone, or a security key to verify your presence.

This is a specific recommendation for your review—not an authentication choice already implemented.

The existing customer and admin authentication remain unchanged:

- `msf-session` continues to identify a player.
- `admin-session` continues to serve the existing admin tools.
- A new, separate Executive Owner session identifies you.

Neither an admin cookie, a matching email address, nor a client-supplied Owner ID grants Executive Office access.

The Owner will have:

- One immutable database identity.
- A display name supplied during setup.
- An optional contact email, used as contact information—not authorization.
- One or more passkeys belonging to that same identity.
- A revocation/version counter checked on protected requests.

Multiple passkeys do **not** create multiple Owners.

### Enrollment

There will be no public Owner signup.

An explicit operator command will:

1. Prepare the single Owner record.
2. Issue a cryptographically random, short-lived enrollment grant.
3. Store only its hash.
4. Display it once for the Owner to enter into the enrollment screen.

The grant will not appear in a URL, source file, application log, or command-line argument.

Enrollment must validate:

- The intended Owner.
- The server-generated challenge and browser binding.
- The exact configured origin and relying-party ID.
- Required authenticator user verification.
- Grant and challenge expiration.
- Single-use consumption.

Credential creation, Owner activation, grant consumption, and the corresponding audit records must commit atomically.

### Sessions and recovery

Recommended initial security defaults:

| Control | Proposed default |
|---|---|
| Enrollment grant lifetime | 15 minutes |
| Authentication challenge lifetime | 5 minutes |
| Owner session absolute lifetime | 8 hours |
| Owner session idle timeout | 30 minutes |
| Recent verification for sensitive setup changes | Within 5 minutes |

Use a separate encrypted cookie containing an opaque session token, with only its hash stored in PostgreSQL. Production cookies will be Secure, HttpOnly, host-only, and SameSite=Strict.

Every protected request checks the database session, Owner status, authentication version, and expiry. Cookie presence alone is insufficient.

Recovery will be an explicit operator procedure that preserves the Owner identity and history, revokes old access, and issues a new short-lived enrollment grant. There will be no hidden emergency password.

The UI will support adding a backup passkey. Localhost and production enrollment remain separate; localhost credentials will not be assumed to work on the production domain.

These controls follow the distinction between authentication, session management, and sensitive-action reauthentication described by [OWASP](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html).

### Runtime prerequisite discovered

The current Dockerfile uses Node 20. Current SimpleWebAuthn server documentation requires Node 22 or newer, and Node’s release table lists Node 20 as end-of-life. I recommend **Node 24 LTS** as an explicit compatibility prerequisite, subject to your approval of this plan. [SimpleWebAuthn requirements](https://simplewebauthn.dev/docs/packages/server), [Node release status](https://nodejs.org/en/about/previous-releases).

This would be a separately tested change within M1—not an unannounced dependency downgrade or a rewrite of Next.js, React, or Prisma.

## 4. Exact proposed database scope

M1 adds **11 models**. No existing business model is replaced, and no existing customer rows are backfilled or changed.

Common conventions:

- `id: String`, generated with `cuid()`.
- UTC timestamps.
- `createdAt` on all records.
- Explicit database constraints for allowed states.
- Executive records do not cascade under `Commander`.
- Historical Charter, acceptance, and audit records are append-only.
- Foreign keys prevent cross-Office or cross-Owner associations.

### Model definitions

| Model | Proposed fields beyond common `id` / `createdAt` |
|---|---|
| **ExecutiveOffice** | `key: String` unique, fixed to `msf-toolkit`; `name: String`; `phase: String` default `FOUNDATION`; `executionMode: String` default `DISABLED`; `bootstrapVersion: Int`; `bootstrapHash: String`; `activeCharterAcceptanceId: String?`; `updatedAt` |
| **ExecutiveOwner** | `officeId: String` unique; `displayName: String`; `contactEmail: String?`; `status: String` default `PENDING_ENROLLMENT`; `webauthnUserId: String` unique; `authVersion: Int` default `1`; `updatedAt` |
| **ExecutiveOwnerCredential** | `ownerId: String`; `credentialId: String` unique; `publicKey: Bytes`; `counter: BigInt`; `rpId: String`; `label: String`; `transports: Json`; `deviceType: String`; `backedUp: Boolean`; `lastUsedAt: DateTime?`; `revokedAt: DateTime?` |
| **ExecutiveOwnerEnrollment** | `ownerId: String`; `purpose: String` (`INITIAL` or `RECOVERY`); `tokenHash: String` unique; `expiresAt`; `consumedAt?`; `revokedAt?`; `operatorReason: String` |
| **ExecutiveOwnerChallenge** | `ownerId: String`; `purpose: String`; `challenge: String` unique; `browserBindingHash: String`; `enrollmentId: String?`; `sessionId: String?`; `authVersion: Int`; `expiresAt`; `consumedAt?` |
| **ExecutiveOwnerSession** | `ownerId: String`; `credentialId: String`; `tokenHash: String` unique; `authVersion: Int`; `verifiedAt`; `lastSeenAt`; `idleExpiresAt`; `absoluteExpiresAt`; `revokedAt?` |
| **ExecutiveAuthRateLimit** | `bucketKeyHash: String` unique; `attemptCount: Int`; `windowStartedAt`; `blockedUntil?`; `expiresAt`; `updatedAt` |
| **ExecutiveAgent** | `officeId: String`; `roleKey: String` fixed to `CEO` in M1; `displayName: String`; `reportsToOwnerId: String`; `status: String` default `ONBOARDING`; `roleDefinitionVersion: Int`; `roleDefinition: Json`; `governingCharterAcceptanceId: String?`; `updatedAt` |
| **ExecutiveCharter** | `officeId: String`; `version: Int`; `title: String`; `contentMarkdown: String`; `contentHash: String`; `sourceFileName: String`; `sourceFileHash: String`; `importedByOwnerId: String?` |
| **ExecutiveCharterAcceptance** | `officeId: String`; `charterId: String`; `ownerId: String`; `ownerCredentialId: String`; `ownerSessionRef: String`; `contentHash: String`; `verifiedAt`; `acceptedAt`; `requestKey: String` unique |
| **ExecutiveActivityEvent** | `officeId: String`; `sequence: BigInt` unique/generated; `eventType: String`; `actorType: String`; `actorOwnerId: String?`; `subjectType: String`; `subjectId: String?`; `requestId: String`; `outcome: String`; `metadata: Json`; `occurredAt` |

`ownerSessionRef` in a permanent acceptance receipt will be a non-secret reference, not a session token. It will not prevent eventual cleanup of expired session records.

### Database invariants

The migrations will enforce:

- One Office, through a unique fixed Office key.
- One Owner per Office.
- One CEO per Office, with no other agent role permitted in M1.
- Unique credential IDs and token hashes.
- Unique Charter version per Office.
- Valid relationships between Office, Owner, CEO, Charter, and acceptance.
- Valid state values and expiry relationships.
- Nonnegative authenticator counters and throttle counts.
- No update/delete/truncate operations on historical Charter, acceptance, or audit tables through normal application operations.

The CEO’s role definition will contain no tools, delegated permissions, or spending authority.

No `ExecutiveObjective`, workforce proposal, model-usage, approval, or runtime tables are included yet. Those remain in their corresponding later milestones.

### Proposed migrations

Under `msf-companion/prisma/migrations/`:

1. **`20260922090000_executive_foundation/migration.sql`**
   - Creates the 11 tables.
   - Creates foreign keys and indexes.
   - Creates uniqueness and state constraints.
   - Does not create an Owner, CEO, or Charter automatically.

2. **`20260922090100_executive_immutability_guards/migration.sql`**
   - Adds append-only guards for Charter versions, acceptance receipts, and audit events.
   - Adds immutable-identity protections.
   - Does not change existing application tables.

Both migrations must be rehearsed together against an isolated database before bootstrap is allowed.

Rollback means disabling the Executive Office and rolling back application code—not dropping its history.

## 5. CEO bootstrap behavior

Bootstrap is an explicit operator command, not something a page request or deployment does automatically.

The process will:

1. Validate the target environment and database.
2. Verify that both M1 migrations exist.
3. Validate the packaged Charter and its hashes.
4. Acquire transactional protection against concurrent initialization.
5. Create the Office.
6. Create the one human Owner in `PENDING_ENROLLMENT`.
7. Import Charter version 1 without automatically accepting it.
8. Create one CEO in `ONBOARDING`.
9. Record bootstrap events.
10. Commit everything together.

Repeated bootstrap with identical inputs returns the existing records.

Repeated bootstrap with different Owner details or a different constitutional source fails with an explicit conflict. It must not overwrite the existing Owner or Charter.

After you enroll and accept the Charter:

- The Office points to the acceptance receipt.
- The CEO references that accepted Charter.
- The CEO remains `ONBOARDING`.
- Execution remains `DISABLED`.
- No model call, task, schedule, employee, or business objective is created.

The UI will say **“Foundation ready; CEO onboarding has not run.”** It will not present setup completion as an AI-generated company assessment.

## 6. Charter storage and versioning

The constitutional source is:

`MSF_Toolkit_AI_CEO_Charter_and_Governance_Framework.docx`

The implementation packages are technical specifications; they will not silently become additional constitutional authority.

M1 will include:

- A faithful Markdown transcription of the Charter.
- A manifest identifying the source file and its SHA-256 hash.
- A canonical text hash for the stored Charter content.
- An immutable version record.
- An attributable Owner acceptance receipt.

Acceptance requires:

- A valid Owner session.
- Recent passkey verification.
- The exact Charter ID, version, and content hash being reviewed.
- The expected current acceptance ID, preventing stale-tab overwrites.

Updating the active Charter means importing a **new immutable version** and explicitly accepting it. Existing versions are not edited.

Changing the Charter does not enable CEO execution.

## 7. Audit foundation

Audit records will identify:

- Actor and actor type.
- Operation and affected record.
- Timestamp and request/correlation ID.
- Success, rejection, or failure.
- Relevant version/hash.
- Allowlisted, redacted metadata.

Initial event types include:

- Office and CEO bootstrapped.
- Enrollment issued and completed.
- Authentication succeeded or rejected.
- Credential added or revoked.
- Session revoked.
- Recovery initiated and completed.
- Charter version imported.
- Charter accepted.
- Executive access denied.

Bootstrap operators will be recorded as operators, not falsely attributed to an authenticated Owner.

Security-sensitive state changes and their success audit records must commit in the same database transaction. An audit failure must prevent the corresponding state change.

No passwords, enrollment grants, session tokens, raw authentication payloads, or unnecessary personal data will enter the audit trail.

This is an **append-only application audit foundation**, not a claim of immutable storage against a privileged database administrator.

## 8. Minimal Executive Office UI

The URL remains **`/admin/executive`**, within the existing application.

M1 screens:

| Screen | Purpose |
|---|---|
| Sign in | Authenticate the named Owner |
| Enroll | Redeem the short-lived setup/recovery grant and register a passkey |
| Overview | Owner, CEO, Charter status, execution-disabled notice, setup readiness |
| Charter | Read versioned content and explicitly accept an exact version |
| Activity | Paginated, filterable setup/security audit |
| Security | Add/revoke passkeys, revoke sessions, show recovery guidance |

There will be no working CEO chat, fabricated briefing, hiring interface, or business approval queue.

The UI will support desktop and mobile, keyboard navigation, readable focus states, and browser zoom.

### Required analytics isolation

The existing root layout loads Google Analytics on every page. A nested Executive layout cannot remove a script inherited from that root, and hiding it after navigation does not unload it.

I recommend two root-layout groups in the same Next.js application:

- `(site)` — existing pages, preserving their current behavior.
- `(executive)` — Executive Office pages, without third-party analytics.

Next.js supports this organization without changing URLs, and navigation between different root layouts causes a full page load. [Next.js route-group documentation](https://nextjs.org/docs/app/api-reference/file-conventions/route-groups).

This is a mechanical layout separation—not a redesign of the player application. It does not create a separate application or security origin.

## 9. Exact file plan

All paths below are relative to `msf-companion/`, unless marked repository-level. Brace lists name the exact proposed files.

### Foundation services — create

Under `src/lib/executive/`:

- `config.ts`
- `contracts.ts`
- `bootstrap.ts`
- `owner-auth.ts`
- `owner-session.ts`
- `webauthn.ts`
- `enrollment.ts`
- `credentials.ts`
- `request-security.ts`
- `rate-limit.ts`
- `charter.ts`
- `audit.ts`
- `queries.ts`

These modules will be server-only where they handle persistence, credentials, or security decisions.

### Operator utilities — create

Under `scripts/executive/`:

- `bootstrap.ts`
- `issue-enrollment.ts`
- `recover-owner.ts`
- `import-charter.ts`
- `verify-foundation.ts`
- `maintenance.ts`

Maintenance is limited to expired authentication/throttle artifacts. It cannot purge constitutional or audit history.

### API routes — create

Under `src/app/api/admin/executive/`:

- `auth/challenge/route.ts`
- `auth/verify/route.ts`
- `auth/session/route.ts`
- `auth/logout/route.ts`
- `auth/sessions/revoke/route.ts`
- `credentials/route.ts`
- `credentials/[id]/revoke/route.ts`
- `summary/route.ts`
- `charters/route.ts`
- `charters/[id]/accept/route.ts`
- `activity/route.ts`

The challenge endpoint supports only defined authentication purposes. Verification uses the purpose stored server-side; the browser cannot switch an enrollment challenge into a login or reauthentication challenge.

Every non-enrollment protected operation independently checks Owner authorization.

### Executive UI — create

- `src/app/(executive)/layout.tsx`
- `src/app/(executive)/admin/executive/login/page.tsx`
- `src/app/(executive)/admin/executive/enroll/page.tsx`
- `src/app/(executive)/admin/executive/(protected)/layout.tsx`
- `src/app/(executive)/admin/executive/(protected)/page.tsx`
- `src/app/(executive)/admin/executive/(protected)/charter/page.tsx`
- `src/app/(executive)/admin/executive/(protected)/activity/page.tsx`
- `src/app/(executive)/admin/executive/(protected)/security/page.tsx`
- `src/app/(executive)/admin/executive/_components/ExecutiveShell.tsx`
- `src/app/(executive)/admin/executive/_components/OwnerAccessForm.tsx`
- `src/app/(executive)/admin/executive/_components/OwnerSecurityPanel.tsx`
- `src/app/(executive)/admin/executive/_components/CharterPanel.tsx`
- `src/app/(executive)/admin/executive/executive.module.css`
- `src/app/fonts.ts`

### Existing UI files — mechanical moves

Every tracked descendant retains its relative path under the new prefix:

| Current path | Proposed path | Existing files |
|---|---|---:|
| `src/app/layout.tsx` | `src/app/(site)/layout.tsx` | 1 |
| `src/app/page.tsx` | `src/app/(site)/page.tsx` | 1 |
| `src/app/(app)/` | `src/app/(site)/(app)/` | 43 |
| `src/app/admin/` | `src/app/(site)/admin/` | 13 |
| `src/app/faq/` | `src/app/(site)/faq/` | 2 |
| `src/app/feedback/` | `src/app/(site)/feedback/` | 2 |
| `src/app/privacy/` | `src/app/(site)/privacy/` | 1 |
| `src/app/subscribe/` | `src/app/(site)/subscribe/` | 3 |
| `src/app/terms/` | `src/app/(site)/terms/` | 1 |

That is **67 file moves**, primarily path-only changes. Shared components, API routes, global CSS, robots, sitemap, and favicon remain in place.

Relative imports to shared components need adjustment in the moved root/homepage, subscription page, customer layout, inventory page, roster components, and Heroes client.

The moved admin dashboard page/client will receive a feature-gated Executive Office entry link. No player navigation or QR redesign is included.

### Existing configuration — change

- `prisma/schema.prisma`
- `package.json`
- `package-lock.json`
- `Dockerfile`
- `.env.example`
- `AGENTS.md`
- `src/middleware.ts` → `src/proxy.ts`
- Repository-level `.github/workflows/refresh-kb.yml`, solely to align the web-package runner with the approved Node runtime

The Proxy rename follows the installed Next.js 16 convention. New security-header behavior is scoped to Executive routes; Proxy will not become the authoritative session validator.

Create `.node-version` for the approved Node major.

No changes to `azure.yaml`, infrastructure provisioning, legacy Functions, Stripe, Resend campaigns, or player authentication are planned.

### Documentation — create

- `docs/executive-office/m1-plan.md`
- `docs/executive-office/owner-access.md`
- `docs/executive-office/operations.md`
- `docs/executive-office/charter/charter-v1.md`
- `docs/executive-office/charter/charter-v1.manifest.json`
- Repository-level `tasks/prd-executive-m1-foundation.md`

## 10. Security controls

M1 must include:

- Separate Owner authentication and session secrets.
- Server-side authorization on every protected page and API.
- Required passkey user verification.
- Exact configured origin/RP validation—not values inferred from request headers.
- Single-use, expiring, browser-bound challenges.
- CSRF/origin checks on mutations.
- Strict request schemas, content types, and body-size limits.
- Shared, database-backed throttling across application replicas.
- Generic authentication errors.
- Immediate session revocation and Owner-status enforcement.
- Recent verification for Charter acceptance and credential changes.
- Protection against removing the last usable credential through the ordinary UI.
- `private, no-store` responses for Executive data.
- Executive-only Content Security Policy, framing restrictions, no-referrer policy, and noindex metadata.
- No analytics, customer tracking, or offline caching of Executive content.
- No production-accessible test-login or database-seeding endpoint.

The existing broad admin privileges are not converted into agent capabilities.

M1’s execution-disabled guarantee comes from both persisted state and the absence of execution machinery—not a prompt telling the CEO to behave.

## 11. Tests and acceptance criteria

### Exact new test areas

Create colocated unit tests:

`src/lib/executive/{config,bootstrap,owner-auth,owner-session,webauthn,enrollment,credentials,request-security,rate-limit,charter,audit,queries}.test.ts`

Create route tests beside each new API route.

Create isolated database tests:

- `tests/executive/foundation.integration.test.ts`
- `tests/executive/auth.integration.test.ts`
- `tests/executive/charter-audit.integration.test.ts`
- `tests/executive/test-database.ts`
- `vitest.executive.config.ts`

Create independent browser coverage:

- `playwright.executive.config.ts`
- `e2e/executive/fixtures.ts`
- `e2e/executive/owner-access.spec.ts`
- `e2e/executive/foundation.spec.ts`
- `e2e/executive/charter.spec.ts`
- `e2e/executive/security.spec.ts`
- `e2e/executive/navigation-isolation.spec.ts`

The Executive suite must not depend on captured Scopely credentials or the existing teardown that kills the listener on port 3000. It will own a separate test server and isolated database.

### Acceptance gates

M1 passes only when:

1. Bootstrap creates exactly one Owner and one CEO.
2. Concurrent and repeated bootstrap cannot create duplicates.
3. Conflicting bootstrap inputs cannot overwrite existing identities.
4. Ordinary customer/admin cookies cannot access protected Executive data.
5. Valid passkey authentication succeeds.
6. Wrong origin, wrong RP, missing user verification, expired challenges, and replay attempts fail.
7. Enrollment grants cannot be reused or applied to another Owner.
8. Revoked, expired, locked, and old-version sessions fail immediately.
9. Recovery preserves identity/history while invalidating prior access.
10. Charter content matches its source manifest and stored hash.
11. A stale or altered Charter acceptance request fails.
12. Accepted versions and acceptance receipts cannot be edited.
13. Audit failure rolls back the associated sensitive change.
14. Database-level attempts to alter protected history are rejected.
15. Direct visits and navigation into Executive pages do not load inherited analytics.
16. CEO status remains `ONBOARDING`, with no model calls, tools, jobs, or subordinate agents.
17. Mobile/desktop usability, keyboard access, and zoom work.
18. Existing player pages, QR, admin tools, and public URLs retain their behavior.
19. Typecheck, targeted lint, unit/integration/browser tests, production build, and container checks pass.
20. No new regression is hidden behind an unrelated existing test failure.

A real-device passkey check should also be completed with you during local review. Browser emulation does not prove physical-device enrollment works.

## 12. Configuration and environment variables

| Variable | Purpose / default |
|---|---|
| `EXECUTIVE_OFFICE_ENABLED` | Defaults to `false`; hides/disables Executive routes |
| `EXECUTIVE_ORIGIN` | Exact permitted browser origin |
| `EXECUTIVE_RP_ID` | Exact WebAuthn relying-party ID |
| `EXECUTIVE_SESSION_SECRET` | New, independent session/ceremony sealing secret |
| `EXECUTIVE_AUTH_RATE_LIMIT_SECRET` | Hashes throttle identifiers without retaining raw identifiers |
| `EXECUTIVE_TEST_DATABASE_URL` | Isolated test database; never used by production application code |

Reuse the existing `DATABASE_URL` for application persistence.

Local development uses an explicitly configured localhost origin. Production would use the approved custom domain—not a wildcard or an automatically trusted Azure hostname.

There will be:

- No permanent bootstrap password in environment variables.
- No Owner authority inferred from an email environment variable.
- No AI/model variables required by M1.
- No cron secret or scheduler added.
- No new cloud resource required.

Missing or invalid Executive configuration fails closed without taking down unrelated application pages.

Production secret/configuration changes would require a later, explicit release approval.

## 13. Build sequence after approval

| Story | Work |
|---|---|
| M1.1 | Runtime/dependency compatibility and baseline regression checks |
| M1.2 | Additive models, migrations, and database invariants |
| M1.3 | Transactional bootstrap, Charter import, and audit primitives |
| M1.4 | Owner enrollment, passkeys, sessions, throttling, and recovery |
| M1.5 | Exact-version Charter acceptance |
| M1.6 | Analytics-isolated layouts and minimal Executive UI |
| M1.7 | Integration/browser/security tests and operating documentation |
| M1.8 | Local Owner walkthrough and completion report |

Each story will remain independently reviewable. The completion report will list files, migrations, tests, configuration, remaining risks, and the next milestone.

**The main choices for your review are passkey-based Owner authentication, the analytics-isolating layout split, and the Node 24 LTS prerequisite. I will not start M1 implementation until you explicitly approve this detailed plan.**
