-- DropForeignKey
ALTER TABLE "InventorySnapshot" DROP CONSTRAINT "InventorySnapshot_commanderId_fkey";

-- DropForeignKey
ALTER TABLE "RosterSnapshot" DROP CONSTRAINT "RosterSnapshot_commanderId_fkey";

-- AlterTable
ALTER TABLE "Commander" ADD COLUMN     "disabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "lastLoginAt" TIMESTAMP(3);

-- AddForeignKey
ALTER TABLE "RosterSnapshot" ADD CONSTRAINT "RosterSnapshot_commanderId_fkey" FOREIGN KEY ("commanderId") REFERENCES "Commander"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventorySnapshot" ADD CONSTRAINT "InventorySnapshot_commanderId_fkey" FOREIGN KEY ("commanderId") REFERENCES "Commander"("id") ON DELETE CASCADE ON UPDATE CASCADE;
