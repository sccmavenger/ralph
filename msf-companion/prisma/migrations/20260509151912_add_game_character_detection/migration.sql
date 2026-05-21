-- AlterTable
ALTER TABLE "CommanderNotification" ADD COLUMN "metadata" JSONB;

-- CreateTable
CREATE TABLE "GameCharacter" (
    "id" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "traits" JSONB NOT NULL DEFAULT '[]',
    "firstDetectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GameCharacter_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GameCharacter_characterId_key" ON "GameCharacter"("characterId");

-- CreateIndex
CREATE INDEX "GameCharacter_characterId_idx" ON "GameCharacter"("characterId");
