# The MSF Toolkit — Repository Guidance

## Overview

This repository contains The MSF Toolkit, a mobile-first Marvel Strike Force companion application. The production code lives in `msf-companion/`; `msf-api/` contains the API specification archive and verified endpoint research.

Ralph is the repository's internal autonomous development workflow for VS Code and GitHub Copilot. It implements user stories from a `prd.json` file one at a time, with fresh context per invocation. Memory persists via git history, `progress.txt`, and `prd.json`. Ralph is development infrastructure, not the product represented by the repository.

## Product Layout

| Path | Purpose |
|------|---------|
| `msf-companion/` | Next.js PWA, server APIs, Prisma data layer, Azure Functions, tests, scripts, and infrastructure |
| `msf-api/` | Official OpenAPI snapshots and undocumented/live-probed MSF API behavior |
| `tasks/` | Product requirements for toolkit features |
| `.github/` | Ralph agents plus deployment and knowledge-refresh automation |

## Workflow

1. **`/prd`** — Generate a Product Requirements Document (slash command)
2. **`/ralph`** — Convert the PRD to `prd.json` format (slash command)
3. **`@ralph`** — Implement the next user story (custom agent — start a new chat each time)
4. Repeat step 3 in a new chat until `@ralph` reports all stories complete

## Key Files

| File | Purpose |
|------|---------|
| `.github/agents/ralph.agent.md` | The `@ralph` custom agent — implements one story per invocation |
| `.github/skills/prd/SKILL.md` | `/prd` slash command — generates PRDs |
| `.github/skills/ralph/SKILL.md` | `/ralph` slash command — converts PRDs to `prd.json` |
| `prd.json` | User stories with `passes` status (created per-project) |
| `prd.json.example` | Example PRD format for reference |
| `progress.txt` | Append-only learnings for future iterations (created per-project) |

## Patterns

- Each `@ralph` invocation = fresh context (start a new chat for each story)
- Memory persists via git history, `progress.txt`, and `prd.json`
- Stories should be small enough to complete in one context window
- Always update `AGENTS.md` with discovered patterns for future iterations
- Read `progress.txt` Codebase Patterns section before starting each story
- `.github/workflows/refresh-kb.yml` keeps official sources current on a GitHub-hosted runner and creator transcripts current on the dedicated Windows runner labeled `msf-kb`; the latter is required because YouTube blocks caption extraction from Azure-hosted IP ranges.
- Production application releases deploy only the `web` service with `azd deploy web`; never use a bare `azd deploy` because the legacy Function App uses an immutable remote package.
- Production `azd provision` and `azd up` are intentionally blocked by `msf-companion/scripts/guard-infra-provision.ps1`. The full infrastructure has known drift in PostgreSQL, Cosmos DB, Azure OpenAI, Search, ACR, and Application Insights; use reviewed targeted deployments until that drift is reconciled.
- The production web Container App uses its system-assigned identity for `AcrPull` and for the Key Vault-backed `database-url-kv` secret. Do not reintroduce ACR admin credentials or a literal `database-url` Container App secret.
- `database-password` must remain persisted in Key Vault under that exact name because `main.parameters.json` retrieves it with `secretOrRandomPassword`; failing to persist it can generate and apply an unintended new PostgreSQL password on a later provision.
- The Azure Function App is stopped legacy infrastructure. Current knowledge updates run through `.github/workflows/refresh-kb.yml` and web cron endpoints; do not restart or migrate the Function as part of routine web or Advisor work.
- AI operations reporting uses the canonical 7/30/90-day UTC range and KPI definitions in `msf-companion/src/lib/admin-ai-stats.ts`; range `end` values are exclusive and UI labels must display `end - 1ms` as the final included date.
- Treat Advisor telemetry according to what it actually records: `AdvisorQuestionLog` represents completed/classified answers, message feedback covers persisted conversations and skews Premium, and `DailyTokenUsage` is an estimated output-token counter. Do not describe these as provider availability, all-user satisfaction, exact token billing, or actual dollar cost.
- AI dashboard remediation is persisted in `AiActionItem`, uniquely keyed by source type/id. Reuse the authenticated `/api/admin/ai-actions` workflow and its open → investigating → planned → completed/dismissed lifecycle instead of creating untracked recommendation cards.
- Authenticated page views are recorded client-side by `PageViewTracker` using `usePathname` and the strictly validated `{ page }` contract on `/api/usage-track`. Do not move this back to the shared server layout: App Router layouts persist across client navigation, and response headers are not request headers for Server Components.
- A measurable `AiActionItem` records `successMeasure`, baseline/target/result values, `metricUnit`, and `reviewAt`; keep these nullable for incremental planning, accept finite numeric values only, and normalize API review dates to UTC ISO strings on output.
- Actionable admin insights are deterministic rules in `msf-companion/src/lib/admin-business-insights.ts`. Each finding must include an observation, business implication, recommended action, success measure, evidence, sample/confidence, caveat, stable source ID, and work/evidence link; descriptive rankings such as “top questions” belong only inside a relevant evidence drill-down.
- Treat product-area page telemetry as directional until corrected client navigation tracking has accumulated a full comparison window. Do not infer sessions, ordered funnels, first-touch entry pages, or causal Premium lift from raw page-view events without dedicated lifecycle/session instrumentation.
