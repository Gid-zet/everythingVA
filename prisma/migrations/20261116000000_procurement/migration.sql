-- CreateEnum
CREATE TYPE "public"."WorkspaceRole" AS ENUM ('owner', 'admin', 'editor', 'viewer');

-- CreateEnum
CREATE TYPE "public"."VerificationStatus" AS ENUM ('unverified', 'verified', 'expired', 'rejected');

-- CreateEnum
CREATE TYPE "public"."CredentialKind" AS ENUM ('certification', 'registration', 'insurance', 'contract_vehicle', 'license', 'other');

-- CreateEnum
CREATE TYPE "public"."DocumentCategory" AS ENUM ('capability_statement', 'certification', 'business_registration', 'tax_supplier', 'insurance', 'past_proposal', 'case_study', 'staff_bio', 'resume', 'project_reference', 'pricing', 'policy', 'template', 'past_performance', 'other');

-- CreateEnum
CREATE TYPE "public"."DocumentAccess" AS ENUM ('all_members', 'admins_only');

-- CreateEnum
CREATE TYPE "public"."OpportunitySource" AS ENUM ('sam_gov', 'canadabuys', 'manual');

-- CreateEnum
CREATE TYPE "public"."OpportunityStatus" AS ENUM ('discovered', 'under_review', 'qualified', 'awaiting_decision', 'approved_to_pursue', 'proposal_in_progress', 'awaiting_information', 'awaiting_approval', 'ready_for_submission', 'submitted', 'under_evaluation', 'awarded', 'unsuccessful', 'withdrawn', 'declined');

-- CreateEnum
CREATE TYPE "public"."EligibilityStatus" AS ENUM ('qualified', 'potentially_qualified', 'requires_clarification', 'not_qualified');

-- CreateEnum
CREATE TYPE "public"."BidRecommendation" AS ENUM ('strongly_recommend', 'consider', 'do_not_pursue');

-- CreateEnum
CREATE TYPE "public"."AuditActor" AS ENUM ('user', 'ai', 'system');

