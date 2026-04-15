-- CreateTable
CREATE TABLE "DailyTokenUsage" (
    "id" TEXT NOT NULL,
    "commanderId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "tokensUsed" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "DailyTokenUsage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DailyTokenUsage_commanderId_idx" ON "DailyTokenUsage"("commanderId");

-- CreateIndex
CREATE UNIQUE INDEX "DailyTokenUsage_commanderId_date_key" ON "DailyTokenUsage"("commanderId", "date");

-- AddForeignKey
ALTER TABLE "DailyTokenUsage" ADD CONSTRAINT "DailyTokenUsage_commanderId_fkey" FOREIGN KEY ("commanderId") REFERENCES "Commander"("id") ON DELETE CASCADE ON UPDATE CASCADE;
