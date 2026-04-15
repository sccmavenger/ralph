-- CreateTable
CREATE TABLE "DailyTip" (
    "id" TEXT NOT NULL,
    "commanderId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "sourceCreatorName" TEXT,
    "sourceUrl" TEXT,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dismissedAt" TIMESTAMP(3),

    CONSTRAINT "DailyTip_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DailyTip_commanderId_idx" ON "DailyTip"("commanderId");

-- AddForeignKey
ALTER TABLE "DailyTip" ADD CONSTRAINT "DailyTip_commanderId_fkey" FOREIGN KEY ("commanderId") REFERENCES "Commander"("id") ON DELETE CASCADE ON UPDATE CASCADE;
