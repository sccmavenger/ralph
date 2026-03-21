# Ralph — Autonomous Coding Agent for GitHub Copilot

## Overview

Ralph is an autonomous coding agent for VS Code with GitHub Copilot. It implements user stories from a `prd.json` file one at a time, with fresh context per invocation. Memory persists via git history, `progress.txt`, and `prd.json`.

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
