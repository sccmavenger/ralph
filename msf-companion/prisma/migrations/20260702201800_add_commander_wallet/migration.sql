-- CreateTable
CREATE TABLE "CommanderWallet" (
    "id" TEXT NOT NULL,
    "commanderId" TEXT NOT NULL,
    "gold" INTEGER NOT NULL DEFAULT 0,
    "cores" INTEGER NOT NULL DEFAULT 0,
    "confirmedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommanderWallet_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CommanderWallet_commanderId_key" ON "CommanderWallet"("commanderId");

-- Enforce non-negative balances at the database level
ALTER TABLE "CommanderWallet" ADD CONSTRAINT "CommanderWallet_gold_non_negative" CHECK ("gold" >= 0);
ALTER TABLE "CommanderWallet" ADD CONSTRAINT "CommanderWallet_cores_non_negative" CHECK ("cores" >= 0);

-- AddForeignKey
ALTER TABLE "CommanderWallet" ADD CONSTRAINT "CommanderWallet_commanderId_fkey" FOREIGN KEY ("commanderId") REFERENCES "Commander"("id") ON DELETE CASCADE ON UPDATE CASCADE;
