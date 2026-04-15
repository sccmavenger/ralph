-- Convert emailPromptDismissed boolean to emailPromptSkippedAt timestamp
-- If emailPromptDismissed was true, set emailPromptSkippedAt to now (they skipped before)
ALTER TABLE "Commander" ADD COLUMN "emailPromptSkippedAt" TIMESTAMP(3);

UPDATE "Commander" SET "emailPromptSkippedAt" = NOW() WHERE "emailPromptDismissed" = true;

ALTER TABLE "Commander" DROP COLUMN "emailPromptDismissed";
