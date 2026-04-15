-- CreateTable
CREATE TABLE "AdvisorQuestionLog" (
    "id" TEXT NOT NULL,
    "commanderId" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "confidenceScore" INTEGER NOT NULL,
    "answeredSuccessfully" BOOLEAN NOT NULL,
    "knowledgeSourcesUsed" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdvisorQuestionLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AdvisorQuestionLog_commanderId_idx" ON "AdvisorQuestionLog"("commanderId");

-- CreateIndex
CREATE INDEX "AdvisorQuestionLog_answeredSuccessfully_idx" ON "AdvisorQuestionLog"("answeredSuccessfully");

-- AddForeignKey
ALTER TABLE "AdvisorQuestionLog" ADD CONSTRAINT "AdvisorQuestionLog_commanderId_fkey" FOREIGN KEY ("commanderId") REFERENCES "Commander"("id") ON DELETE CASCADE ON UPDATE CASCADE;
