# MSF Companion

MSF Companion is the application behind [The MSF Toolkit](https://themsftoolkit.com), an installable, mobile-first command center for Marvel Strike Force players.

It combines a commander's Scopely-authorized roster data with MSF game data, planning engines, current meta information, and an AI-backed knowledge base. The result is a set of practical answers: what to build, what to farm, whether an event is affordable, and which teams are most likely to work.

> This is an independent community project and is not affiliated with Scopely or Marvel.

## Application capabilities

- Scopely OAuth login with encrypted server-side sessions
- Roster, character, inventory, squad, and progress views
- Event, farming, affordability, Dark Dimension, Tower, Time Heist, and Upgrade Token planning
- War and Cosmic Crucible meta analysis
- Commander Wallet for Gold and Power Core planning
- AI roster advisor with retrieval, citations, confidence, history, and feedback
- Free/Premium subscriptions through Stripe
- Admin, analytics, email, Discord, push-notification, and churn-prevention workflows
- Installable PWA interface designed around a phone-sized viewport

## Architecture

The project has two deployed services:

1. **`web`** — the Next.js application, hosted in Azure Container Apps. It contains the UI, server components, route handlers, Scopely integration, Prisma data access, subscriptions, and advisor experience.
2. **`functions`** — an Azure Functions application that refreshes the knowledge base, processes YouTube and blog content, synchronizes game data, analyzes knowledge gaps, and runs scheduled messaging workflows.

Supporting services include:

- PostgreSQL for commander and product state
- Cosmos DB for ingestion documents and pipeline state
- Azure AI Search for retrieval
- Azure OpenAI for classification, extraction, and advisor responses
- Stripe for subscriptions
- Resend, Discord, and web push for communications

Infrastructure is defined in [`infra/`](infra/) and orchestrated by [`azure.yaml`](azure.yaml).

## Important directories

| Path | Contents |
|---|---|
| [`src/app/`](src/app/) | Next.js pages, layouts, components, and API route handlers |
| [`src/lib/`](src/lib/) | Authentication, MSF access, planners, scoring engines, caching, email, and shared domain logic |
| [`prisma/`](prisma/) | PostgreSQL schema and forward-only migrations |
| [`functions/src/`](functions/src/) | Azure Functions triggers and intelligence-pipeline libraries |
| [`e2e/`](e2e/) | Playwright browser and API scenarios |
| [`scripts/`](scripts/) | Knowledge refresh, MSF probes, email utilities, and operational scripts |
| [`infra/`](infra/) | Bicep modules for the application and supporting Azure services |
| [`tasks/`](tasks/) | Product requirements retained with the application |

The companion application also uses the API specifications and research in [`../msf-api/`](../msf-api/).

## Prerequisites

- Node.js 20+
- npm
- PostgreSQL
- Scopely OAuth client ID and secret
- MSF API key

Azure AI, Cosmos DB, Stripe, Resend, Discord, web-push, and YouTube credentials are optional for local work that does not exercise those integrations.

## Environment configuration

Copy `.env.example` to `.env` and supply the values required by the feature you are running.

Core application variables:

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `SESSION_SECRET` | Encryption secret for the commander session cookie |
| `SCOPELY_CLIENT_ID` | Scopely OAuth application ID |
| `SCOPELY_CLIENT_SECRET` | Scopely OAuth server secret |
| `SCOPELY_REDIRECT_URI` | Registered OAuth callback URL |
| `MSF_API_KEY` | Server-side Marvel Strike Force API key |

Common optional integrations:

| Variable group | Features |
|---|---|
| `AZURE_OPENAI_*` | AI routing, extraction, and advisor responses |
| `AZURE_AI_SEARCH_*` | Knowledge retrieval and indexing |
| `AZURE_COSMOS_*` / `COSMOS_*` | Response cache and Function ingestion state |
| `STRIPE_*` / `NEXT_PUBLIC_STRIPE_*` | Premium subscriptions |
| `RESEND_API_KEY`, `EMAIL_FROM` | Transactional email |
| `DISCORD_*` | Announcements |
| `YOUTUBE_API_KEY` | Creator discovery and knowledge ingestion |
| `CRON_SECRET` | Authentication for web-hosted scheduled routes |

Never commit `.env`, captured OAuth tokens, or production credentials.

## Install and run

```powershell
npm install
Copy-Item .env.example .env
npx prisma generate
npx prisma migrate dev
npm run dev
```

The development server runs at [http://localhost:3000](http://localhost:3000).

## Useful commands

```powershell
# Web application
npm run dev
npm run build
npx tsc --noEmit
npx vitest run
npm run lint

# Browser tests (requires a captured Scopely test session)
npm run test:e2e

# Knowledge base
npm run kb:status
npm run kb:refresh
npm run kb:refresh:full

# Azure Functions
cd functions
npm install
npm run typecheck
npm test
npm run build
```

Playwright authentication setup is documented in [`e2e/global-setup.ts`](e2e/global-setup.ts). Do not commit files under `e2e/auth/`.

## Database changes

Prisma is configured through [`prisma.config.ts`](prisma.config.ts). For a schema change:

```powershell
npx prisma migrate dev --name describe_the_change
npx prisma generate
```

Production deployments must apply pending migrations with `npx prisma migrate deploy` while `DATABASE_URL` points to the production database.

## Deployment

The project uses Azure Developer CLI and Bicep.

```powershell
# Deploy the web application explicitly
azd deploy web
```

Do not use a bare `azd deploy` for routine web releases: the Function App uses a separate package-based deployment path and can stop the combined deployment before the web service is updated. See [`.github/prompts/deploy-production.prompt.md`](../.github/prompts/deploy-production.prompt.md) for the current production procedure.

Email delivery, triggers, consent controls, monitoring, and safe rollout are documented in [`docs/email-operations.md`](docs/email-operations.md).

## API reference

MSF integration work should begin with:

- [`../msf-api/msf-api.yaml`](../msf-api/msf-api.yaml) — official OpenAPI snapshot
- [`../msf-api/msf-api-undocumented.md`](../msf-api/msf-api-undocumented.md) — verified undocumented scopes, endpoints, response fields, and operational behavior
- [`src/lib/msf-api.ts`](src/lib/msf-api.ts) — shared server-side client

Player endpoints require a commander OAuth token. Game-wide endpoints use a server token. Both request classes also require the MSF API key.

## License

See the repository [MIT License](../LICENSE).
