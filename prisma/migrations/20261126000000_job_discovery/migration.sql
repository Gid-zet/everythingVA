-- AlterTable
ALTER TABLE "JobProfile" ADD COLUMN     "discoverDay" TEXT,
ADD COLUMN     "discoverEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "discoverRuns" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lastDiscoveredAt" TIMESTAMP(3),
ADD COLUMN     "remoteOnly" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "JobDiscovery" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "location" TEXT,
    "workMode" TEXT,
    "salary" TEXT,
    "description" TEXT,
    "postedAt" TIMESTAMP(3),
    "closesAt" TIMESTAMP(3),
    "matchScore" INTEGER,
    "matchSummary" TEXT,
    "keywordsMatched" TEXT[],
    "keywordsMissing" TEXT[],
    "status" TEXT NOT NULL DEFAULT 'new',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobDiscovery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "JobDiscovery_userId_status_createdAt_idx" ON "JobDiscovery"("userId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "JobDiscovery_userId_url_key" ON "JobDiscovery"("userId", "url");

-- AddForeignKey
ALTER TABLE "JobDiscovery" ADD CONSTRAINT "JobDiscovery_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

