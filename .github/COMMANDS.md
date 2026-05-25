# Commands Reference

Quick reference for all Copilot Chat slash commands (`/`), skill triggers, and custom agents (`@`) available in this workspace. Use this when you forget what exists.

---

## Slash commands (`.github/prompts/*.prompt.md`)

Type `/` in Copilot Chat to see them. Workspace-scoped — only available here.

| Command | What it does | When to use |
|---|---|---|
| `/refresh-kb` | Runs `npm run kb:refresh` from `msf-companion/` locally. Pulls new YouTube videos, fetches transcripts, embeds them, uploads to Azure AI Search. | Anytime you want to refresh the AI advisor's knowledge base. **Must run locally** — YouTube blocks transcript fetches from Azure IPs. Supports `--full` (full re-ingest) and `--status` (just print current index state). |
| `/deploy-production` | Deploys the `msf-companion` web app to Azure Container Apps. Handles pending Prisma migrations. | When you've made code changes and want them live in prod. |

## Skills (`.github/skills/*/SKILL.md`)

Skills auto-trigger when you describe a matching task in chat — no slash needed. Listed here so you know what's available.

| Skill | Triggers on phrases like… | What it does |
|---|---|---|
| `prd` | "create a prd", "write prd for", "plan this feature", "spec out" | Generates a Product Requirements Document for a new feature. |
| `ralph` | "convert this prd", "turn this into ralph format", "create prd.json from this" | Converts a PRD into `prd.json` for the `@ralph` agent. |
| `update-kb` | "update kb", "refresh kb", "update msf kb", "push kb" | **Heavier version of `/refresh-kb`** — refreshes KB locally *and then* builds + deploys to Azure. Use when you want a one-shot "refresh + ship". |

## Custom agents (`.github/agents/*.agent.md`)

Invoke with `@` in Copilot Chat.

| Agent | What it does |
|---|---|
| `@ralph` | Autonomous coding agent. Implements ONE user story from `prd.json` per invocation. Start a fresh chat each time you call it. |
| `@ralph-loop` | Runs `@ralph` continuously through all remaining user stories in `prd.json`. |

---

## Mental model — when to use what

```
Idea for a new feature?
  → "spec out <feature>"           (prd skill)
  → "convert to ralph format"      (ralph skill)
  → start new chat, "@ralph"       (implements one story)
  → repeat @ralph in new chats until done

Wrote some code, want it live?
  → /deploy-production

Knowledge base feels stale?
  → /refresh-kb               (fast, local only)
  → or "update kb"            (refresh + deploy in one shot)
```

## Adding a new command

- **Slash command** → drop a `<name>.prompt.md` in `.github/prompts/` with YAML frontmatter (`description`, `mode: agent`).
- **Skill** → create `.github/skills/<name>/SKILL.md` with `name`, `description`, `user-invocable: true`.
- **Agent** → create `.github/agents/<name>.agent.md`.

When you add anything new, **update this file** so future-you can find it.
