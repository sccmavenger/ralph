# M1.1 — Runtime/dependency compatibility and baseline regression report

Date: September 22, 2026

Baseline commit: `99c5e3def6669f86565bc1731700060a70731a34`

## Decision and status

The M1.1 runtime changes are implemented locally. Node 24.21.0 passed clean installation, Prisma client generation/schema validation, TypeScript checks, a production build, and standalone-server smoke checks on Windows. No new failures were found in the tests or lint comparison.

**M1.1 is not fully verified: an actual Linux/Alpine container build and startup test could not be run because no container engine is available.** The existing unit-test and lint baselines are also not green; their unchanged failures are documented below rather than waived or fixed under this story.

**Recommendation: hold M1.2 approval until the container gate is closed.** Node 24 is a supported candidate based on the checks completed, but this report is not production-release approval. M1.2 has not started and will require explicit Owner authorization.

No Executive Office database or application features were implemented. No migrations were created or applied. No deployment, GitHub push, live email, knowledge refresh, or cloud-resource operation was performed.

## 1. Every repository file changed

Paths are relative to the repository root.

| File | Change |
|---|---|
| `msf-companion/.node-version` | New file pinning the tested runtime to `24.21.0`. |
| `msf-companion/Dockerfile` | Base image changes from `node:20-alpine` to `node:24.21.0-alpine`. All stages inherit that base. No other Docker instructions change. |
| `msf-companion/package.json` | Adds `engines.node: "24.x"`; changes `@types/node` range from `^20` to `^24`. |
| `msf-companion/package-lock.json` | Updates root engine/type metadata, `@types/node`, and its `undici-types` dependency only. No other package versions change and no package entries are added or removed. |
| `.github/workflows/refresh-kb.yml` | Creator-sync job reads `msf-companion/.node-version` instead of specifying Node 20. Workflow triggers, jobs, commands, and targets remain unchanged; the workflow was not dispatched. |
| `msf-companion/AGENTS.md` | Records runtime alignment, safe baseline checks, container verification boundaries, and the Owner's isolated-mechanical-layout/story-by-story requirements. |
| `msf-companion/docs/executive-office/m1-1-runtime-compatibility.md` | This report. |

No files under application `src/`, Prisma schema/migrations, Functions, or infrastructure were modified. Existing route-group/layout files were not moved. Customer/admin authentication, UI, QR, and navigation are unchanged.

## 2. Runtime and dependency versions

The original Dockerfile and workflow specify only Node major 20, not an exact patch. The before-test runtime below is the explicitly downloaded Node 20.20.2 baseline, not a claim about the exact currently deployed production binary.

| Component | Before | After / candidate |
|---|---|---|
| Docker base | `node:20-alpine` | `node:24.21.0-alpine` |
| Workflow web-package runtime | `20` | Version file resolving to `24.21.0` |
| Exact runtime tested on Windows | Node `20.20.2` | Node `24.21.0` |
| Bundled npm used for clean tests | `10.8.2` | `11.19.0` |
| Package Node engine | Not declared | `24.x` |
| `@types/node` declared range | `^20` | `^24` |
| `@types/node` locked version | `20.19.37` | `24.13.6` |
| `undici-types` locked version | `6.21.0` | `7.18.2` |
| Next.js / eslint-config-next | `16.2.1` | Unchanged |
| React / React DOM | `19.2.4` | Unchanged |
| Prisma / Prisma Client / PostgreSQL adapter | `7.6.0` | Unchanged |
| TypeScript | `5.9.3` | Unchanged |
| Vitest / Vite | `4.1.3` / `8.0.7` | Unchanged |
| ESLint | `9.39.4` | Unchanged |
| Playwright | `1.58.2` | Unchanged |
| Sharp | `0.34.5` | Unchanged |
| Tailwind oxide | `4.2.2` | Unchanged |

The workstation's globally installed Node `22.22.0` and npm `10.9.4` were **not changed**. Tests used portable runtimes with process-local PATH settings. Future web-package work should explicitly select Node 24; writing `.node-version` alone does not switch the workstation runtime.

No passkey/WebAuthn dependency was installed. Authentication implementation belongs to a later authorized story.

### Compatibility evidence

