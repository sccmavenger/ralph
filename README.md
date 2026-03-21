# Ralph

![Ralph](ralph.webp)

Ralph is an autonomous coding agent for VS Code with GitHub Copilot. It implements user stories from a `prd.json` file one at a time, with fresh context per invocation. Memory persists via git history, `progress.txt`, and `prd.json`.

Based on [Geoffrey Huntley's Ralph pattern](https://ghuntley.com/ralph/).

## Prerequisites

- [VS Code](https://code.visualstudio.com/) with [GitHub Copilot](https://marketplace.visualstudio.com/items?itemName=GitHub.copilot-chat) installed and active
- A git repository for your project

## Setup

### Option 1: Copy to your project

Copy the `.github/` folder into your project:

```bash
# From your project root
cp -r /path/to/ralph/.github .github/
```

This gives you:
- `.github/agents/ralph.agent.md` — the `@ralph` custom agent
- `.github/skills/prd/SKILL.md` — the `/prd` slash command
- `.github/skills/ralph/SKILL.md` — the `/ralph` slash command

### Option 2: Install skills globally

Copy the skills and agent to your user profile for use across all projects:

```bash
# Agent (user-level)
mkdir -p ~/.config/Code/User/prompts
cp .github/agents/ralph.agent.md ~/.config/Code/User/prompts/

# Skills (user-level)
cp -r .github/skills/prd ~/.agents/skills/
cp -r .github/skills/ralph ~/.agents/skills/
```

## Workflow

### 1. Create a PRD

Type `/prd` in Copilot chat and describe your feature:

```
/prd Add a task priority system with high/medium/low levels
```

Answer the clarifying questions. The skill saves output to `tasks/prd-[feature-name].md`.

### 2. Convert PRD to Ralph format

Type `/ralph` in Copilot chat:

```
/ralph Convert tasks/prd-task-priority.md to prd.json
```

This creates `prd.json` with user stories structured for autonomous execution.

### 3. Run Ralph

Start a new chat and invoke the `@ralph` agent:

```
@ralph
```

Ralph will:
1. Read `prd.json` and `progress.txt`
2. Check out or create the feature branch (from PRD `branchName`)
3. Pick the highest priority story where `passes: false`
4. Implement that single story
5. Run quality checks (typecheck, lint, test)
6. Commit if checks pass
7. Update `prd.json` to mark story as `passes: true`
8. Append learnings to `progress.txt`

### 4. Repeat

Start a **new chat** and invoke `@ralph` again. Each new chat gives fresh context, preventing quality degradation on large PRDs. Repeat until `@ralph` reports all stories complete.

## Key Files

| File | Purpose |
|------|---------|
| `.github/agents/ralph.agent.md` | The `@ralph` custom agent — implements one story per invocation |
| `.github/skills/prd/SKILL.md` | `/prd` slash command — generates PRDs |
| `.github/skills/ralph/SKILL.md` | `/ralph` slash command — converts PRDs to `prd.json` |
| `prd.json` | User stories with `passes` status (created per-project) |
| `prd.json.example` | Example PRD format for reference |
| `progress.txt` | Append-only learnings for future iterations (created per-project) |

## Critical Concepts

### Each Invocation = Fresh Context

Each `@ralph` chat is a **new conversation** with clean context. The only memory between invocations is:
- Git history (commits from previous invocations)
- `progress.txt` (learnings and context)
- `prd.json` (which stories are done)

### Small Tasks

Each PRD item should be small enough to complete in one context window. If a task is too big, the agent runs out of context before finishing and produces poor code.

Right-sized stories:
- Add a database column and migration
- Add a UI component to an existing page
- Update a server action with new logic
- Add a filter dropdown to a list

Too big (split these):
- "Build the entire dashboard"
- "Add authentication"
- "Refactor the API"

### AGENTS.md Updates Are Critical

After each invocation, Ralph updates the relevant `AGENTS.md` files with learnings. This is key because GitHub Copilot automatically reads these files, so future invocations (and future human developers) benefit from discovered patterns, gotchas, and conventions.

Examples of what to add to AGENTS.md:
- Patterns discovered ("this codebase uses X for Y")
- Gotchas ("do not forget to update Z when changing W")
- Useful context ("the settings panel is in component X")

### Feedback Loops

Ralph only works if there are feedback loops:
- Typecheck catches type errors
- Tests verify behavior
- CI must stay green (broken code compounds across iterations)

## Debugging

Check current state:

```bash
# See which stories are done
cat prd.json | jq '.userStories[] | {id, title, passes}'

# See learnings from previous iterations
cat progress.txt

# Check git history
git log --oneline -10
```

## References

- [Geoffrey Huntley's Ralph article](https://ghuntley.com/ralph/)
