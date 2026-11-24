-- CreateEnum
CREATE TYPE "LeadStage" AS ENUM ('new', 'researching', 'contacted', 'replied', 'meeting', 'proposal', 'won', 'lost', 'not_a_fit');

-- CreateEnum
CREATE TYPE "LeadSource" AS ENUM ('inbox', 'procurement', 'form', 'manual', 'import');

-- CreateEnum
CREATE TYPE "LeadFit" AS ENUM ('strong', 'possible', 'poor');

-- CreateTable
CREATE TABLE "LeadProfile" (
    "userId" TEXT NOT NULL,
    "offer" TEXT NOT NULL,
    "idealCustomer" TEXT NOT NULL,
    "industries" TEXT[],
    "regions" TEXT[],
    "roles" TEXT[],
    "excludedDomains" TEXT[],
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeadProfile_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "Lead" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT,
    "title" TEXT,
    "company" TEXT,
    "domain" TEXT,
    "website" TEXT,
    "phone" TEXT,
    "location" TEXT,
    "source" "LeadSource" NOT NULL,
    "sourceRef" TEXT,
    "sourceDetail" TEXT,
    "stage" "LeadStage" NOT NULL DEFAULT 'new',
    "score" INTEGER,
    "fit" "LeadFit",
    "fitReason" TEXT,
    "nextStep" TEXT,
    "scoredAt" TIMESTAMP(3),
    "notes" TEXT,
    "tags" TEXT[],
    "emailsIn" INTEGER NOT NULL DEFAULT 0,
    "emailsOut" INTEGER NOT NULL DEFAULT 0,
    "lastContactAt" TIMESTAMP(3),
    "doNotContact" BOOLEAN NOT NULL DEFAULT false,
    "consent" BOOLEAN NOT NULL DEFAULT false,
    "attribution" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadActivity" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeadActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadForm" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "intro" TEXT,
    "thankYou" TEXT,
    "askCompany" BOOLEAN NOT NULL DEFAULT true,
    "askPhone" BOOLEAN NOT NULL DEFAULT false,
    "askMessage" BOOLEAN NOT NULL DEFAULT true,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "submissions" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeadForm_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Lead_userId_stage_idx" ON "Lead"("userId", "stage");

-- CreateIndex
CREATE INDEX "Lead_userId_score_idx" ON "Lead"("userId", "score");

-- CreateIndex
CREATE UNIQUE INDEX "Lead_userId_email_key" ON "Lead"("userId", "email");

-- CreateIndex
CREATE INDEX "LeadActivity_leadId_createdAt_idx" ON "LeadActivity"("leadId", "createdAt");

-- CreateIndex
CREATE INDEX "LeadForm_userId_idx" ON "LeadForm"("userId");

-- AddForeignKey
ALTER TABLE "LeadProfile" ADD CONSTRAINT "LeadProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadActivity" ADD CONSTRAINT "LeadActivity_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadForm" ADD CONSTRAINT "LeadForm_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

