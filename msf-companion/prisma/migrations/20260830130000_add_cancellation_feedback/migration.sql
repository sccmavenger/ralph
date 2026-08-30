CREATE TABLE "CancellationFeedbackCase" (
  "id" TEXT NOT NULL,
  "commanderId" TEXT,
  "cancellationKey" TEXT NOT NULL,
  "stripeSubscriptionId" TEXT NOT NULL,
  "cancellationRequestedAt" TIMESTAMP(3) NOT NULL,
  "cancellationEffectiveAt" TIMESTAMP(3),
  "cancellationReversedAt" TIMESTAMP(3),
  "scheduledAt" TIMESTAMP(3) NOT NULL,
  "outreachStatus" TEXT NOT NULL DEFAULT 'queued',
  "suppressionReason" TEXT,
  "reviewStatus" TEXT NOT NULL DEFAULT 'awaiting_response',
  "primaryReason" TEXT,
  "theme" TEXT,
  "assignedTo" TEXT,
  "adminNotes" TEXT,
  "actionSummary" TEXT,
  "actionUrl" TEXT,
  "firstRespondedAt" TIMESTAMP(3),
  "actionedAt" TIMESTAMP(3),
  "closedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CancellationFeedbackCase_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CancellationFeedbackResponse" (
  "id" TEXT NOT NULL,
  "caseId" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "reason" TEXT,
  "body" TEXT,
  "dedupeKey" TEXT,
  "providerEmailId" TEXT,
  "senderHash" TEXT,
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CancellationFeedbackResponse_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CancellationFeedbackCase_cancellationKey_key"
  ON "CancellationFeedbackCase"("cancellationKey");
CREATE INDEX "CancellationFeedbackCase_outreachStatus_scheduledAt_idx"
  ON "CancellationFeedbackCase"("outreachStatus", "scheduledAt");
CREATE INDEX "CancellationFeedbackCase_reviewStatus_updatedAt_idx"
  ON "CancellationFeedbackCase"("reviewStatus", "updatedAt");
CREATE INDEX "CancellationFeedbackCase_primaryReason_firstRespondedAt_idx"
  ON "CancellationFeedbackCase"("primaryReason", "firstRespondedAt");
CREATE INDEX "CancellationFeedbackCase_subscription_reversed_idx"
  ON "CancellationFeedbackCase"("stripeSubscriptionId", "cancellationReversedAt");

CREATE UNIQUE INDEX "CancellationFeedbackResponse_dedupeKey_key"
  ON "CancellationFeedbackResponse"("dedupeKey");
CREATE UNIQUE INDEX "CancellationFeedbackResponse_providerEmailId_key"
  ON "CancellationFeedbackResponse"("providerEmailId");
CREATE INDEX "CancellationFeedbackResponse_caseId_receivedAt_idx"
  ON "CancellationFeedbackResponse"("caseId", "receivedAt");

ALTER TABLE "CancellationFeedbackCase"
  ADD CONSTRAINT "CancellationFeedbackCase_commanderId_fkey"
  FOREIGN KEY ("commanderId") REFERENCES "Commander"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CancellationFeedbackResponse"
  ADD CONSTRAINT "CancellationFeedbackResponse_caseId_fkey"
  FOREIGN KEY ("caseId") REFERENCES "CancellationFeedbackCase"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- The former scheduled win-back was sales-oriented and is replaced by this
-- feedback-only workflow. Mark any not-yet-delivered rows complete so an old
-- deployment cannot send both messages during rollout.
UPDATE "ChurnIntervention"
SET "delivered" = true
WHERE "type" = 'win-back' AND "delivered" = false;
