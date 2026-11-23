-- AlterEnum
ALTER TYPE "LeadSource" ADD VALUE 'web';

-- AlterTable
ALTER TABLE "LeadProfile" ADD COLUMN     "webSearchDay" TEXT,
ADD COLUMN     "webSearches" INTEGER NOT NULL DEFAULT 0;

