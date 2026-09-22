# M1.1 — Runtime/dependency compatibility and baseline regression report

Date: September 22, 2026

Baseline commit: `99c5e3def6669f86565bc1731700060a70731a34`

## Decision and status

The M1.1 runtime changes are implemented and pushed on the dedicated `m1.1-runtime-validation` branch. Node 24.21.0 passed clean installation, Prisma client generation/schema validation, TypeScript checks, a production build, and standalone-server smoke checks on Windows. The actual Node 24 Dockerfile also passed Linux/Alpine build, startup, readiness, native Sharp, and HTTP smoke verification on a GitHub-hosted `ubuntu-latest` runner. No new failures were found in the Windows tests/lint comparison or the completed candidate container checks.

**The requested M1.1 container verification gate is now closed.** The existing unit-test and lint baselines are not green; their unchanged failures remain documented below rather than waived or fixed under this story. The container dependency installation also reported 26 vulnerabilities, including 1 critical; these require separate security triage and are not a runtime-compatibility pass/fail comparison.

**Recommendation: the Node 24 runtime prerequisite is sufficiently verified for the Owner to review M1.2 authorization.** This is not a fully green test/security baseline or production-release approval. Review the dependency findings before any production release. M1.2 has not started and still requires explicit Owner authorization.

No Executive Office database or application features were implemented. No migrations were created or applied. Only the M1.1 branch was pushed; no merge, deployment, image publication, live email, knowledge refresh, or production cloud-resource operation was performed. No permanent local container engine was installed.

