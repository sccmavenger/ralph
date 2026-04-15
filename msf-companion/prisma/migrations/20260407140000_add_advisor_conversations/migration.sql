-- CreateTable
CREATE TABLE "AdvisorConversation" (
    "id" TEXT NOT NULL,
    "commanderId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdvisorConversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdvisorMessage" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "confidenceScore" INTEGER,
    "sourceCitations" JSONB,
    "tokenCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdvisorMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AdvisorConversation_commanderId_idx" ON "AdvisorConversation"("commanderId");

-- CreateIndex
CREATE INDEX "AdvisorMessage_conversationId_idx" ON "AdvisorMessage"("conversationId");

-- AddForeignKey
ALTER TABLE "AdvisorConversation" ADD CONSTRAINT "AdvisorConversation_commanderId_fkey" FOREIGN KEY ("commanderId") REFERENCES "Commander"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdvisorMessage" ADD CONSTRAINT "AdvisorMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "AdvisorConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
