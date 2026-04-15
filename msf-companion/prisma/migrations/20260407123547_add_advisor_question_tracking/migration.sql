-- AlterTable
ALTER TABLE "Commander" ADD COLUMN "advisorQuestionsToday" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Commander" ADD COLUMN "advisorQuestionsResetAt" TIMESTAMP(3);
