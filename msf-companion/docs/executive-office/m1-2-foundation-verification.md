# M1.2 — Foundation implementation verification

Status: **M1.2 implementation and required verification complete; stopped for Owner review.**

Final tested implementation: `77cb0eabe8297051f82a4734226dc478c98909fd`.
[Successful hosted run 35871473800](https://github.com/sccmavenger/ralph/actions/runs/35871473800),
2026-09-23 14:04–14:08 UTC. Subsequent changes are this report and verified AGENTS
guidance only. [Implementation PR #6](https://github.com/sccmavenger/ralph/pull/6).

Outcome: 364/364 new tests passed; exact existing-test/lint baseline preserved;
Prisma, typecheck, targeted lint, builds, container startup and smoke passed.
The Prisma Office single-create limitation below is explicitly retained for review.
No merge, deployment, shared/live DB operation, or M1.3 is authorized or performed.

Authorization: [Issue #5](https://github.com/sccmavenger/ralph/issues/5).
Base: `583b64ffd17d927ea5fa1b925c9d7b91dae9ce62` (approved plan, PR #4).
Branch: `executive/m1.2-foundation-schema`.

## Scope and safety boundaries

Implement only the approved eleven models, two named migrations, database guards,
isolated test harness/configuration, DB-01–DB-15 evidence and narrowly scoped hosted
PostgreSQL/container validation. The schema remains inert and migrations seed no
business rows. Synthetic test fixtures may exist only in task-owned disposable DBs.

No production/shared/live database connection or mutation, bootstrap/authentication/
Charter acceptance service, application route/layout change, M1.3, dependency
remediation, TowerResult reconciliation, merge or deployment is authorized.

## Initial local checkpoint

The eleven models, both migrations, guarded harness, invariant/concurrency tests,
and hosted workflow are written. Migration replay/failure/catalog/old-client tests
are still being completed. This checkpoint is not completion evidence.

Local secret-free source-copy checks using portable Node 24.21.0 / Prisma 7.6.0:

- `prisma validate --config prisma.executive-test.config.ts`: passed.
- `prisma generate --config prisma.executive-test.config.ts`: passed (ignored temp output).
- Dedicated `test-database.unit.test.ts`: 52/52 passed.
- `tsc --noEmit --incremental false`: passed.
- Targeted ESLint on new tests/configuration: passed.

The first typecheck exposed the pre-existing excluded web config's `poolOptions`
type error through a new static test import. Changed only the new test to load
that config at runtime; rerun passed. No legacy config cleanup or dependency change.
No local database connection was attempted. PostgreSQL and container evidence is
pending the hosted validation; the PR remains Draft.

## Known baseline concerns

- TowerResult exists in schema but not the 24 committed historical migrations.
  Preserve and report this baseline discrepancy; do not repair it here.
- Fresh Linux baseline and candidate: 676 passed, 9 failed out of 685 assertions;
  full lint: 123 errors, 36 warnings each. The failure sets are unchanged.
- M1.1 install audit: 26 vulnerabilities, including one critical. Separate security
  triage remains a pre-production gate; no dependency-wide remediation here.

## Completion gate

All ten section-14 acceptance gates of the approved plan are supported below and
by the successful run's artifacts. M1.2 is ready for Owner review, including the
documented client-operation limitation and existing baseline failures. Technical
readiness is not approval to merge, deploy, migrate a live DB, or start M1.3.

## Hosted database checkpoint (2026-09-23)

Commit `0e669f527f0b52c2d2e4e86858177d152b7e0883`,
[run 35870913018](https://github.com/sccmavenger/ralph/actions/runs/35870913018):
dedicated Executive suite, Prisma validation/generation/deployment/status,
targeted ESLint and typecheck passed. That run subsequently stopped at lint
comparison because absolute temporary paths embedded inside two otherwise
identical diagnostic messages were not normalized. Commit `77cb0ea` corrects
only that comparison and reruns all gates.

Environment: GitHub-hosted ubuntu-latest; Node 24.21.0; npm 11.19.0;
PostgreSQL 16.15 (Debian 16.15-1.pgdg12+2), pinned image:
`postgres:16-bookworm@sha256:efedf3595f1d6f415c08568ba171029bf54052e754cc9f030e3f2412b21f3d67`.
Prisma/client/adapter 7.6.0, pg 8.20.0, Vitest 4.1.3, TypeScript 5.9.3,
Next 16.2.1 and React 19.2.4 are unchanged from the baseline lockfile.

### Compatibility finding: Prisma Office ID generation

The earlier hosted run at `6fce842` passed 359/360 assertions. Its generated-client
test exposed Prisma 7.6.0 `executiveOffice.create` without an explicit ID sending
NULL for `id`, despite `@default(cuid())`. ID also participates in the optional
compound acceptance FK. PostgreSQL correctly rejects that insert (23502/P2011).
This is a new-schema client limitation, not a passing single-row create check.

The unchanged schema works with `executiveOffice.createManyAndReturn`, including
generated cuid, default inert fields, Owner/credential relations and a rolled-back
typed-client transaction. The current test explicitly checks generated cuid values.
No schema relationship was weakened, default replaced, dependency upgraded, or
bootstrap service implemented to hide this finding. Later M1.3 must use this
verified operation or separately verify an explicit-ID path before bootstrap.
Owner review should include this limitation; it is not proof of all nested-write
or future bootstrap operations.

### Invariant and migration coverage

| Gate | Evidence implemented and passed in the dedicated suite |
|---|---|
| DB-01 | Eleven empty tables; synthetic inert Office/Owner/CEO; singleton and fixed-state rejection |
| DB-02 | Primary/unique keys, external IDs/tokens/request/sequence keys; two-connection singleton winner |
| DB-03 | All 20 exact compound/simple FKs, scope columns, immediate MATCH SIMPLE and RESTRICT actions |
| DB-04 | Session/credential and challenge/grant/session linkage; purpose and null-shape rejection |
| DB-05 | Charter Unicode/multiline digest; wrong Charter/hash/reference rejection |
| DB-06 | Closed enums/JSON, SQL/JSON null, counts, strings, hashes and timestamp boundaries; delayed coherent timestamps |
| DB-07 | History UPDATE/DELETE including no-op/zero-row, broad-DML TRUNCATE CASCADE, owner RESTART IDENTITY |
| DB-08 | Permanent identities, every immutable field, valid display/use updates, terminal/monotonic rules |
| DB-09 | Challenge-first expired auth cleanup; immutable receipt/session attribution survives |
| DB-10 | Receipt-first paired authority; split COMMIT/SET CONSTRAINTS rejection; concurrent transitions |
| DB-11 | Synthetic audit failure rolls back state; sequence allocation is not a gapless audit promise |
| DB-12 | Historical stale-generation/revoked-credential references remain representable, not authenticated |
| DB-13 | Non-owner legitimate DML; separate broad-DML lane proves guards independently of privilege denial |
| DB-14 | 52 no-connection target/discovery/configuration guard tests; no dotenv/DATABASE_URL fallback |
| DB-15 | Fresh/upgrade/repeat, exact catalogs, preserved old rows, baseline-client reads/writes, two migration failure/recovery rehearsals |

Catalog contract: 11 new tables, 20 FKs, 43 CHECKs, 52 indexes including 11 primary
keys (18 additional unique / 23 nonunique), 8 functions, 26 enabled custom triggers
including two initially deferred constraint triggers. CHECK expressions are
compared against PostgreSQL-normalized reviewed SQL using session-only scratch
tables; index columns/actions and function bodies/timing/flags are asserted.

Upgrade snapshots cover all 22 historically migrated business tables: columns,
types/defaults, constraints, indexes, triggers, owner/ACL/RLS settings, and one
synthetic sentinel row per table. The baseline-generated 23-model Prisma client
reads all 22 migrated tables and performs a rolled-back write before and after
upgrade. No TowerResult compatibility or live-data behavior is claimed.

Fresh replay applies all 24 historical plus 2 new migrations. A second deploy
leaves migration records, catalogs, sentinel rows, and empty Executive tables
unchanged. The baseline/candidate Prisma drift scripts must match byte-for-byte;
the pre-existing missing TowerResult table/indexes/FK remain, not repaired.

Each failure lane inserts a deliberate exception after DDL but before COMMIT in a
disposable copy. Tests require P3018, absent partial DDL, unchanged prior catalogs,
unfinished migration metadata, and P3009 on retry. Only after that proof is the
failed disposable migration marked rolled back, restored to the correct SQL and
reapplied. Failure of the guard migration leaves foundation readiness false.
No shared migration was edited or resolved; later real bootstrap refusal is M1.3.

TRUNCATE tests drain pending deferred checks first so PostgreSQL's 55006 precheck
cannot mask the custom guard. RESTART IDENTITY requires sequence ownership before
triggers fire, so that additional case uses the disposable migrator; ordinary
UPDATE/DELETE/TRUNCATE guard proofs still use the non-owner application role.

Two valid Offices cannot coexist under the approved singleton contract. Scope
testing combines catalog proof, valid single-scope references and invalid/missing
references; it is not a fabricated two-tenant integration test.

## Changed files (complete inventory)

Exactly the fifteen files authorized by section 10 of the approved plan:

| Repository-relative file | Change |
|---|---|
| `msf-companion/prisma/schema.prisma` | Append eleven models; existing model prefix unchanged |
| `msf-companion/prisma/migrations/20260922090000_executive_foundation/migration.sql` | New tables, CHECKs, indexes, FKs, JSON helper; explicit transaction |
| `msf-companion/prisma/migrations/20260922090100_executive_immutability_guards/migration.sql` | History/identity/update/scope/authority guards; explicit transaction |
| `msf-companion/prisma.executive-test.config.ts` | Guarded test-only Prisma datasource |
| `msf-companion/vitest.executive.config.ts` | Exclusive Executive discovery, no env-file loading, one worker |
| `msf-companion/vitest.config.ts` | Only add Executive-suite exclusion |
| `msf-companion/tests/executive/test-database.ts` | URL guards, scoped clients, rollback fixtures, isolated child DBs |
| `msf-companion/tests/executive/test-database.unit.test.ts` | 52 safety/discovery assertions |
| `msf-companion/tests/executive/foundation.integration.test.ts` | 224 model/constraint/Prisma/privilege assertions |
| `msf-companion/tests/executive/immutability.integration.test.ts` | 79 direct-SQL immutability/update/cleanup/audit assertions |
| `msf-companion/tests/executive/migrations.integration.test.ts` | 4 comprehensive replay/upgrade/repeat/recovery/catalog/old-client lanes |
| `msf-companion/tests/executive/concurrency.integration.test.ts` | 5 real two-connection interleavings |
| `.github/workflows/m1-2-foundation-validation.yml` | Branch-scoped hosted validation; evidence; owned-container cleanup |
| `msf-companion/docs/executive-office/m1-2-foundation-verification.md` | This report |
| `msf-companion/AGENTS.md` | Verified isolation, client, transaction and review-boundary patterns |

No package/lockfile, runtime target, Dockerfile, production Prisma configuration,
existing migration, application source, route/layout, infrastructure, deployment
workflow, legacy Function or email change. CI compares these paths and historical
migration bytes against `583b64ffd17d927ea5fa1b925c9d7b91dae9ce62`.

## Commands and configuration

Executed with installed/locked tools, not downloaded latest packages:

```text
npm ci --no-audit --no-fund
node node_modules/prisma/build/index.js validate --config prisma.executive-test.config.ts
node node_modules/prisma/build/index.js generate --config prisma.executive-test.config.ts
node node_modules/prisma/build/index.js migrate deploy --config prisma.executive-test.config.ts
node node_modules/prisma/build/index.js migrate status --config prisma.executive-test.config.ts
node node_modules/vitest/vitest.mjs run --config vitest.executive.config.ts
node node_modules/eslint/bin/eslint.js tests/executive prisma.executive-test.config.ts vitest.executive.config.ts
node node_modules/typescript/bin/tsc --noEmit --incremental false
node node_modules/vitest/vitest.mjs run --exclude 'functions/**' --exclude 'src/lib/wallet.test.ts' --maxWorkers=4
node node_modules/eslint/bin/eslint.js --format json
npm run build
```

The historical and candidate application checks run from separate clean sources
with inert/dummy configuration. Migration harness subprocesses additionally run
`migrate diff --from-config-datasource --to-schema schema.prisma --script`,
`migrate resolve --rolled-back <failed-name>` and baseline client `generate`,
always through validated child targets/configs. These are disposable rehearsals,
not operating instructions for a live database.

The four test-only variables are `EXECUTIVE_TEST_DATABASE_URL`,
`EXECUTIVE_TEST_MIGRATION_DATABASE_URL`, `EXECUTIVE_TEST_DATABASE_CONFIRM`, and
`NODE_ENV=test`. No production variable or feature flag was added. Hosted setup
generates/masks random credentials for `exec_test_migrator` (non-superuser,
CREATEDB) and `exec_test_app` (non-owner/non-superuser/non-CREATEDB), binds the owned
PostgreSQL instance to 127.0.0.1:55432, and removes only containers with this run's
ownership label. Child processes strip application/PG fallback environment.

## Regression results and limitations

Dedicated tests: **364 passed, 0 failed**, across five files. Baseline and candidate
existing web suites: **676 passed, 9 failed**, across 86 files / 685 assertions,
with matching test names/status. Full lint: **123 errors / 36 warnings** each;
all diagnostic rules, severity, locations and messages match after normalizing
the two source-copy root paths, including paths within message text. These are
not clean full-test/full-lint results. Targeted new-file lint is clean.

The nine pre-existing Tower failures are in `tower/history/route.test.ts` (1),
`tower/events/route.test.ts` (3), and `tower/rooms/route.test.ts` (5): authentication
status, empty/active-event shape, week selection, and room lookup/mapping
expectations. Their exact test names and stacks are preserved in baseline and
candidate JSON/log artifacts. No failures were removed or relabeled passing.

Deliberately not run: the DB-writing wallet integration file, legacy Functions
tests, captured-credential/default-teardown Playwright suite, live customer/admin
sessions, actual passkeys/recovery, OAuth, billing, email delivery, game/provider
calls, shared database/production migration, physical-device/UI checks or M1.3
bootstrap. Schema fixtures do not implement these services. Existing public
container smoke is separate from authenticated E2E coverage.

Security boundary: custom invoker guards protect ordinary DML; they do not protect
against DDL-capable administrators. No production role/grant/RLS configuration
was inspected or changed. Runtime/migration role separation, real authentication,
metadata redaction, last-passkey protection and later services remain explicit
pre-release/later-story work. No new model authority, tooling, spending, or CEO
execution is activated. CI uses GitHub Actions minutes only; no Azure resources,
registry publication, production deployment or permanent local engine.

## Validation iteration record

| Commit / hosted run | Result and bounded correction |
|---|---|
| `b920302` / [35857734956](https://github.com/sccmavenger/ralph/actions/runs/35857734956) | All 26 migrations applied; 126 assertions passed / 7 failed plus one collection error. Fixed BigInt test-label serialization and truncate prechecks, without SQL contract changes. |
| `6fce842` / [35857909603](https://github.com/sccmavenger/ralph/actions/runs/35857909603) | 359/360 passed. Identified Office single-create limitation; switched fixture to verified bulk-return client operation. |
| `d1259ec` / [35870600961](https://github.com/sccmavenger/ralph/actions/runs/35870600961) | 360 passed / 4 catalog assertions failed because pg returned name[] as text. Cast catalog identifiers to text[] for structural comparison. |
| `0e669f5` / [35870913018](https://github.com/sccmavenger/ralph/actions/runs/35870913018) | 364/364 passed; targeted checks and baseline build passed. Web/lint counts unchanged; lint comparison required embedded root-path normalization. |
| `77cb0ea` / [35871473800](https://github.com/sccmavenger/ralph/actions/runs/35871473800) | All gates passed: 364/364 new tests, exact existing regression comparison, typecheck/lint/build, container startup and 14-request smoke. |

## Final container and build evidence

Both the baseline host production build and the current candidate Dockerfile
build passed. Candidate compilation, build-time TypeScript and all 70 static
pages succeeded; the Dockerfile is unchanged. Build took approximately 81 seconds.

- Base: `node:24.21.0-alpine@sha256:ebfe2f90462722a7a4de65e91990e97fe0d401c70e0e762c5b53302f905ec1c1`.
- Runner-local candidate image: `sha256:e2a66865972f4a43f10f407da0f41c9288e33fa835522b8c41ae517df1c27172`.
- Started successfully as UID 1001 / Node v24.21.0 with `--network none`, dummy
  session secrets and inert loopback database configuration.
- Readiness: `/api/auth/session` returned 200 and `{ "authenticated": false }`.
- HTTP smoke: 14/14 expected statuses, redirect destinations and response checks.
  Public `/`, `/faq`, `/privacy`, `/terms`, `/admin`, and session endpoint: 200;
  protected inventory/admin APIs: 401; `/subscribe`, `/admin/dashboard`,
  `/dashboard`, `/inventory`, `/roster`, `/planner`: expected 307 redirects.
- Native Sharp generated a 91-byte PNG; the container remained running through
  verification. Always-captured startup/state logs show successful readiness.
- Only the two job-owned containers were removed afterward. Synthetic DB data
  was disposable and discarded; no user DB was removed. Evidence remains in
  artifacts (14-day retention) and substantive results are permanent in this report.

The workflow ran `docker build --pull --progress=plain` against the current
`msf-companion/Dockerfile`, then internal loopback requests via `docker exec`.
It did not push an image or invoke Azure/deployment tools.

### Warnings, not silently remediated

- Current Docker `npm ci` reported 26 vulnerabilities: 1 low, 10 moderate, 14 high,
  1 critical. This matches the previously recorded aggregate but is not
  advisory-level exploitability/security clearance. Separate triage remains a
  pre-production gate; no dependency or lockfile changes were made.
- npm 11.19 reported install-script allow-list warnings for Prisma engines,
  Prisma, Sharp and unrs-resolver; actual generation/build/native smoke passed.
- Existing Next.js middleware-to-proxy and removed Vitest poolOptions warnings
  remain. The normal test config was not refactored; workers were bounded by CLI.
- The temporary baseline Prisma client's TypeScript module was reparsed as ESM
  under Node 24 (MODULE_TYPELESS_PACKAGE_JSON); reads and rollback writes passed.
  No application package-module setting was changed.
- Pinned GitHub v4 actions target Node 20 but the hosted runner forced Node 24;
  deprecation/punycode/url.parse warnings did not fail the job. The actual app
  runtime and all CLI checks used the approved Node 24.21.0 target.

## Evidence and Owner handoff

[Artifact bundle](https://github.com/sccmavenger/ralph/actions/runs/35871473800/artifacts/10754923311):
`m1-2-evidence-77cb0eabe8297051f82a4734226dc478c98909fd`, SHA-256
`d4e4920616c212213f843bf634f4d5fc78f0e7ee5ebc701d75221c692a569f83`.
Includes exact versions/image IDs, migration commands and failed/recovered metadata,
before/after business snapshots, exact catalog and unchanged drift SQL, old-client
logs, 364-test JSON, baseline/candidate tests/lint, builds and startup/smoke logs.
Artifacts are redacted and expire after 14 days; this checked-in report preserves
the findings required for review.

Local evidence copies and secret-free verification output are under Windows
temporary directories (`msf-m12-evidence-35871473800` and
`msf-m12-local-52a7dd52bd9d43e5b881bbe2cb35f1ab`). No permanent engine or global
runtime was installed, and the user's existing development server was not stopped.
The checkout's ignored Prisma client was also regenerated with the guarded config
and dummy test values for local consistency; generation did not connect to a DB.

Recommendation: accept M1.2 for review/merge as an inert, additive foundation,
with the documented Prisma creation path and existing security/test/lint/Tower
limitations explicitly acknowledged. No new existing-application regression or
additional migration drift was observed within the checks performed. Safe-to-merge
assessment is **conditional on Owner review/approval**, not production readiness.

Next proposed action: Owner reviews PR #6 and separately decides merge authority
and whether to authorize M1.3. Work stops here; no bootstrap/auth/UI/CEO services
or later milestone work has begun.
