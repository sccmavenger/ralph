-- AlterTable
ALTER TABLE "Commander" ADD COLUMN     "stripeCurrentPeriodEnd" TIMESTAMP(3),
ADD COLUMN     "stripeCustomerId" TEXT,
ADD COLUMN     "stripeSubscriptionId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Commander_stripeCustomerId_key" ON "Commander"("stripeCustomerId");

-- CreateIndex
CREATE UNIQUE INDEX "Commander_stripeSubscriptionId_key" ON "Commander"("stripeSubscriptionId");
