-- CreateTable
CREATE TABLE "AiActionItem" (
    "id" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "priority" TEXT NOT NULL DEFAULT 'medium',
    "status" TEXT NOT NULL DEFAULT 'open',
    "owner" TEXT,
    "notes" TEXT,
    "actionUrl" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiActionItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AiActionItem_sourceType_sourceId_key"
    ON "AiActionItem"("sourceType", "sourceId");

-- CreateIndex
CREATE INDEX "AiActionItem_status_updatedAt_idx"
    ON "AiActionItem"("status", "updatedAt");

-- CreateIndex
CREATE INDEX "AdvisorQuestionLog_createdAt_idx"
    ON "AdvisorQuestionLog"("createdAt");

-- CreateIndex
CREATE INDEX "AdvisorQuestionLog_category_createdAt_idx"
    ON "AdvisorQuestionLog"("category", "createdAt");

-- CreateIndex
CREATE INDEX "AdvisorQuestionLog_answeredSuccessfully_createdAt_idx"
    ON "AdvisorQuestionLog"("answeredSuccessfully", "createdAt");

-- CreateIndex
CREATE INDEX "AdvisorMessage_role_createdAt_idx"
    ON "AdvisorMessage"("role", "createdAt");

-- CreateIndex
CREATE INDEX "AdvisorMessage_feedback_createdAt_idx"
    ON "AdvisorMessage"("feedback", "createdAt");

-- CreateIndex
CREATE INDEX "DailyTokenUsage_date_idx"
    ON "DailyTokenUsage"("date");

-- CreateIndex
CREATE INDEX "KnowledgeGap_status_createdAt_idx"
    ON "KnowledgeGap"("status", "createdAt");

-- CreateIndex
CREATE INDEX "KnowledgeGap_status_frequency_idx"
    ON "KnowledgeGap"("status", "frequency");
