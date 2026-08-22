-- Per-category email preferences and consent provenance.
ALTER TABLE "Commander"
  ADD COLUMN "emailWeeklyDigest" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "emailNewCharacters" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "emailAnnouncements" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "emailReengagement" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "emailConsentAt" TIMESTAMP(3),
  ADD COLUMN "emailConsentSource" TEXT;

-- Preserve the intent of the legacy global opt-out for existing commanders.
UPDATE "Commander"
SET
  "emailWeeklyDigest" = false,
  "emailNewCharacters" = false,
  "emailAnnouncements" = false,
  "emailReengagement" = false
WHERE "emailDigestOptOut" = true;

-- Existing addresses predate consent provenance. Record that explicitly rather
-- than presenting an inferred timestamp as a newly collected consent event.
UPDATE "Commander"
SET "emailConsentSource" = 'legacy'
WHERE email IS NOT NULL AND email <> '';

-- This model existed in the Prisma schema but never received a migration.
CREATE TABLE "ChurnIntervention" (
  "id" TEXT NOT NULL,
  "commanderId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "channel" TEXT NOT NULL,
  "riskScore" INTEGER,
  "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "scheduledAt" TIMESTAMP(3),
  "delivered" BOOLEAN NOT NULL DEFAULT false,
  "sourceEventId" TEXT,
  CONSTRAINT "ChurnIntervention_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EmailDelivery" (
  "id" TEXT NOT NULL,
  "commanderId" TEXT,
  "recipientHash" TEXT NOT NULL,
  "messageType" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "provider" TEXT NOT NULL DEFAULT 'resend',
  "providerMessageId" TEXT,
  "idempotencyKey" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "lastError" TEXT,
  "metadata" JSONB,
  "sentAt" TIMESTAMP(3),
  "deliveredAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EmailDelivery_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StripeWebhookEvent" (
  "id" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'processing',
  "attempts" INTEGER NOT NULL DEFAULT 1,
  "lastError" TEXT,
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processedAt" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StripeWebhookEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ChurnIntervention_sourceEventId_key" ON "ChurnIntervention"("sourceEventId");
CREATE INDEX "ChurnIntervention_commanderId_type_sentAt_idx" ON "ChurnIntervention"("commanderId", "type", "sentAt");
CREATE INDEX "ChurnIntervention_scheduledAt_delivered_idx" ON "ChurnIntervention"("scheduledAt", "delivered");

CREATE UNIQUE INDEX "EmailDelivery_providerMessageId_key" ON "EmailDelivery"("providerMessageId");
CREATE UNIQUE INDEX "EmailDelivery_idempotencyKey_key" ON "EmailDelivery"("idempotencyKey");
CREATE INDEX "EmailDelivery_commanderId_messageType_createdAt_idx" ON "EmailDelivery"("commanderId", "messageType", "createdAt");
CREATE INDEX "EmailDelivery_status_createdAt_idx" ON "EmailDelivery"("status", "createdAt");
CREATE INDEX "EmailDelivery_recipientHash_createdAt_idx" ON "EmailDelivery"("recipientHash", "createdAt");
CREATE INDEX "StripeWebhookEvent_status_receivedAt_idx" ON "StripeWebhookEvent"("status", "receivedAt");

ALTER TABLE "ChurnIntervention"
  ADD CONSTRAINT "ChurnIntervention_commanderId_fkey"
  FOREIGN KEY ("commanderId") REFERENCES "Commander"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EmailDelivery"
  ADD CONSTRAINT "EmailDelivery_commanderId_fkey"
  FOREIGN KEY ("commanderId") REFERENCES "Commander"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
