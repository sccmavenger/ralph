---
name: update-kb
description: "Update MSF Companion knowledge base: refresh KB locally, build, and deploy to Azure Container Apps. Use when: update kb, refresh kb, update msf kb, push kb."
user-invocable: true
---

# Ship MSF Companion

One-command deployment: refresh the knowledge base locally, then deploy to Azure.

---

## Steps

Execute these commands sequentially in the `msf-companion` directory:

1. **Refresh Knowledge Base** (fetches YouTube transcripts locally since YouTube blocks Azure IPs):
   ```
   cd c:\GitHub_Projects\ralph\msf-companion
   npx tsx scripts/refresh-kb.ts
   ```
   Report the results (videos processed, documents uploaded).

2. **Build** (verify everything compiles):
   ```
   npx next build
   ```
   If the build fails, stop and report the error.

3. **Deploy to Azure**:
   ```
   azd deploy
   ```
   Wait for deployment to complete and report the endpoint URL.

4. **Report Summary**:
   - KB refresh results (videos processed, docs uploaded)
   - Build status
   - Deploy status + endpoint URL

---

## Options

If the user says "full refresh" or "full deploy", use `--full` flag on the KB refresh:
```
npx tsx scripts/refresh-kb.ts --full
```

If the user says "just deploy" or "skip kb", skip step 1 and go straight to build + deploy.