-- CreateTable
CREATE TABLE "public"."ProcurementWorkspace" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProcurementWorkspace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."WorkspaceMember" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "public"."WorkspaceRole" NOT NULL DEFAULT 'editor',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkspaceMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."CompanyProfile" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "legalName" TEXT NOT NULL,
    "website" TEXT,
    "summary" TEXT NOT NULL,
    "services" TEXT[],
    "keywords" TEXT[],
    "excludedKeywords" TEXT[],
    "naicsCodes" TEXT[],
    "unspscCodes" TEXT[],
    "businessTypes" TEXT[],
    "countries" TEXT[],
    "serviceRegions" TEXT[],
    "yearsInBusiness" INTEGER,
    "governmentExperience" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Credential" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "public"."CredentialKind" NOT NULL DEFAULT 'certification',
    "issuer" TEXT,
    "identifier" TEXT,
    "issuedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "status" "public"."VerificationStatus" NOT NULL DEFAULT 'unverified',
    "verifiedBy" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "notes" TEXT,
    "documentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Credential_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."KnowledgeDocument" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "public"."DocumentCategory" NOT NULL DEFAULT 'other',
    "fileName" TEXT,
    "mimeType" TEXT,
    "sizeBytes" INTEGER,
    "text" TEXT NOT NULL,
    "uploadedBy" TEXT,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "status" "public"."VerificationStatus" NOT NULL DEFAULT 'unverified',
    "verifiedBy" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "access" "public"."DocumentAccess" NOT NULL DEFAULT 'all_members',
    "version" INTEGER NOT NULL DEFAULT 1,
    "isLatest" BOOLEAN NOT NULL DEFAULT true,
    "previousVersionId" TEXT,

    CONSTRAINT "KnowledgeDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Opportunity" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "source" "public"."OpportunitySource" NOT NULL,
    "externalId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "organization" TEXT,
    "referenceNumber" TEXT,
    "solicitationNumber" TEXT,
    "noticeType" TEXT,
    "sourceUrl" TEXT NOT NULL,
    "discoveredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "postedAt" TIMESTAMP(3),
    "deadline" TIMESTAMP(3),
    "estimatedValue" DOUBLE PRECISION,
    "currency" TEXT,
    "country" TEXT,
    "placeOfPerformance" TEXT,
    "setAside" TEXT,
    "classificationCodes" TEXT[],
    "description" TEXT,
    "descriptionUrl" TEXT,
    "attachments" JSONB,
    "contacts" JSONB,
    "amendmentNumber" TEXT,
    "amendedAt" TIMESTAMP(3),
    "relevance" INTEGER NOT NULL DEFAULT 0,
    "matchedKeywords" TEXT[],
    "status" "public"."OpportunityStatus" NOT NULL DEFAULT 'discovered',
    "fitScore" INTEGER,
    "eligibility" "public"."EligibilityStatus",
    "recommendation" "public"."BidRecommendation",
    "qualification" JSONB,
    "qualifiedAt" TIMESTAMP(3),
    "ownerId" TEXT,
    "followUpAt" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3),
    "submissionReference" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Opportunity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ProcurementTask" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "opportunityId" TEXT,
    "title" TEXT NOT NULL,
    "dueAt" TIMESTAMP(3),
    "done" BOOLEAN NOT NULL DEFAULT false,
    "assigneeId" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProcurementTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."DiscoveryRun" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "source" "public"."OpportunitySource" NOT NULL,
    "trigger" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "scanned" INTEGER NOT NULL DEFAULT 0,
    "created" INTEGER NOT NULL DEFAULT 0,
    "updated" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,

    CONSTRAINT "DiscoveryRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."AuditLog" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "opportunityId" TEXT,
    "actor" "public"."AuditActor" NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "detail" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WorkspaceMember_userId_idx" ON "public"."WorkspaceMember"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkspaceMember_workspaceId_userId_key" ON "public"."WorkspaceMember"("workspaceId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "CompanyProfile_workspaceId_key" ON "public"."CompanyProfile"("workspaceId");

-- CreateIndex
CREATE INDEX "Credential_workspaceId_idx" ON "public"."Credential"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "KnowledgeDocument_previousVersionId_key" ON "public"."KnowledgeDocument"("previousVersionId");

-- CreateIndex
CREATE INDEX "KnowledgeDocument_workspaceId_isLatest_idx" ON "public"."KnowledgeDocument"("workspaceId", "isLatest");

-- CreateIndex
CREATE INDEX "Opportunity_workspaceId_status_idx" ON "public"."Opportunity"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "Opportunity_workspaceId_deadline_idx" ON "public"."Opportunity"("workspaceId", "deadline");

-- CreateIndex
CREATE UNIQUE INDEX "Opportunity_workspaceId_source_externalId_key" ON "public"."Opportunity"("workspaceId", "source", "externalId");

-- CreateIndex
CREATE INDEX "ProcurementTask_workspaceId_done_idx" ON "public"."ProcurementTask"("workspaceId", "done");

-- CreateIndex
CREATE INDEX "DiscoveryRun_workspaceId_startedAt_idx" ON "public"."DiscoveryRun"("workspaceId", "startedAt");

-- CreateIndex
CREATE INDEX "AuditLog_workspaceId_createdAt_idx" ON "public"."AuditLog"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_opportunityId_idx" ON "public"."AuditLog"("opportunityId");

-- AddForeignKey
ALTER TABLE "public"."WorkspaceMember" ADD CONSTRAINT "WorkspaceMember_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."ProcurementWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WorkspaceMember" ADD CONSTRAINT "WorkspaceMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CompanyProfile" ADD CONSTRAINT "CompanyProfile_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."ProcurementWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Credential" ADD CONSTRAINT "Credential_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."ProcurementWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Credential" ADD CONSTRAINT "Credential_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "public"."KnowledgeDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."KnowledgeDocument" ADD CONSTRAINT "KnowledgeDocument_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."ProcurementWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."KnowledgeDocument" ADD CONSTRAINT "KnowledgeDocument_previousVersionId_fkey" FOREIGN KEY ("previousVersionId") REFERENCES "public"."KnowledgeDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Opportunity" ADD CONSTRAINT "Opportunity_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."ProcurementWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ProcurementTask" ADD CONSTRAINT "ProcurementTask_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."ProcurementWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ProcurementTask" ADD CONSTRAINT "ProcurementTask_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "public"."Opportunity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DiscoveryRun" ADD CONSTRAINT "DiscoveryRun_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."ProcurementWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AuditLog" ADD CONSTRAINT "AuditLog_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."ProcurementWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AuditLog" ADD CONSTRAINT "AuditLog_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "public"."Opportunity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

