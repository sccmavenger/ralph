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

## Executive Office Development Workflow

These permanent repository operating rules apply to **all Executive Office / AI
CEO work**, regardless of milestone, story, bounded task, or future Codex session.
They supplement the existing Executive Office constitutional, governance,
learning, security, and milestone rules, which remain authoritative. They do not
alter the technical architecture or implementation plan and do not grant extra
autonomy or permission to merge, deploy, spend money, modify production, or cross
an Owner approval boundary.

### Branches and durable checkpoints

- Never perform Executive Office development directly on `main`. Before making
  changes, verify the current branch and create a task branch if necessary.
- Every independently reviewable story or bounded task must have its own branch.
  Use clear names such as `executive/m1.1-node24-validation`,
  `executive/m1.2-foundation-schema`, `executive/m2.1-governance-policy`, or a clear
  equivalent. Do not combine unrelated stories just because a branch is open.
- Commit and push to GitHub at meaningful checkpoints. Do not leave completed
  work only in a local Codex session. Never commit secrets or live credentials.
- Every story/task must have a GitHub Pull Request against `main`. Open the PR as
  a **Draft** while work is incomplete and keep its description current.
- The PR is the shared coordination and review surface for the Owner, ChatGPT
  architecture reviewer, and Codex. GitHub is the durable shared record:
  important implementation decisions, questions, test results, and completion
  summaries must live in the repository/PR, not only in transient AI chat history.
- At each reviewable checkpoint, the PR must contain enough context and evidence
  for independent review without access to the private Codex conversation.

### Required PR description

Use `.github/PULL_REQUEST_TEMPLATE/executive-office.md` for Executive Office PRs.
Select that named template when creating a PR, or populate a completed copy and
pass it to the GitHub CLI with `--body-file`. Fill every section; explicitly state
`None` or `Not applicable` with a reason when appropriate. Always include:

- Milestone/story/task, objective, and authorized scope.
- Files changed.
- Database/migration and configuration changes, including explicit absence.
- Tests executed and their results, with commands, environment, and evidence.
- Known pre-existing failures, separately from any new regressions.
- Security considerations.
- Cost/infrastructure implications.
- Unresolved questions and Owner decisions required.
- Risks and limitations.
- Next proposed action and merge-readiness assessment.

### Owner decisions and approval gates

- When a decision requires Owner input, do not leave it only in Codex chat. Add a
  clearly labeled PR comment headed **OWNER DECISION REQUIRED** with:
  - The decision needed.
  - Why it matters.
  - Available options.
  - Codex's recommended option.
  - Risks/tradeoffs.
  - Whether work is blocked pending the decision.
- Link the decision comment from the PR description and record the Owner's
  resolution there when received. If approval arrives in chat, preserve its
  relevant scope in the PR; do not infer broader authority.
- Stop at Owner approval gates defined by the Executive Office plan. Do not
  silently begin the next story or milestone when the approved task is complete.
- Do not merge a PR merely because implementation and tests pass. A positive
  merge-readiness assessment is not merge authorization; wait for explicit Owner
  authorization and any applicable review requirements.
- Do not deploy production changes unless explicitly authorized. Permission to
  push a branch, open a PR, or perform validation is not deployment permission.

### Review changes and completion

- Address reviewer-requested changes on the same branch and push new commits to
  the same PR. Reply with what changed and the verification performed. Do not
  open a replacement PR unless there is a specific reason; document that reason
  and cross-link the PRs if replacement is necessary.
- Before declaring a story/task complete:
  1. Verify the delivered changes match the requested and authorized scope.
  2. Run the required tests and record commands, results, and evidence. Clearly
     disclose skipped/blocked checks; never describe unrun checks as passing.
  3. Update the PR summary with the current implementation decisions, known
     failures, new regressions, unresolved questions, and completion status.
  4. State explicitly whether the story/task is safe to merge and why, including
     limitations and pending Owner decisions. Keep merge and deployment approval
     separate from technical readiness.
  5. Stop for review wherever the milestone process requires Owner approval.

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
