---
description: "Deploy MSF-Companion to production (Azure Container Apps) with database migrations"
mode: "agent"
---

# Deploy MSF-Companion to Production

Navigate to the `msf-companion` folder and deploy the **`web`** service (Next.js Container App) to the live production site. Handle database migrations if any are pending.

## Architecture context

`azure.yaml` defines two services:

- **`web`** — Next.js app, hosted on Azure Container Apps. **This is what you deploy here.** All app code changes ship via this service.
- **`functions`** — Azure Functions side-service. It is configured with `WEBSITE_RUN_FROM_PACKAGE=<remote-url>` (immutable ZIP from blob storage). The SCM zipdeploy endpoint returns **HTTP 409** for this app by design, so a bare `azd deploy` will fail on the functions service before it ever reaches `web`.

**Always deploy `web` explicitly. Never run a bare `azd deploy` here.**

## Steps

1. **Navigate to msf-companion**:
   ```powershell
   cd c:\GitHub_Projects\ralph\msf-companion
   ```

2. **Check for pending Prisma migrations**:
   ```powershell
   npx prisma migrate status
   ```
   - If `DATABASE_URL` points to the local dev database (`localhost:5432`), this only validates that the migration set is internally consistent — it does NOT prove production is up to date. Flag this in the output but proceed.
   - If there are **pending migrations**, run `npx prisma migrate deploy` FIRST against the production `DATABASE_URL`.
   - If **no pending migrations**, skip the deploy step.

3. **Deploy the `web` service to Azure**:
   ```powershell
   azd deploy web
   ```
   This builds the Docker image (remote build in ACR per `azure.yaml`), pushes it, and updates the Azure Container App revision. Allow 5–15 minutes for the full build + push + revision activation.

4. **Verify deployment** — confirm `azd deploy web` exits with code 0 and report the endpoint URL printed at the end. Optionally curl the endpoint to confirm HTTP 200.

## Important notes

- **DO NOT run `azd deploy` (bare).** It will try to deploy the `functions` service first, hit HTTP 409 from `WEBSITE_RUN_FROM_PACKAGE`, and abort before touching `web`. This is a known and intentional config of the functions app — do not toggle the setting to work around it.
- If function-app code changes are ever needed, they ship out-of-band by updating the remote ZIP at the URL set in `WEBSITE_RUN_FROM_PACKAGE`, then restarting the Function App. That workflow is **not** part of this prompt.
- The `DATABASE_URL` env var must point at production PostgreSQL when running `npx prisma migrate deploy`. Check this before running migrations.
- Prisma migrations apply forward only and use a migration lock — safe to re-run.
- If `azd deploy web` fails, report the error verbatim and **do not retry automatically**. Common recovery: rollback via `az containerapp revision list -g <rg> -n <app>` and `az containerapp revision activate`.
- If azd reports its version is out of date, mention it in the report but do not auto-upgrade.
