---
description: "Deploy MSF-Companion to production (Azure Container Apps) with database migrations"
mode: "agent"
---

# Deploy MSF-Companion to Production

Navigate to the `msf-companion` folder and deploy to the live production site. Handle database migrations if any are pending.

## Steps

1. **Navigate to msf-companion**:
   ```
   cd c:\GitHub_Projects\ralph\msf-companion
   ```

2. **Check for pending Prisma migrations** by comparing the local `prisma/migrations` folder against the production database. Run:
   ```
   npx prisma migrate status
   ```
   - If there are **pending migrations**, run `npx prisma migrate deploy` FIRST (this applies migrations to the production PostgreSQL database using the `DATABASE_URL` environment variable).
   - If **no pending migrations**, skip this step.

3. **Deploy to Azure** using azd:
   ```
   azd deploy
   ```
   This builds the Docker container, pushes it to ACR, and updates the Azure Container App with the new image.

4. **Verify deployment** — confirm the `azd deploy` command exits successfully (exit code 0). Report the deployment outcome.

## Important Notes

- The `DATABASE_URL` env var must be set pointing to the production PostgreSQL instance for migrations to target the correct database.
- Prisma migrations are safe to run — they only apply forward (never destructive) and use a migration lock to prevent conflicts.
- If `prisma migrate status` shows the database is already up to date, just proceed with `azd deploy`.
- If `azd deploy` fails, report the error — do NOT retry automatically.