- Node's official release/download information identifies Node 24 as LTS and Node 20 as end-of-life. [Node release table](https://nodejs.org/en/about/previous-releases), [Node downloads](https://nodejs.org/en/download).
- Installed version-matched Next.js 16.2.1 documentation specifies Node >=20.9. [Next.js 16 runtime requirements](https://nextjs.org/docs/app/guides/upgrading/version-16#nodejs-runtime-and-browser-support).
- Prisma 7.6.0 package metadata accepts `^20.19 || ^22.12 || >=24.0`. [Version-specific Prisma metadata](https://github.com/prisma/orm/blob/7.6.0/packages/client/package.json).
- A scan of 398 Node engine declarations in the existing lockfile found none incompatible with Node 24.21.0. This is declared compatibility, not a substitute for running the software.
- Both portable runtime ZIPs came from `nodejs.org/dist` and matched their official SHA-256 checksum listings.

## 3. Isolation and methodology

Two clean copies of the baseline commit were extracted from `git archive`, without the working directory's environment files, credentials, dependencies, or build output. Only the intended runtime/package files were overlaid into the candidate copy.

Both copies received clean `npm ci` installs. Checks used an inert database URL pointing to loopback port 1 and dummy session secrets. No live database credentials or captured Scopely sessions were copied. Prisma `generate` and `validate` were used; no database connection, migration, schema push, reset, or data seed was requested.

The candidate lockfile used for testing matches the final repository lockfile:

`SHA256 93668247F2A0C1BE838B865714748621FAB2882DAFB7250EF51A5838F045DDC6`

Temporary browser checks ran against dedicated localhost ports 3120 and 3124, with fresh empty-cookie contexts. External browser requests were aborted to avoid Google Analytics emission and external QR requests. Only the test-owned server processes were stopped afterward.

### Commands executed in each isolated copy

With the corresponding portable runtime first on the process PATH:

```text
npm ci --no-audit --no-fund
node node_modules/prisma/build/index.js generate
node node_modules/prisma/build/index.js validate
node node_modules/vitest/vitest.mjs run --exclude "functions/**" --exclude "src/lib/wallet.test.ts" --maxWorkers=4 --reporter=json --outputFile <evidence>/<baseline-or-candidate>-tests.json
node node_modules/typescript/bin/tsc --noEmit --incremental false
npm run lint -- --format json --output-file <evidence>/<baseline-or-candidate>-lint.json
npm run build
```

No lint autofix, dependency-wide upgrade, cleanup command, or default authenticated Playwright run was used.

## 4. Results before and after

| Check | Node 20 baseline | Node 24 candidate | Interpretation |
|---|---|---|---|
| Clean dependency installation | Passed, warnings noted below | Passed, warning noted below | Lockfile install works on both runtimes. |
| Prisma client generation | Passed | Passed | Existing schema/client generate successfully; no database mutation. |
| Prisma schema validation | Passed | Passed | Existing schema validates on both runtimes. |
| TypeScript (`--noEmit --incremental false`) | Passed | Passed | Zero compiler diagnostics. |
| Production build | Passed | Passed | Compilation, build-time TypeScript, page generation and finalization completed. |
| Static page generation | 70/70 | 70/70 | No count change. |
| App-path manifest entries | 137 | 137 | Exact route-name sets match. |
| Existing web unit/route test files selected | 86 | 86 | Same selection on both runtimes. |
| Existing test assertions | 676 passed / 9 failed | 676 passed / 9 failed | All 685 test-name/status pairs match. No new failures. |
| Full configured lint | 123 errors / 36 warnings | 123 errors / 36 warnings | Same diagnostics after normalizing temporary root paths. Lint is not green. |
| Windows standalone HTTP/browser smoke | 18 passed / 0 failed | 18 passed / 0 failed | Same safe public behavior checked before/after. |
| Native Sharp image operation | Not separately exercised | Passed | Node 24 loaded Sharp 0.34.5 and generated a 91-byte PNG; Windows-only evidence. |
| Actual Linux/Alpine container build/startup | Not run | Not run | Missing container engine; open verification gate. |

Next.js 16 does not run ESLint as part of `next build`; the successful build must not be mistaken for a passing lint result. Lint was run separately and its failures are disclosed.

### Existing test failures — identical before and after

| File | Failed assertions | Observed mismatch |
|---|---:|---|
| `src/app/api/tower/history/route.test.ts` | 1 | Unauthenticated request expects 401 but receives 200. |
| `src/app/api/tower/events/route.test.ts` | 3 | Empty-result shape differs; active-tower expectation fails; week-2 assertion encounters a null tower. |
| `src/app/api/tower/rooms/route.test.ts` | 5 | Expected 401/404/200 responses instead return 500; expected upstream mock call and mapped room are absent. |

The nine failed assertions are:

1. `Tower History API Route GET returns 401 when not authenticated`
2. `Tower API Route returns active: false when no tower event is found`
3. `Tower API Route detects active tower event and returns layout`
4. `Tower API Route calculates week 2 correctly after 7 days`
5. `Tower Rooms API Route returns 401 when user is not authenticated`
6. `Tower Rooms API Route returns 404 when tower is not found`
7. `Tower Rooms API Route returns rooms ordered by ray (A, B, C) and room ID`
8. `Tower Rooms API Route passes user access token to msfApiFetch`
9. `Tower Rooms API Route correctly maps room requirements and week`

These results establish pre-existing failures; they do not establish that the underlying behavior is correct. Fixes or test-contract updates need separately scoped work.

### Existing lint baseline

Diagnostics are identical after normalizing absolute temporary directory paths. The configured lint command includes application code, test files, scripts, and legacy Functions/generated distribution files.

| Rule | Diagnostic count |
|---|---:|
| `@typescript-eslint/no-explicit-any` | 60 |
| `@typescript-eslint/no-require-imports` | 57 |
| `@typescript-eslint/no-unused-vars` | 31 |
| `@next/next/no-img-element` | 5 |
| `@next/next/no-html-link-for-pages` | 2 |
| `react-hooks/set-state-in-effect` | 2 |
| `@typescript-eslint/no-empty-object-type` | 1 |
| `prefer-const` | 1 |

Total: 159 diagnostics, comprising 123 errors and 36 warnings. There were no fatal lint-parser errors. M1.1 does not change ESLint rules, suppress these findings, or refactor the affected files.

### Tests deliberately not run

- `src/lib/wallet.test.ts`: integration tests create/delete Commander and wallet data using the configured database. No disposable test database was provided, so the entire file was excluded on both runtimes.
- Legacy `functions/**` tests: separate stopped infrastructure, outside this web-runtime story. Excluded on both runtimes.
- Existing authenticated Playwright suite: its global setup consumes captured player credentials, and its teardown kills the port-3000 listener. It was not run with real credentials. The separate public smoke checks below are not a claim that this existing E2E suite passed.
- Live customer/admin sessions, OAuth provider flows, billing, email delivery, real game API calls, and database-backed business workflows: not exercised.

## 5. Standalone-server smoke details

The production build's generated `server.js` was run directly on each runtime. `public` and `.next/static` were copied into the temporary standalone output as deployment artifacts, matching the asset-copy intent of the Dockerfile. These are Windows standalone checks, not container checks.

The temporary location sits below a user directory containing another lockfile. Next.js inferred that parent as the tracing root, so generated standalone entrypoints were nested. The harness located the emitted entrypoint; no application build configuration was changed to hide this environment-specific warning.

All 18 checks passed on each runtime:

| Check group | Exact checks |
|---|---|
| Public HTTP pages (7) | `/`, `/faq`, `/privacy`, `/terms`, `/admin`, `/feedback/cancellation` without token, `/subscribe/success` without payment-success parameters: HTTP 200 HTML. |
| Redirects (6) | `/subscribe` -> `/`; `/admin/dashboard` -> `/admin`; `/dashboard`, `/inventory`, `/roster`, `/planner` -> `/api/auth/refresh?redirect=/dashboard`: HTTP 307. Only the first response is inspected. |
| Unauthorized APIs (2) | `/api/msf/inventory` and `/api/admin/usage-stats`: HTTP 401. |
| Empty session (1) | `/api/auth/session`: HTTP 200 with `{ "authenticated": false }`. |
| Mobile browser (1) | 390x844 Chromium: mobile content and login link visible, desktop QR hidden, zero page JavaScript errors. |
| Desktop browser (1) | 1440x1000 Chromium: desktop QR element visible with the existing site URL, mobile content absent, zero page JavaScript errors. |

QR image download/decoding was not tested because external requests were intentionally blocked. Browser viewport checks do not establish physical iPhone or Safari compatibility. Signed-in dashboard/inventory behavior was not exercised with real accounts.

The harness and full JSON results remain in the local evidence directory identified below. Both dedicated test listeners were confirmed stopped.

## 6. Container verification and outstanding gate

Read-only checks found no Docker command/standard Docker Desktop executable on Windows and no Docker, Podman, or nerdctl command in the installed Ubuntu WSL distribution. No container engine was installed, no daemon started, and no cloud build/deployment substituted for local testing.

The official Docker registry confirms that `node:24.21.0-alpine` exists:

- OCI image-index digest: `sha256:ebfe2f90462722a7a4de65e91990e97fe0d401c70e0e762c5b53302f905ec1c1`
- Advertised Linux platforms: `amd64`, `arm64/v8`, `s390x`.
- Linux amd64 manifest digest: `sha256:83f1c388c31fb2e51f7cbd4dea949b96260798c98f206e8e4696bc93bd964e3a`.

**This was a remote manifest check only. No image pull, container build, or container startup was performed.** The Dockerfile pins a version tag, not these digests; the digest values record this inspection, not an immutable image pin.

The remaining M1.1 gate, on an available Docker-capable Linux-container host, is:

1. Build the unchanged baseline Dockerfile and the candidate Dockerfile from credential-free contexts using their respective lockfiles.
2. Confirm the candidate's actual Node/npm versions and successful `npm ci`, Prisma generation, and production build.
3. Exercise Linux/Alpine native dependencies, including Sharp, SWC, Tailwind oxide, and the generated Prisma client.
4. Start the final image as its existing non-root `nextjs` user with dummy session secrets and an inert database URL.
5. Repeat the public HTTP/redirect/browser smoke checks against the mapped test port, without external service credentials.
6. Record exact image identities, commands, exit results and any baseline/candidate differences before requesting M1.2 approval.

The existing `libc6-compat` package and Docker stage design were left intact. Official Node Docker documentation describes Alpine/musl considerations; Windows success cannot resolve those concerns. [Official Node Alpine image guidance](https://github.com/nodejs/docker-node/blob/main/README.md#nodealpine).

## 7. Warnings and compatibility limitations

- **Baseline engine warning:** Node 20's install warns that `@prisma/streams-local@0.1.2` requires Node >=22. Node 24's install does not emit this engine warning. No package-wide update was performed to resolve it.
- **Baseline install cleanup warning:** npm 10 reported an optional-dependency directory `EPERM` cleanup warning on Windows; installation still exited successfully.
- **Candidate npm warning:** npm 11.19.0 reported install scripts not yet covered by `allowScripts` for `@prisma/engines`, `prisma`, `sharp`, and `unrs-resolver`. The clean install, explicit Prisma generation/validation, native Sharp operation, lint execution and production build all ran, but the warning remains recorded for container review. No install-script trust policy was silently changed.
- **Existing Vitest warning:** `test.poolOptions` was removed in Vitest 4. The checks bounded workers with `--maxWorkers=4` and left existing configuration unchanged.
- **Existing Next.js warning:** `middleware` is deprecated in favor of `proxy`. The rename is not part of M1.1 and was not performed.
- **Temporary environment warning:** Next.js inferred the parent user directory as workspace/tracing root because of another lockfile. Both before/after builds share this warning; no user lockfile was removed or edited.
- **Security-audit boundary:** This is a compatibility/regression report, not a dependency vulnerability audit. Installs used `--no-audit`, and no `npm audit fix` was run.

No new runtime regression was observed within the completed checks. This is bounded evidence, not a guarantee for untested database/provider/authenticated workflows or Linux containers.

## 8. Owner's mechanical-layout requirement

The later analytics-isolation route-group/layout migration must be an isolated mechanical change. It must not be combined with redesign, unrelated cleanup, authentication behavior changes, or general refactoring.

Before and after that future move, verify route manifests and existing route behavior, plus the appropriate authenticated, navigation, QR, public-page, and analytics-isolation checks. This M1.1 report supplies a runtime baseline but does not replace the migration-specific before/after acceptance checks.

No route move was performed in M1.1. The requirement is also recorded in `AGENTS.md` for future story work.

## 9. Local evidence and final recommendation

Raw evidence is preserved outside the repository at:

```text
C:\Users\dguil\AppData\Local\Temp\msf-m11-5764f1dffda54a989c578145e6484e31\evidence
```

Files include baseline/candidate installation, Prisma, typecheck, lint, production-build, test-result and standalone-smoke logs/JSON. The sibling `smoke.cjs` is the isolated verification harness, not an application file. Portable Node installations and generated build/dependency artifacts remain in the same temporary workspace for follow-up verification; they may be removed by normal temporary-file cleanup. This report includes the substantive results needed for review without those local artifacts.

**Conclusion:** retain the narrowly scoped Node 24 candidate changes for review, complete the missing Linux/Alpine container gate, then ask the Owner whether to authorize M1.2. Track the unchanged test/lint failures separately. Do not treat this as a fully green baseline or authorization to implement the Executive Office database, authentication, layouts, or application.
