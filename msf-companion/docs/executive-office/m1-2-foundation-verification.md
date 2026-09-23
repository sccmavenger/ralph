# M1.2 — Foundation implementation verification

Status: implementation in progress; not complete or ready to merge.

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

## Current checkpoint

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
- M1.1 selected web tests: 676 passed, 9 failed; full lint: 123 errors, 36 warnings.
  These are historical results until the before/after regression run is complete.
- M1.1 install audit: 26 vulnerabilities, including one critical. Separate security
  triage remains a pre-production gate; no dependency-wide remediation here.

## Completion gate

Not yet satisfied. Keep the implementation PR Draft and update actual evidence as
checks complete. Stop for Owner review after M1.2; never advance to M1.3 automatically.
