-- CreateTable
CREATE TABLE "CommanderNotification" (
    "id" TEXT NOT NULL,
    "commanderId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "linkUrl" TEXT,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommanderNotification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CommanderNotification_commanderId_idx" ON "CommanderNotification"("commanderId");

-- CreateIndex
CREATE INDEX "CommanderNotification_read_idx" ON "CommanderNotification"("read");

-- AddForeignKey
ALTER TABLE "CommanderNotification" ADD CONSTRAINT "CommanderNotification_commanderId_fkey" FOREIGN KEY ("commanderId") REFERENCES "Commander"("id") ON DELETE CASCADE ON UPDATE CASCADE;
