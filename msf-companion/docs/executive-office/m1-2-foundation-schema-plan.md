# M1.2 — Foundation schema implementation plan

Status: planning in progress; **implementation is not authorized**.

Issue: [#3](https://github.com/sccmavenger/ralph/issues/3).
Base: `5b000501fcd500265c8664290dac363cbdfa8634` (merged M1.1 and workflow).
Branch: `executive/m1.2-foundation-schema-plan`.

This document will specify the eleven additive models, exact field/relationship
contract, database invariants, two migrations, immutable-history protections,
bootstrap dependencies, recovery, isolated tests, file list, risks, and acceptance
criteria from the [approved M1 source plan](m1-plan.md).

## Authorization boundary

Only repository documentation is being changed. No schema edit, migration file,
database operation, authentication/passkey implementation, route/layout change,
M1.3 work, merge, or deployment is authorized by Issue #3.

## Confirmed baseline findings

- M1.1 targets Node 24.21.0, Prisma 7.6.0, and the existing PostgreSQL adapter.
- Infrastructure source declares PostgreSQL 16; the live database was not queried.
- The repository contains 24 migrations. `TowerResult` exists in the Prisma schema
  but not in committed migration SQL. Do not fold that pre-existing discrepancy
  into Executive migrations or reset a configured database to reconcile it.
- The M1.1 report records 9 existing test failures, 123 lint errors / 36 warnings,
  and 26 install-audit vulnerabilities. These are not resolved by this planning PR.
- The new schema must enforce same-Owner and same-Office relationships with
  composite foreign keys, and preserve Charter/acceptance/audit history.

## Review checkpoint

The detailed contract and independent design reviews are in progress. This is a
documentation checkpoint, not a completed plan or implementation approval.
