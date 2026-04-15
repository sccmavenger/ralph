-- CreateTable
CREATE TABLE "Commander" (
    "id" TEXT NOT NULL,
    "scopelyId" TEXT NOT NULL,
    "email" TEXT,
    "displayName" TEXT,
    "hasCompletedOnboarding" BOOLEAN NOT NULL DEFAULT false,
    "emailPromptDismissed" BOOLEAN NOT NULL DEFAULT false,
    "subscriptionTier" TEXT NOT NULL DEFAULT 'FREE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Commander_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RosterSnapshot" (
    "id" TEXT NOT NULL,
    "commanderId" TEXT NOT NULL,
    "snapshotData" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RosterSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventorySnapshot" (
    "id" TEXT NOT NULL,
    "commanderId" TEXT NOT NULL,
    "snapshotData" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventorySnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Commander_scopelyId_key" ON "Commander"("scopelyId");

-- CreateIndex
CREATE INDEX "RosterSnapshot_commanderId_idx" ON "RosterSnapshot"("commanderId");

-- CreateIndex
CREATE INDEX "InventorySnapshot_commanderId_idx" ON "InventorySnapshot"("commanderId");

-- AddForeignKey
ALTER TABLE "RosterSnapshot" ADD CONSTRAINT "RosterSnapshot_commanderId_fkey" FOREIGN KEY ("commanderId") REFERENCES "Commander"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventorySnapshot" ADD CONSTRAINT "InventorySnapshot_commanderId_fkey" FOREIGN KEY ("commanderId") REFERENCES "Commander"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
