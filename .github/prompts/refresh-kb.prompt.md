---
description: Refresh the MSF Companion knowledge base from YouTube (run locally — YouTube blocks transcript fetches from Azure IPs)
mode: agent
---

Refresh the knowledge base by running the local `kb:refresh` script.

Steps:
1. Confirm `msf-companion/.env` has a non-empty `YOUTUBE_API_KEY`. If missing, copy it from `msf-companion/.env.local` (if that file exists) and warn the user if neither has it.
2. Run `npm run kb:refresh` from `msf-companion/`. Stream the output.
3. When the script completes, summarize the result: how many new videos were found, how many were ingested, how many were skipped and why (e.g., "no transcript available"), and whether any creators are flagged stale.
4. If `documentsUploaded > 0`, remind the user the new content is now live in Azure AI Search and the AI advisor will pick it up immediately.

Do NOT touch the Container App Job (`caj-kb-sync`) — that runs in Azure and is known to skip all videos due to YouTube blocking cloud IPs. Local refresh is the canonical mechanism.

If the user passes `--full` in their request, use `npm run kb:refresh:full` instead.
If the user just wants status, use `npm run kb:refresh:status`.
