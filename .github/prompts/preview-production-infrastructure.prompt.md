---
description: "Preview production Azure infrastructure safely without applying changes"
mode: "agent"
---

# Preview Production Infrastructure

Run a read-only infrastructure assessment for `msf-companion-prod`.

1. Confirm the Azure subscription is `Visual Studio Enterprise`
   (`b2b3abbb-0921-496b-8a0f-7433a31290f8`) and the location is `westus`.
2. Run `azd provision --preview --no-prompt` from `msf-companion`.
3. Classify every proposed create, modify, replace, and delete operation.
4. Treat PostgreSQL credential changes/replacement, Cosmos failover changes,
   Function App changes, and any deletion as blockers.
5. Save a secret-free summary in `.azure/deployment-plan.md`.
6. Do not provision. A full production apply requires separate explicit approval
   after a clean preview.

The production guard in `scripts/guard-infra-provision.ps1` is intentional. Do
not persist or set its override during a preview.