Container verification: [successful GitHub Actions run 35737188704](https://github.com/sccmavenger/ralph/actions/runs/35737188704), testing commit [`43dbd932e6edaf888adc7a543157861cc809c35e`](https://github.com/sccmavenger/ralph/commit/43dbd932e6edaf888adc7a543157861cc809c35e).

## 1. Every repository file changed

Paths are relative to the repository root.

| File | Change |
|---|---|
| `msf-companion/.node-version` | New file pinning the tested runtime to `24.21.0`. |
| `msf-companion/Dockerfile` | Base image changes from `node:20-alpine` to `node:24.21.0-alpine`. All stages inherit that base. No other Docker instructions change. |
| `msf-companion/package.json` | Adds `engines.node: "24.x"`; changes `@types/node` range from `^20` to `^24`. |
| `msf-companion/package-lock.json` | Updates root engine/type metadata, `@types/node`, and its `undici-types` dependency only. No other package versions change and no package entries are added or removed. |
| `.github/workflows/refresh-kb.yml` | Creator-sync job reads `msf-companion/.node-version` instead of specifying Node 20. Workflow triggers, jobs, commands, and targets remain unchanged; the workflow was not dispatched. |
| `.github/workflows/m1-1-container-validation.yml` | New narrowly scoped, branch-push-only GitHub-hosted Docker build/start/readiness/smoke workflow. Uses a runner-local image, network-isolated container, dummy credentials, always-captured diagnostics, and 14-day evidence artifacts; no deployment or registry publication. |
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
| Native Sharp image operation | Not separately exercised | Passed on Windows and Linux/Alpine | Node 24 loaded Sharp 0.34.5 and generated a 91-byte PNG on each tested platform. |
| Actual Linux/Alpine container build/startup | Not run | Passed on GitHub-hosted runner | Candidate-only verification, as authorized in the follow-up request. |
| Container readiness / HTTP smoke | Not run | Passed / 14 of 14 passed | No live services or database; see section 6 for exact coverage. |

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

## 6. Completed GitHub-hosted Linux/Alpine verification

Local Windows/WSL checks originally found no available container engine. The Owner subsequently authorized a dedicated branch and GitHub-hosted `ubuntu-latest` validation instead of installing a permanent engine. The following run closes that remaining gate.

| Evidence | Result |
|---|---|
| Repository | `sccmavenger/ralph` |
| Branch | [`m1.1-runtime-validation`](https://github.com/sccmavenger/ralph/tree/m1.1-runtime-validation) |
| Tested commit | `43dbd932e6edaf888adc7a543157861cc809c35e` |
| Workflow | `.github/workflows/m1-1-container-validation.yml` |
| Run / job | [35737188704](https://github.com/sccmavenger/ralph/actions/runs/35737188704) / `106777361019` |
| Execution | September 22, 2026, 13:59:36–14:01:10 UTC; job completed successfully in 1 minute 34 seconds |
| Runner / Docker | GitHub-hosted `ubuntu-latest`, Linux amd64; Docker Engine 28.0.4 |
| Build | Passed, approximately 71 seconds for the Docker build step |
| Final image ID | `sha256:1931589ecb072b723a6a42fc93283bf447b0eaba1b05a39250ab0455e33e7bd8` |
| Runtime verified inside image | Node `v24.21.0`, npm `11.19.0`, Linux x64, UID `1001` / configured user `nextjs` |
| Startup / readiness | Passed; `/api/auth/session` returned HTTP 200 and exactly `{ "authenticated": false }` |
| Smoke | All 14 HTTP checks, the runtime/non-root assertion, and native Sharp check passed |
| Final container state | Running, not restarting, not OOM-killed, no state error; captured before deliberate cleanup |
| Diagnostics / cleanup | Logs and state uploaded successfully; only the ephemeral test container removed afterward |

The current Dockerfile was built directly, without modifying it for CI:

```text
docker build --pull --progress=plain --tag msf-m11-check:43dbd932e6edaf888adc7a543157861cc809c35e --file msf-companion/Dockerfile msf-companion
```

`npm ci`, Prisma Client 7.6.0 generation, Next.js 16.2.1 compilation, build-time TypeScript checks, all 70 static pages, and final standalone image assembly succeeded. The build used the Alpine base identified by:

- OCI image-index digest: `sha256:ebfe2f90462722a7a4de65e91990e97fe0d401c70e0e762c5b53302f905ec1c1`.
- Linux amd64 manifest digest: `sha256:83f1c388c31fb2e51f7cbd4dea949b96260798c98f206e8e4696bc93bd964e3a`.

These digests identify the images observed in this run; the Dockerfile still pins the `24.21.0-alpine` version tag, not an immutable digest. No image was pushed to Docker Hub, ACR, GHCR, or any other registry.

### Runtime isolation and requests

The final image was started using its normal `node server.js` command and non-root user, with `--network none`, no published ports, no repository secrets, dummy session secrets, and a database URL pointing to its own unused loopback port 1. Requests used Node's `fetch` through `docker exec`, targeting `http://127.0.0.1:3000` inside the same container. This blocks runtime access to production and external services.

Readiness was bounded to 30 attempts with per-request timeouts. One initial `fetch failed` occurred while the server was starting; the next successful readiness result arrived within the two-second workflow readiness step. This was a retried startup probe, not a failed job or observed application regression. Container logs showed the normal Next.js startup/ready messages and no application errors.

| HTTP smoke group | Checks |
|---|---|
| Public HTML (5) | `/`, `/faq`, `/privacy`, `/terms`, `/admin`: HTTP 200 plus HTML content validation. |
| Empty session (1) | `/api/auth/session`: HTTP 200 and exact unauthenticated JSON. |
| Unauthorized APIs (2) | `/api/msf/inventory`, `/api/admin/usage-stats`: HTTP 401. |
| Redirects (6) | `/subscribe` -> `/`; `/admin/dashboard` -> `/admin`; `/dashboard`, `/inventory`, `/roster`, `/planner` -> `/api/auth/refresh?redirect=/dashboard`: HTTP 307, exact Location header, no redirect following. |

The native Sharp 0.34.5 check generated a 91-byte PNG inside the final Alpine image. The build exercised the existing Next/Tailwind compilation pipeline and Prisma client generation; it did not query a database. The existing `libc6-compat` instruction successfully resolved to Alpine's `gcompat` package and required no Dockerfile adjustment.

### Coverage boundary and retained artifacts

This follows the latest Owner-authorized **current-candidate container build/start/smoke scope**, replacing the earlier proposed broader Linux baseline/candidate/browser checklist. No Node 20 Linux container comparison, Linux browser suite, real database/provider workflow, or physical-device test is claimed. The before/after test, lint and browser comparisons remain the Windows evidence in preceding sections.

Build output, final image identity, Node/npm evidence, readiness JSON, smoke JSON, timestamped container logs, final container state, and runner/Docker metadata are retained in [artifact `m1-1-container-evidence-43dbd932e6edaf888adc7a543157861cc809c35e`](https://github.com/sccmavenger/ralph/actions/runs/35737188704/artifacts/10697578394), expiring October 6, 2026 at 14:01:06 UTC under the configured 14-day retention policy. Diagnostics steps use `always()` so startup/smoke failure logs would also be retained. This successful run did not require a failure recovery or runtime fix.

The workflow has read-only repository permissions and no deployment, registry-publish, production-service, or migration steps. It triggers only on relevant pushes to the M1.1 branch; documentation-only report updates do not rerun it. No main-branch merge or PR was created.

## 7. Warnings and compatibility limitations

- **Baseline engine warning:** Node 20's install warns that `@prisma/streams-local@0.1.2` requires Node >=22. Node 24's install does not emit this engine warning. No package-wide update was performed to resolve it.
- **Baseline install cleanup warning:** npm 10 reported an optional-dependency directory `EPERM` cleanup warning on Windows; installation still exited successfully.
- **Candidate npm warning:** npm 11.19.0 reported install scripts not yet covered by `allowScripts` for `@prisma/engines`, `prisma`, `sharp`, and `unrs-resolver` on Windows and in the Linux build. Installation, Prisma generation, native Sharp, and builds passed; no install-script trust policy was silently changed.
- **Existing Vitest warning:** `test.poolOptions` was removed in Vitest 4. The checks bounded workers with `--maxWorkers=4` and left existing configuration unchanged.
- **Existing Next.js warning:** `middleware` is deprecated in favor of `proxy`. The rename is not part of M1.1 and was not performed.
- **Temporary environment warning:** Next.js inferred the parent user directory as workspace/tracing root because of another lockfile. Both before/after builds share this warning; no user lockfile was removed or edited.
- **Dependency vulnerability warning:** The unmodified Dockerfile's `npm ci` reported **26 vulnerabilities: 1 low, 10 moderate, 14 high, and 1 critical**. Prior Windows installs used `--no-audit`, so this report cannot attribute these advisories to the runtime change or claim a before/after security comparison. This aggregate includes the build dependency tree and does not by itself establish production exploitability. Separate advisory-level triage is required before a production release. No `npm audit fix` or dependency-wide update was performed.
- **GitHub Actions warnings:** `actions/checkout@v4` and `actions/upload-artifact@v4` declare deprecated Node 20 action runtimes; GitHub reported forcing them to Node 24. Artifact-upload tooling also emitted `DEP0040` (`punycode`) and `DEP0169` (`url.parse()`) deprecation warnings. Both actions succeeded. These tooling warnings are distinct from the application container's directly verified Node 24.21.0 runtime and are not application startup failures.
- **Runner notice:** GitHub announced an upcoming `ubuntu-latest` transition to Ubuntu 26 beginning October 19, 2026. The runner/Docker metadata for this completed run is retained with its artifacts.
- **Startup probe:** One initial readiness fetch failed before the server was ready; bounded retry succeeded and all subsequent smoke requests passed.

No new runtime regression was observed within the completed Windows and Linux/Alpine candidate checks. This is bounded evidence, not a guarantee for untested database/provider/authenticated workflows, other architectures, or a production release's security posture.

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

Downloaded GitHub container evidence, including the full job log, is also available locally at:

```text
C:\Users\dguil\AppData\Local\Temp\msf-m11-ci-24e22c7e6d814c40a077aeb000455178
```

The tested code/workflow commit is `43dbd932e6edaf888adc7a543157861cc809c35e`. A subsequent documentation-only commit on the same branch records these completed results; it does not change the tested runtime, Dockerfile, dependencies, or workflow.

**Conclusion:** the requested M1.1 runtime and container checks are complete and ready for Owner review. Keep the unchanged test/lint failures and newly surfaced dependency-audit warning visible. Nothing has been merged or deployed, and no permanent local container engine was installed. Stop here: M1.2 and all Executive Office database, authentication, layout, and application implementation remain unauthorized until the Owner reviews these results and explicitly approves the next story.
